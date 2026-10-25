-- M1.3 — One-time staff invitations (D-25)
--
-- A manager creates an invitation with the employee's name, mobile, role, and
-- branch. No email is stored at creation time. The returned token is shown
-- once, copied manually (WhatsApp), and never stored in plaintext.
--
-- Properties:
--   * 256-bit random token, SHA-256 hash at rest, unique.
--   * Bound to the normalized mobile number.
--   * Valid for 7 days, one use, at most 5 wrong-mobile attempts.
--   * Cancellable and regenerable by a manager in scope.
--   * Acceptance is claimed before the Auth user is created and completed in a
--     second service-role transaction. A failed acceptance releases the claim
--     and deletes the Auth user in the Edge Function.
--   * The public surface only exposes the employee name, masked mobile, roles,
--     branches, and status. The token is never echoed from the database.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Table.
-- ---------------------------------------------------------------------------

create table if not exists public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  full_name text not null,
  phone text not null,
  role_codes text[] not null,
  primary_role text not null,
  branch_ids uuid[] not null,
  default_branch_id uuid not null references public.branches (id) on delete restrict,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null default now() + interval '7 days',
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  accepted_user_id uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  last_attempt_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_invitations_full_name_check
    check (char_length(btrim(full_name)) between 2 and 120),
  constraint staff_invitations_phone_check
    check (phone ~ '^[0-9]{10,15}$'),
  constraint staff_invitations_roles_check
    check (cardinality(role_codes) between 1 and 20),
  constraint staff_invitations_branches_check
    check (cardinality(branch_ids) between 1 and 50),
  constraint staff_invitations_primary_role_check
    check (primary_role = any (role_codes)),
  constraint staff_invitations_default_branch_check
    check (default_branch_id = any (branch_ids)),
  constraint staff_invitations_attempts_check
    check (attempts >= 0 and max_attempts between 1 and 20),
  constraint staff_invitations_status_check
    check (status in ('pending', 'processing', 'accepted', 'cancelled', 'expired', 'locked'))
);

create index if not exists staff_invitations_status_idx
  on public.staff_invitations (status, expires_at);

create index if not exists staff_invitations_phone_idx
  on public.staff_invitations (phone);

create index if not exists staff_invitations_created_by_idx
  on public.staff_invitations (created_by, created_at desc);

drop trigger if exists staff_invitations_set_updated_at on public.staff_invitations;
create trigger staff_invitations_set_updated_at
before update on public.staff_invitations
for each row execute function public.set_updated_at();

alter table public.staff_invitations enable row level security;

revoke all on public.staff_invitations from public, anon, authenticated, service_role;

comment on table public.staff_invitations is
  'One-time, mobile-bound staff invitation tokens. Access only through security-definer RPCs.';
comment on column public.staff_invitations.token_hash is
  'SHA-256 of the one-time token. The plaintext token is returned once at creation/regeneration.';

-- ---------------------------------------------------------------------------
-- Internal helpers.
-- ---------------------------------------------------------------------------

create or replace function public._normalize_invitation_phone(input text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(regexp_replace(coalesce(input, ''), '\D', '', 'g'), '');
$$;

create or replace function public._hash_invitation_token(raw_token text)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select encode(extensions.digest(coalesce(raw_token, ''), 'sha256'), 'hex');
$$;

create or replace function public._staff_invitation_status(
  invitation_status text,
  invitation_expires_at timestamptz,
  invitation_attempts integer,
  invitation_max_attempts integer
)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when invitation_status = 'pending' and invitation_expires_at < now() then 'expired'
    when invitation_status = 'pending' and invitation_attempts >= invitation_max_attempts then 'locked'
    else invitation_status
  end;
$$;

create or replace function public._staff_invitation_effective_status(
  invitation public.staff_invitations
)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when invitation.status = 'processing'
      and (invitation.claim_expires_at is null or invitation.claim_expires_at <= now())
      then 'pending'
    else public._staff_invitation_status(
      invitation.status,
      invitation.expires_at,
      invitation.attempts,
      invitation.max_attempts
    )
  end;
$$;

create or replace function public._staff_invitation_roles(invitation_role_codes text[])
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('code', role.code, 'name', role.name_ar)
      order by role.code
    ),
    '[]'::jsonb
  )
  from public.roles as role
  where role.code = any (invitation_role_codes);
