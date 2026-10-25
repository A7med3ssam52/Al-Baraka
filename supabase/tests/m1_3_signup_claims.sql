-- M1.3 — One-time staff signup claims (D-27). pgTAP.
-- Run with: supabase test db
--
-- Verifies the claim lifecycle RPCs and the auth.users trigger that replaces
-- the unreliable app_metadata check (GoTrue does not expose app_metadata at
-- INSERT time). Self-contained and rolled back.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

select public.no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures: one branch, one processing invitation, one pending invitation.
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, address, is_active)
values (
  'b3000000-0000-4000-8000-000000000001',
  'TST-51',
  'Signup claim branch',
  'Claim tests',
  true
)
on conflict (code) do update
set name = excluded.name,
    address = excluded.address,
    is_active = excluded.is_active;

insert into public.staff_invitations (
  id,
  token_hash,
  full_name,
  phone,
  role_codes,
  primary_role,
  branch_ids,
  default_branch_id,
  status,
  claimed_at,
  claim_expires_at
)
values
  (
    'c3000000-0000-4000-8000-000000000001',
    repeat('a', 64),
    'Claim Test Employee',
    '01000000051',
    array['viewer']::text[],
    'viewer',
    array['b3000000-0000-4000-8000-000000000001']::uuid[],
    'b3000000-0000-4000-8000-000000000001',
    'processing',
    now(),
    now() + interval '10 minutes'
  ),
  (
    'c3000000-0000-4000-8000-000000000002',
    repeat('b', 64),
    'Pending Test Employee',
    '01000000052',
    array['viewer']::text[],
    'viewer',
    array['b3000000-0000-4000-8000-000000000001']::uuid[],
    'b3000000-0000-4000-8000-000000000001',
    'pending',
    null,
    null
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Only the service role may manage claims.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

select public.throws_ok(
  $$
    select public.create_staff_signup_claim(
      'claim.auth.tst@example.com',
      'c3000000-0000-4000-8000-000000000001',
      '01000000051'
    )
  $$,
  '42501',
  null,
  'authenticated cannot create a signup claim'
);

select public.throws_ok(
  $$ select public.delete_staff_signup_claim('claim.auth.tst@example.com') $$,
  '42501',
  null,
  'authenticated cannot delete a signup claim'
);

select public.throws_ok(
  $$ select count(*) from public.staff_signup_claims $$,
  '42501',
  null,
  'authenticated cannot read the claims table'
);

-- ---------------------------------------------------------------------------
-- Service-role claim lifecycle.
-- ---------------------------------------------------------------------------

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select public.is(
  (
    select public.create_staff_signup_claim(
      'claim.pending.tst@example.com',
      'c3000000-0000-4000-8000-000000000002',
      '01000000052'
    ) ->> 'error'
  ),
  'invitation_not_processing',
  'a pending invitation cannot issue a signup claim'
);

select public.is(
  (
    select public.create_staff_signup_claim(
      'claim.phone.tst@example.com',
      'c3000000-0000-4000-8000-000000000001',
      '01000000099'
    ) ->> 'error'
  ),
  'invalid_phone',
  'a mismatched phone cannot issue a signup claim'
);

select public.is(
  (
    select public.create_staff_signup_claim(
      'claim.main.tst@example.com',
      'c3000000-0000-4000-8000-000000000001',
      '01000000051'
    ) ->> 'ok'
  )::boolean,
  true,
  'a processing invitation with the right phone issues a claim'
);

select public.is(
  (
    select public.create_staff_signup_claim(
      '  CLAIM.MAIN.TST@Example.COM  ',
      'c3000000-0000-4000-8000-000000000001',
      '01000000051'
    ) ->> 'ok'
  )::boolean,
  true,
  're-issuing a claim for the same email succeeds'
);

select public.is(
  (select count(*) from public.staff_signup_claims where email = 'claim.main.tst@example.com'),
  1::bigint,
  're-issuing replaces the previous claim instead of stacking'
);

select public.is(
  (
    select email
    from public.staff_signup_claims
    where email = 'claim.main.tst@example.com'
  ),
  'claim.main.tst@example.com',
  'claim emails are normalized to lower-case and trimmed'
);

-- ---------------------------------------------------------------------------
-- The trigger consumes exactly one claim and creates a bare profile.
-- ---------------------------------------------------------------------------

reset role;

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '30000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'claim.main.tst@example.com',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Claim Main Employee","phone":"01000000051"}'::jsonb,
  now(),
  now()
);

