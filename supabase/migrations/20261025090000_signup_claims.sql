-- M1.3 — One-time staff signup claims (D-26 addendum)
--
-- GoTrue inserts the auth.users row before it applies the `app_metadata`
-- passed to `auth.admin.createUser`. A BEFORE INSERT trigger therefore cannot
-- tell an invitation-backed user from a public signup by reading
-- `raw_app_meta_data`; at insert time it only contains provider metadata.
--
-- This migration replaces that unreliable check with a one-time claim:
--
--   1. `accept-staff-invite` reserves the invitation, then calls
--      `create_staff_signup_claim` (service role only) with the employee's
--      email, the invitation id, and the verified mobile.
--   2. The BEFORE INSERT trigger consumes exactly one unused, unexpired claim
--      for that email and records the new auth user id. Every other insert is
--      rejected with `public_signup_disabled`.
--   3. `handle_new_user` always creates a bare profile for the allowed insert:
--      viewer role, no branch, active. Roles and branches are assigned only by
--      the invitation completion RPC.
--
-- The claims table deliberately has no foreign key to `staff_invitations` so
-- SQL fixtures can insert claims without fabricating invitations. The RPC
-- validates the invitation before a production claim can be created.

-- ---------------------------------------------------------------------------
-- 1. One-time claims.
-- ---------------------------------------------------------------------------

create table if not exists public.staff_signup_claims (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invitation_id uuid,
  phone text,
  expires_at timestamptz not null default now() + interval '15 minutes',
  used_at timestamptz,
  used_user_id uuid,
  created_at timestamptz not null default now(),
  constraint staff_signup_claims_email_check
    check (
      email = lower(btrim(email))
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint staff_signup_claims_phone_check
    check (phone is null or phone ~ '^[0-9]{10,15}$')
);

create index if not exists staff_signup_claims_lookup_idx
  on public.staff_signup_claims (email, created_at desc);

create index if not exists staff_signup_claims_invitation_idx
  on public.staff_signup_claims (invitation_id);

alter table public.staff_signup_claims enable row level security;

revoke all on table public.staff_signup_claims from public, anon, authenticated;
grant select, insert, update, delete on table public.staff_signup_claims to service_role;

comment on table public.staff_signup_claims is
  'One-time, email-bound claims that allow a single auth.users insert. Service role only.';
comment on column public.staff_signup_claims.used_user_id is
  'Auth user created while consuming this claim; used for audit only.';

-- ---------------------------------------------------------------------------
-- 2. Service-role claim lifecycle RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.create_staff_signup_claim(
  claim_email text,
  claim_invitation_id uuid,
  claim_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_role text;
  normalized_email text := lower(btrim(coalesce(claim_email, '')));
  invitation public.staff_invitations;
  claim_id uuid;
begin
  caller_role := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role';

  if caller_role is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if normalized_email = ''
     or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  if claim_invitation_id is null then
    return jsonb_build_object('ok', false, 'error', 'invitation_not_found');
  end if;

  select * into invitation
  from public.staff_invitations as candidate
  where candidate.id = claim_invitation_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invitation_not_found');
  end if;

  if invitation.status <> 'processing'
     or invitation.claim_expires_at is null
     or invitation.claim_expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'invitation_not_processing');
  end if;

  if claim_phone is distinct from invitation.phone then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;

  -- A retry for the same email replaces any stale claim instead of stacking.
  delete from public.staff_signup_claims as existing
  where existing.email = normalized_email;

  insert into public.staff_signup_claims (email, invitation_id, phone)
  values (normalized_email, invitation.id, invitation.phone)
  returning id into claim_id;

  return jsonb_build_object('ok', true, 'claim_id', claim_id);
end;
$$;

comment on function public.create_staff_signup_claim(text, uuid, text) is
  'Service-role only: issues one short-lived signup claim for a reserved invitation.';

create or replace function public.delete_staff_signup_claim(
  claim_email text,
  claim_invitation_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_role text;
  normalized_email text := lower(btrim(coalesce(claim_email, '')));
  deleted_count integer;
begin
  caller_role := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role';

  if caller_role is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  delete from public.staff_signup_claims as claim
  where claim.email = normalized_email
    and (claim_invitation_id is null or claim.invitation_id = claim_invitation_id);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function public.delete_staff_signup_claim(text, uuid) is
  'Service-role only: removes claims after a failed acceptance attempt.';

-- ---------------------------------------------------------------------------
-- 3. Consume a claim on every auth.users insert; reject everything else.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_staff_signup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_email text := lower(btrim(coalesce(new.email, '')));
  claim public.staff_signup_claims;
begin
  if normalized_email <> '' then
    select * into claim
    from public.staff_signup_claims as candidate
    where candidate.email = normalized_email
      and candidate.used_at is null
      and candidate.expires_at > now()
    order by candidate.created_at desc
    limit 1
    for update;

    if found then
      update public.staff_signup_claims
      set used_at = now(),
          used_user_id = new.id
      where id = claim.id;

      return new;
    end if;
  end if;

  raise exception 'public_signup_disabled' using errcode = '42501';
end;
$$;

comment on function public.enforce_staff_signup() is
  'Allows one auth.users insert per unused, unexpired staff signup claim. Rejects public signup.';

-- The trigger already exists from 20261025070000 and keeps pointing at this
-- function after `create or replace`. Only create it when missing so the
-- migration is safe on a database where auth hardening ran earlier.
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'auth.users'::regclass
      and tgname = 'enforce_staff_signup'
      and not tgisinternal
  ) then
    create trigger enforce_staff_signup
    before insert on auth.users
    for each row execute function public.enforce_staff_signup();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Fail-closed profile provisioning for the allowed insert.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'موظف'
    ),
    nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g'), ''),
    'viewer',
    null,
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates a bare profile for every claim-backed auth user. Never grants roles or branches.';

-- ---------------------------------------------------------------------------
-- 5. Grants: trigger helpers are never callable by clients.
-- ---------------------------------------------------------------------------

revoke all on function public.create_staff_signup_claim(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_staff_signup_claim(text, uuid, text)
  to service_role;

revoke all on function public.delete_staff_signup_claim(text, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_staff_signup_claim(text, uuid)
  to service_role;

revoke all on function public.enforce_staff_signup()
  from public, anon, authenticated, service_role;
revoke all on function public.handle_new_user()
  from public, anon, authenticated;