$$;

create or replace function public._staff_invitation_branches(invitation_branch_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', branch.id, 'code', branch.code, 'name', branch.name)
      order by branch.code
    ),
    '[]'::jsonb
  )
  from public.branches as branch
  where branch.id = any (invitation_branch_ids);
$$;

create or replace function public._staff_invitation_public_payload(
  invitation public.staff_invitations
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'invitation_id', invitation.id,
    'full_name', invitation.full_name,
    'phone_masked', regexp_replace(invitation.phone, '^(\d{3})\d+(\d{3})$', '\1*****\2'),
    'status', public._staff_invitation_effective_status(invitation),
    'can_accept', public._staff_invitation_effective_status(invitation) = 'pending',
    'roles', public._staff_invitation_roles(invitation.role_codes),
    'branches', public._staff_invitation_branches(invitation.branch_ids),
    'primary_role', invitation.primary_role,
    'default_branch_id', invitation.default_branch_id,
    'attempts_remaining', greatest(invitation.max_attempts - invitation.attempts, 0),
    'expires_at', invitation.expires_at,
    'created_at', invitation.created_at
  );
$$;

-- ---------------------------------------------------------------------------
-- Create. The caller must hold users.create and users.assign_role on every
-- selected branch. Only an owner can invite an owner.
-- ---------------------------------------------------------------------------

create or replace function public.create_staff_invitation(
  invite_full_name text,
  invite_phone text,
  invite_roles text[],
  invite_branch_ids uuid[],
  invite_default_branch_id uuid,
  invite_primary_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  actor uuid := auth.uid();
  normalized_name text := nullif(btrim(coalesce(invite_full_name, '')), '');
  normalized_phone text := public._normalize_invitation_phone(invite_phone);
  normalized_roles text[];
  normalized_branches uuid[];
  normalized_primary_role text := nullif(btrim(coalesce(invite_primary_role, '')), '');
  raw_token text;
  invitation public.staff_invitations;
begin
  if actor is null or not public.is_active_user() then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not public.has_permission('users.create') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if normalized_name is null or char_length(normalized_name) < 2 then
    raise exception 'full_name_required' using errcode = '22023';
  end if;

  if normalized_name is not null and char_length(normalized_name) > 120 then
    raise exception 'full_name_too_long' using errcode = '22023';
  end if;

  if normalized_phone is null or normalized_phone !~ '^[0-9]{10,15}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct btrim(requested_role) order by btrim(requested_role)), '{}'::text[])
  into normalized_roles
  from unnest(coalesce(invite_roles, '{}'::text[])) as requested_role
  where requested_role is not null
    and btrim(requested_role) <> '';

  select coalesce(array_agg(distinct requested_branch order by requested_branch), '{}'::uuid[])
  into normalized_branches
  from unnest(coalesce(invite_branch_ids, '{}'::uuid[])) as requested_branch
  where requested_branch is not null;

  if cardinality(normalized_roles) = 0 then
    raise exception 'roles_required' using errcode = '22023';
  end if;

  if cardinality(normalized_branches) = 0 then
    raise exception 'branches_required' using errcode = '22023';
  end if;

  if invite_default_branch_id is null
     or not (invite_default_branch_id = any (normalized_branches)) then
    raise exception 'invalid_default_branch' using errcode = '22023';
  end if;

  if normalized_primary_role is null
     or not (normalized_primary_role = any (normalized_roles)) then
    raise exception 'invalid_primary_role' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(normalized_roles) as requested(role_code)
    where not exists (
      select 1 from public.roles as role
      where role.code = requested.role_code and role.is_active
    )
  ) then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(normalized_branches) as requested(branch_id)
    where not exists (
      select 1 from public.branches as branch
      where branch.id = requested.branch_id and branch.is_active
    )
  ) then
    raise exception 'invalid_branch' using errcode = '22023';
  end if;

  if 'owner' = any (normalized_roles) and not public.is_owner() then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  if exists (
    select 1
    from unnest(normalized_branches) as requested(branch_id)
    where not public.has_permission('users.assign_role', requested.branch_id)
  ) then
    raise exception 'branch_out_of_scope' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.staff_invitations as existing
    where existing.phone = normalized_phone
      and existing.status in ('pending', 'processing')
      and existing.expires_at > now()
  ) then
    raise exception 'invitation_exists' using errcode = '23505';
  end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.staff_invitations (
    token_hash,
    full_name,
    phone,
    role_codes,
    primary_role,
    branch_ids,
    default_branch_id,
    status,
    expires_at,
    created_by
  )
  values (
    public._hash_invitation_token(raw_token),
    normalized_name,
    normalized_phone,
    normalized_roles,
    normalized_primary_role,
    normalized_branches,
    invite_default_branch_id,
    'pending',
    now() + interval '7 days',
    actor
  )
  returning * into invitation;

  insert into public.audit_logs (
    user_id,
    branch_id,
    action,
    table_name,
    record_id,
    new_data,
    created_by
  )
  values (
    actor,
    invite_default_branch_id,
    'user.invitation_created',
    'staff_invitations',
    invitation.id::text,
    jsonb_build_object(
      'full_name', normalized_name,
      'phone', normalized_phone,
      'roles', normalized_roles,
      'branch_ids', normalized_branches,
      'primary_role', normalized_primary_role,
      'default_branch_id', invite_default_branch_id,
      'expires_at', invitation.expires_at
    ),
    actor
  );

  return jsonb_build_object(
    'invitation_id', invitation.id,
    'token', raw_token,
    'expires_at', invitation.expires_at
  );