select public.is(
  (
    select used_user_id
    from public.staff_signup_claims
    where email = 'claim.main.tst@example.com'
  ),
  '30000000-0000-4000-8000-000000000001'::uuid,
  'the trigger marks the claim as used by the new auth user'
);

select public.ok(
  (
    select used_at is not null
    from public.staff_signup_claims
    where email = 'claim.main.tst@example.com'
  ),
  'the trigger stamps used_at'
);

select public.is(
  (select role from public.profiles where id = '30000000-0000-4000-8000-000000000001'),
  'viewer',
  'a claim-backed user receives a bare viewer profile'
);

select public.is(
  (select branch_id from public.profiles where id = '30000000-0000-4000-8000-000000000001'),
  null::uuid,
  'a claim-backed profile has no automatic branch'
);

select public.is(
  (select count(*) from public.user_roles where user_id = '30000000-0000-4000-8000-000000000001'),
  0::bigint,
  'a claim-backed profile has no automatic role assignment'
);

select public.is(
  (select count(*) from public.user_branches where user_id = '30000000-0000-4000-8000-000000000001'),
  0::bigint,
  'a claim-backed profile has no automatic branch membership'
);

-- A second insert for the same email is impossible (unique email), so use a
-- different email with no claim to prove public signup stays closed.
select public.throws_ok(
  $$
    insert into auth.users (
      id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    values (
      '30000000-0000-4000-8000-000000000002',
      'authenticated',
      'authenticated',
      'claim.none.tst@example.com',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"No Claim Employee"}'::jsonb,
      now(),
      now()
    )
  $$,
  '42501',
  'public_signup_disabled',
  'an insert without a claim is rejected'
);

select public.is(
  (select count(*) from public.profiles where id = '30000000-0000-4000-8000-000000000002'),
  0::bigint,
  'a rejected insert creates no profile'
);

-- ---------------------------------------------------------------------------
-- Expired claims are rejected.
-- ---------------------------------------------------------------------------

insert into public.staff_signup_claims (email, expires_at)
values ('claim.expired.tst@example.com', now() - interval '1 minute');

select public.throws_ok(
  $$
    insert into auth.users (
      id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    values (
      '30000000-0000-4000-8000-000000000003',
      'authenticated',
      'authenticated',
      'claim.expired.tst@example.com',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Expired Claim Employee"}'::jsonb,
      now(),
      now()
    )
  $$,
  '42501',
  'public_signup_disabled',
  'an expired claim cannot authorize an auth insert'
);

select public.is(
  (select count(*) from public.profiles where id = '30000000-0000-4000-8000-000000000003'),
  0::bigint,
  'an expired claim creates no profile'
);

-- ---------------------------------------------------------------------------
-- Cleanup RPC.
-- ---------------------------------------------------------------------------

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select public.is(
  public.delete_staff_signup_claim('claim.main.tst@example.com'),
  1,
  'the service role can delete a claim'
);

select public.is(
  (select count(*) from public.staff_signup_claims where email = 'claim.main.tst@example.com'),
  0::bigint,
  'the deleted claim is gone'
);

select public.is(
  public.delete_staff_signup_claim('claim.main.tst@example.com'),
  0,
  'deleting a missing claim is a no-op'
);

reset role;

select * from public.finish();

rollback;