end;
$$;

comment on function public.create_staff_invitation(text, text, text[], uuid[], uuid, text) is
  'Creates a one-time, mobile-bound staff invitation and returns the plaintext token once.';

-- ---------------------------------------------------------------------------
-- Directory of invitations visible to the caller.
-- ---------------------------------------------------------------------------

create or replace function public.list_staff_invitations(search_text text default null)
returns table (
  invitation_id uuid,
  full_name text,
  phone text,
  status text,
  role_codes text[],
  primary_role text,
  branch_ids uuid[],
  default_branch_id uuid,
  roles jsonb,
  branches jsonb,
  attempts integer,
  max_attempts integer,
  expires_at timestamptz,
  created_at timestamptz,
  created_by_name text,
  accepted_at timestamptz,
  accepted_user_id uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    invitation.id as invitation_id,
    invitation.full_name,
    invitation.phone,
    public._staff_invitation_effective_status(invitation) as status,
    invitation.role_codes,
    invitation.primary_role,
    invitation.branch_ids,
    invitation.default_branch_id,
    public._staff_invitation_roles(invitation.role_codes) as roles,
    public._staff_invitation_branches(invitation.branch_ids) as branches,
    invitation.attempts,
    invitation.max_attempts,
    invitation.expires_at,
    invitation.created_at,
    creator.full_name as created_by_name,
    invitation.accepted_at,
    invitation.accepted_user_id
  from public.staff_invitations as invitation
  left join public.profiles as creator on creator.id = invitation.created_by
  where public.is_active_user()
    and public.has_permission('users.view')
    and invitation.status <> 'accepted'
    and (
      public.is_owner()
      or exists (
        select 1
        from unnest(invitation.branch_ids) as invited_branch(branch_id)
        where public.has_permission('users.view', invited_branch.branch_id)
      )
    )
    and (
      nullif(btrim(coalesce(search_text, '')), '') is null
      or invitation.full_name ilike '%' || btrim(search_text) || '%'
      or invitation.phone ilike '%' || btrim(search_text) || '%'
    )
  order by invitation.created_at desc
  limit 200;
$$;

comment on function public.list_staff_invitations(text) is
  'Lists non-accepted invitations visible to the caller. Never returns token hashes.';

-- ---------------------------------------------------------------------------
-- Public verification. No authentication: the token is the secret. The phone
-- is masked until the employee confirms it.
-- ---------------------------------------------------------------------------

create or replace function public.get_staff_invitation(invite_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  invitation public.staff_invitations;
begin
  if invite_token is null or invite_token !~ '^[a-f0-9]{64}$' then
    return null;
  end if;

  select * into invitation
  from public.staff_invitations as candidate
  where candidate.token_hash = public._hash_invitation_token(invite_token)
  limit 1;

  if not found then
    return null;
  end if;

  return public._staff_invitation_public_payload(invitation);
end;
$$;

comment on function public.get_staff_invitation(text) is
  'Public invitation preview. Returns masked mobile and no token data.';

create or replace function public.verify_staff_invitation(
  invite_token text,
  invite_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  invitation public.staff_invitations;
  normalized_phone text := public._normalize_invitation_phone(invite_phone);
  effective_status text;
  next_attempts integer;
begin
  -- Returns an envelope instead of raising on invalid input. Raising would
  -- roll back the attempt counter, which is exactly the security control we
  -- need to persist.
  if invite_token is null or invite_token !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invitation_not_found');
  end if;

  if normalized_phone is null or normalized_phone !~ '^[0-9]{10,15}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;

  select * into invitation
  from public.staff_invitations as candidate
  where candidate.token_hash = public._hash_invitation_token(invite_token)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invitation_not_found');
  end if;

  if invitation.status = 'accepted' then
    return jsonb_build_object('ok', false, 'error', 'invitation_used');
  end if;

  if invitation.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'invitation_cancelled');
  end if;

  effective_status := public._staff_invitation_status(
    invitation.status,
    invitation.expires_at,
    invitation.attempts,
    invitation.max_attempts
  );

  if effective_status = 'locked' then
    if invitation.status <> 'locked' then
      update public.staff_invitations
      set status = 'locked'
      where id = invitation.id;
    end if;

    return jsonb_build_object(
      'ok', false,
      'error', 'invitation_locked',
      'attempts_remaining', 0
    );
  end if;

  if effective_status = 'expired' then
    if invitation.status <> 'expired' then
      update public.staff_invitations
      set status = 'expired'
      where id = invitation.id;
    end if;

    return jsonb_build_object('ok', false, 'error', 'invitation_expired');
  end if;

  if invitation.status = 'processing'
     and invitation.claim_expires_at is not null
     and invitation.claim_expires_at > now() then
    return jsonb_build_object('ok', false, 'error', 'invitation_in_use');
  end if;

  if invitation.phone <> normalized_phone then
    next_attempts := invitation.attempts + 1;

    update public.staff_invitations
    set attempts = next_attempts,
        last_attempt_at = now(),
        status = case when next_attempts >= max_attempts then 'locked' else status end
    where id = invitation.id;

    if next_attempts >= invitation.max_attempts then
      return jsonb_build_object(
        'ok', false,
        'error', 'invitation_locked',
        'attempts_remaining', 0
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_phone',
      'attempts_remaining', invitation.max_attempts - next_attempts
    );
  end if;

  update public.staff_invitations
  set last_attempt_at = now()
  where id = invitation.id;

  return public._staff_invitation_public_payload(invitation) || jsonb_build_object(
    'ok', true,
    'phone_confirmed', true,
    'can_accept', true
  );
end;
$$;

comment on function public.verify_staff_invitation(text, text) is
  'Confirms the mobile bound to an invitation and counts wrong attempts (max 5).';

-- ---------------------------------------------------------------------------
-- Manager actions: cancel and regenerate.
-- ---------------------------------------------------------------------------

create or replace function public.cancel_staff_invitation(invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  invitation public.staff_invitations;
begin
  if actor is null or not public.is_active_user() then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if invitation_id is null then
    raise exception 'invitation_required' using errcode = '22023';
  end if;

  if not public.has_permission('users.create') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select * into invitation
  from public.staff_invitations as candidate
  where candidate.id = invitation_id
  for update;

  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from unnest(invitation.branch_ids) as invited_branch(branch_id)
    where not public.has_permission('users.create', invited_branch.branch_id)
  ) then
    raise exception 'branch_out_of_scope' using errcode = '42501';
  end if;

  if invitation.status = 'accepted' then
    raise exception 'invitation_already_accepted' using errcode = 'P0002';
  end if;

  if invitation.status = 'cancelled' then
    return jsonb_build_object('invitation_id', invitation.id, 'status', 'cancelled');
  end if;

  if invitation.status = 'processing'
     and invitation.claim_expires_at is not null
     and invitation.claim_expires_at > now() then
    raise exception 'invitation_in_use' using errcode = 'P0002';
  end if;

  update public.staff_invitations
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = actor,
      claimed_at = null,
      claim_expires_at = null
  where id = invitation.id;

  insert into public.audit_logs (
    user_id,
    branch_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    created_by
  )
  values (
    actor,
    invitation.default_branch_id,
    'user.invitation_cancelled',
    'staff_invitations',
    invitation.id::text,
    jsonb_build_object('status', invitation.status),
    jsonb_build_object('status', 'cancelled'),
    actor
  );

  return jsonb_build_object('invitation_id', invitation.id, 'status', 'cancelled');
end;
$$;

comment on function public.cancel_staff_invitation(uuid) is
  'Cancels a pending invitation and invalidates its link immediately.';

create or replace function public.regenerate_staff_invitation(invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  actor uuid := auth.uid();
  invitation public.staff_invitations;
  raw_token text;
  next_expiry timestamptz := now() + interval '7 days';
begin
  if actor is null or not public.is_active_user() then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if invitation_id is null then
    raise exception 'invitation_required' using errcode = '22023';
  end if;

  if not public.has_permission('users.create') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select * into invitation
  from public.staff_invitations as candidate
  where candidate.id = invitation_id
  for update;

  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from unnest(invitation.branch_ids) as invited_branch(branch_id)
    where not public.has_permission('users.create', invited_branch.branch_id)
  ) then
    raise exception 'branch_out_of_scope' using errcode = '42501';
  end if;

  if invitation.status = 'accepted' then
    raise exception 'invitation_already_accepted' using errcode = 'P0002';
  end if;

  if invitation.status = 'cancelled' then
    raise exception 'invitation_cancelled' using errcode = 'P0002';
  end if;

  if invitation.status = 'processing'
     and invitation.claim_expires_at is not null
     and invitation.claim_expires_at > now() then
    raise exception 'invitation_in_use' using errcode = 'P0002';
  end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  update public.staff_invitations
  set token_hash = public._hash_invitation_token(raw_token),
      status = 'pending',
      attempts = 0,
      expires_at = next_expiry,
      claimed_at = null,
      claim_expires_at = null,
      last_attempt_at = null
  where id = invitation.id;

  insert into public.audit_logs (
    user_id,
    branch_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    created_by
  )
  values (
    actor,
    invitation.default_branch_id,
    'user.invitation_regenerated',
    'staff_invitations',
    invitation.id::text,
    jsonb_build_object('status', invitation.status, 'expires_at', invitation.expires_at),
    jsonb_build_object('status', 'pending', 'expires_at', next_expiry),
    actor
  );

  return jsonb_build_object(
    'invitation_id', invitation.id,
    'token', raw_token,
    'expires_at', next_expiry
  );
end;
$$;

comment on function public.regenerate_staff_invitation(uuid) is
  'Rotates the token, resets attempts, and extends a non-accepted invitation by 7 days.';

-- ---------------------------------------------------------------------------
-- Service-role acceptance lifecycle used by the accept-staff-invite function.
-- ---------------------------------------------------------------------------

create or replace function public.begin_staff_invitation_acceptance(
  invite_token text,
  invite_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  caller_role text;
  invitation public.staff_invitations;
  normalized_phone text := public._normalize_invitation_phone(invite_phone);
  effective_status text;
  next_attempts integer;
begin
  caller_role := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role';

  if caller_role is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if invite_token is null or invite_token !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invitation_not_found');
  end if;

  if normalized_phone is null or normalized_phone !~ '^[0-9]{10,15}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;

  select * into invitation
  from public.staff_invitations as candidate
  where candidate.token_hash = public._hash_invitation_token(invite_token)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invitation_not_found');
  end if;

  if invitation.status = 'accepted' then
    return jsonb_build_object('ok', false, 'error', 'invitation_used');
  end if;

  if invitation.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'invitation_cancelled');
  end if;

  effective_status := public._staff_invitation_status(
    invitation.status,
    invitation.expires_at,
    invitation.attempts,
    invitation.max_attempts
  );

  if effective_status = 'locked' then
    if invitation.status <> 'locked' then
      update public.staff_invitations
      set status = 'locked'
      where id = invitation.id;
    end if;

    return jsonb_build_object(
      'ok', false,
      'error', 'invitation_locked',
      'attempts_remaining', 0
    );
  end if;

  if effective_status = 'expired' then
    if invitation.status <> 'expired' then
      update public.staff_invitations
      set status = 'expired'
      where id = invitation.id;
    end if;

    return jsonb_build_object('ok', false, 'error', 'invitation_expired');
  end if;

  if invitation.status = 'processing'
     and invitation.claim_expires_at is not null
     and invitation.claim_expires_at > now() then
    return jsonb_build_object('ok', false, 'error', 'invitation_in_use');
  end if;

  if invitation.phone <> normalized_phone then
    next_attempts := invitation.attempts + 1;

    update public.staff_invitations
    set attempts = next_attempts,
        last_attempt_at = now(),
        status = case when next_attempts >= max_attempts then 'locked' else status end
    where id = invitation.id;

    if next_attempts >= invitation.max_attempts then
      return jsonb_build_object(
        'ok', false,
        'error', 'invitation_locked',
        'attempts_remaining', 0
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_phone',
      'attempts_remaining', invitation.max_attempts - next_attempts
    );
  end if;

  update public.staff_invitations
  set status = 'processing',
      claimed_at = now(),
      claim_expires_at = now() + interval '5 minutes',
      last_attempt_at = now()
  where id = invitation.id;

  return jsonb_build_object(
    'ok', true,
    'invitation_id', invitation.id,
    'full_name', invitation.full_name,
    'phone', invitation.phone,
    'role_codes', invitation.role_codes,
    'primary_role', invitation.primary_role,
    'branch_ids', invitation.branch_ids,
    'default_branch_id', invitation.default_branch_id,
    'created_by', invitation.created_by,
    'expires_at', invitation.expires_at
  );
end;
$$;

comment on function public.begin_staff_invitation_acceptance(text, text) is
  'Service-role claim: validates the mobile and reserves the invitation for 5 minutes.';

create or replace function public.complete_staff_invitation_acceptance(
  invitation_id uuid,
  new_user_id uuid,
  actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_role text;
  invitation public.staff_invitations;
  assignment jsonb;
begin
  caller_role := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role';

  if caller_role is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if invitation_id is null or new_user_id is null then
    raise exception 'invitation_and_user_required' using errcode = '22023';
  end if;

  select * into invitation
  from public.staff_invitations as candidate
  where candidate.id = invitation_id
  for update;

  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  if invitation.status <> 'processing' then
    raise exception 'invitation_not_processing' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.profiles as profile
    where profile.id = new_user_id and profile.is_active
  ) then
    raise exception 'staff_profile_required' using errcode = 'P0002';
  end if;

  update public.profiles
  set full_name = invitation.full_name,
      phone = invitation.phone,
      updated_by = actor_id
  where id = new_user_id;

  assignment := public._assign_user_access(
    new_user_id,
    invitation.role_codes,
    invitation.branch_ids,
    invitation.default_branch_id,
    invitation.primary_role,
    actor_id,
    true
  );

  update public.staff_invitations
  set status = 'accepted',
      accepted_user_id = new_user_id,
      accepted_at = now(),
      claimed_at = null,
      claim_expires_at = null
  where id = invitation.id;

  insert into public.audit_logs (
    user_id,
    branch_id,
    action,
    table_name,
    record_id,
    new_data,
    created_by
  )
  values (
    actor_id,
    invitation.default_branch_id,
    'user.invitation_accepted',
    'staff_invitations',
    invitation.id::text,
    jsonb_build_object(
      'user_id', new_user_id,
      'full_name', invitation.full_name,
      'roles', invitation.role_codes,
      'branch_ids', invitation.branch_ids,
      'primary_role', invitation.primary_role,
      'default_branch_id', invitation.default_branch_id
    ),
    actor_id
  );

  return assignment || jsonb_build_object(
    'invitation_id', invitation.id,
    'status', 'accepted',
    'accepted_user_id', new_user_id
  );
end;
$$;

comment on function public.complete_staff_invitation_acceptance(uuid, uuid, uuid) is
  'Service-role completion: assigns access and consumes the invitation atomically.';

create or replace function public.release_staff_invitation(invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_role text;
  invitation public.staff_invitations;
begin
  caller_role := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role';

  if caller_role is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  select * into invitation
  from public.staff_invitations as candidate
  where candidate.id = invitation_id
  for update;

  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  if invitation.status = 'processing' then
    update public.staff_invitations
    set status = 'pending',
        claimed_at = null,
        claim_expires_at = null
    where id = invitation.id;
  end if;

  return jsonb_build_object('invitation_id', invitation.id, 'status', 'pending');
end;
$$;

comment on function public.release_staff_invitation(uuid) is
  'Service-role compensation: returns a claimed invitation to pending after a failed acceptance.';

-- ---------------------------------------------------------------------------
-- Grants.
-- ---------------------------------------------------------------------------

revoke all on function public._normalize_invitation_phone(text) from public, anon, authenticated, service_role;
revoke all on function public._hash_invitation_token(text) from public, anon, authenticated, service_role;
revoke all on function public._staff_invitation_status(text, timestamptz, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public._staff_invitation_effective_status(public.staff_invitations) from public, anon, authenticated, service_role;
revoke all on function public._staff_invitation_roles(text[]) from public, anon, authenticated, service_role;
revoke all on function public._staff_invitation_branches(uuid[]) from public, anon, authenticated, service_role;
revoke all on function public._staff_invitation_public_payload(public.staff_invitations) from public, anon, authenticated, service_role;

revoke all on function public.create_staff_invitation(text, text, text[], uuid[], uuid, text) from public, anon;
revoke all on function public.list_staff_invitations(text) from public, anon;
revoke all on function public.get_staff_invitation(text) from public;
revoke all on function public.verify_staff_invitation(text, text) from public;
revoke all on function public.cancel_staff_invitation(uuid) from public, anon;
revoke all on function public.regenerate_staff_invitation(uuid) from public, anon;
revoke all on function public.begin_staff_invitation_acceptance(text, text) from public, anon, authenticated;
revoke all on function public.complete_staff_invitation_acceptance(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_staff_invitation(uuid) from public, anon, authenticated;

grant execute on function public.create_staff_invitation(text, text, text[], uuid[], uuid, text) to authenticated;
grant execute on function public.list_staff_invitations(text) to authenticated;
grant execute on function public.get_staff_invitation(text) to anon, authenticated;
grant execute on function public.verify_staff_invitation(text, text) to anon, authenticated;
grant execute on function public.cancel_staff_invitation(uuid) to authenticated;
grant execute on function public.regenerate_staff_invitation(uuid) to authenticated;
grant execute on function public.begin_staff_invitation_acceptance(text, text) to service_role;
grant execute on function public.complete_staff_invitation_acceptance(uuid, uuid, uuid) to service_role;
grant execute on function public.release_staff_invitation(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RLS safety check: every public table must have RLS enabled.
-- ---------------------------------------------------------------------------

do $$
declare
  unprotected_tables text;
begin
  select string_agg(class.relname, ', ' order by class.relname)
  into unprotected_tables
  from pg_class as class
  join pg_namespace as namespace on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relkind = 'r'
    and not class.relrowsecurity;

  if unprotected_tables is not null then
    raise exception 'RLS is not enabled on: %', unprotected_tables;
  end if;
end;
$$;
