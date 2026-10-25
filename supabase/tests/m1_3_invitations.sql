-- M1.3 — Staff invitations and auth hardening tests (pgTAP).
-- Run with: supabase test db
--
-- Self-contained: creates two branches and five staff users, exercises the
-- public/manager/service-role RPCs, and rolls everything back.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures.
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, address, is_active)
values
  ('b2000000-0000-4000-8000-000000000001', 'TST-41', 'فرع دعوات M1.3 أول', 'اختبار الدعوات', true),
  ('b2000000-0000-4000-8000-000000000002', 'TST-42', 'فرع دعوات M1.3 ثانٍ', 'اختبار الدعوات', true)
on conflict (code) do update
set name = excluded.name,
    address = excluded.address,
    is_active = excluded.is_active;

-- D-26: every auth.users insert must consume a one-time signup claim.
insert into public.staff_signup_claims (email, expires_at)
values
  ('m1.3i.manager.tst@example.com', now() + interval '15 minutes'),
  ('m1.3i.owner.tst@example.com', now() + interval '15 minutes'),
  ('m1.3i.sales.tst@example.com', now() + interval '15 minutes'),
  ('m1.3i.norole.tst@example.com', now() + interval '15 minutes'),
  ('m1.3i.manager2.tst@example.com', now() + interval '15 minutes');

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
values
  (
    '20000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'm1.3i.manager.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مدير دعوات M1.3"}'::jsonb,
    now(),
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'm1.3i.owner.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مالك دعوات M1.3"}'::jsonb,
    now(),
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'm1.3i.sales.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مبيعات دعوات M1.3"}'::jsonb,
    now(),
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'm1.3i.norole.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"بلا دور دعوات M1.3"}'::jsonb,
    now(),
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'm1.3i.manager2.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مدير فرع ثانٍ M1.3"}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

select public.no_plan();

-- ---------------------------------------------------------------------------
-- D-26: fail-closed provisioning.
-- ---------------------------------------------------------------------------

select public.ok(
  exists (
    select 1 from public.profiles
    where id = '20000000-0000-4000-8000-000000000001'
  ),
  'staff auth user receives a profile'
);

select public.is(
  (select branch_id from public.profiles where id = '20000000-0000-4000-8000-000000000001'),
  null::uuid,
  'new staff profile has no automatic branch'
);

select public.is(
  (select count(*) from public.user_roles where user_id = '20000000-0000-4000-8000-000000000001'),
  0::bigint,
  'new staff profile has no automatic role'
);

select public.is(
  (select count(*) from public.user_branches where user_id = '20000000-0000-4000-8000-000000000001'),
  0::bigint,
  'new staff profile has no automatic branch membership'
);

select public.throws_ok(
  $$
    insert into auth.users (
      id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    values (
      '20000000-0000-4000-8000-000000000099',
      'authenticated',
      'authenticated',
      'm1.3i.public.tst@example.com',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"تسجيل عام مرفوض"}'::jsonb,
      now(),
      now()
    )
  $$,
  '42501',
  'public_signup_disabled',
  'public signup is rejected at the auth.users boundary'
);

select public.is(
  (select count(*) from public.profiles where id = '20000000-0000-4000-8000-000000000099'),
  0::bigint,
  'rejected public signup creates no profile'
);

-- Assign fixture access explicitly, as a manager would.
update public.profiles
set branch_id = case
      when id = '20000000-0000-4000-8000-000000000005'
        then 'b2000000-0000-4000-8000-000000000002'::uuid
      else 'b2000000-0000-4000-8000-000000000001'::uuid
    end,
    role = case id
      when '20000000-0000-4000-8000-000000000001' then 'manager'
      when '20000000-0000-4000-8000-000000000002' then 'owner'
      when '20000000-0000-4000-8000-000000000003' then 'sales'
      when '20000000-0000-4000-8000-000000000005' then 'manager'
      else 'viewer'
    end,
    is_active = true
where id in (
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000005'
);

insert into public.user_branches (user_id, branch_id, is_default, created_by, updated_by)
values
  ('20000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', true, null, null),
  ('20000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', true, null, null),
  ('20000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', true, null, null),
  ('20000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000001', true, null, null),
  ('20000000-0000-4000-8000-000000000005', 'b2000000-0000-4000-8000-000000000002', true, null, null)
on conflict (user_id, branch_id) do update set is_default = excluded.is_default;

insert into public.user_roles (user_id, role_id, branch_id, is_primary, created_by, updated_by)
select
  fixture.user_id,
  role.id,
  fixture.branch_id,
  true,
  null,
  null
from (
  values
    ('20000000-0000-4000-8000-000000000001'::uuid, 'manager'::text, 'b2000000-0000-4000-8000-000000000001'::uuid),
    ('20000000-0000-4000-8000-000000000002'::uuid, 'owner'::text, 'b2000000-0000-4000-8000-000000000001'::uuid),
    ('20000000-0000-4000-8000-000000000003'::uuid, 'sales'::text, 'b2000000-0000-4000-8000-000000000001'::uuid),
    ('20000000-0000-4000-8000-000000000005'::uuid, 'manager'::text, 'b2000000-0000-4000-8000-000000000002'::uuid)
) as fixture(user_id, role_code, branch_id)
join public.roles as role on role.code = fixture.role_code
on conflict (user_id, role_id, branch_id) do nothing;

-- ---------------------------------------------------------------------------
-- Manager creates the main invitation.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select set_config('test.main_token', result ->> 'token', true),
       set_config('test.main_id', result ->> 'invitation_id', true)
from (
  select public.create_staff_invitation(
    'موظف دعوة M1.3',
    '0100 000 0001',
    array['sales']::text[],
    array['b2000000-0000-4000-8000-000000000001']::uuid[],
    'b2000000-0000-4000-8000-000000000001'::uuid,
    'sales'
  ) as result
) as created;

select public.is(
  length(current_setting('test.main_token')),
  64,
  'create_staff_invitation returns a 64-character token'
);

reset role;

select public.is(
  (select phone from public.staff_invitations where id = current_setting('test.main_id')::uuid),
  '01000000001',
  'invitation stores the normalized mobile'
);

select public.is(
  (select token_hash from public.staff_invitations where id = current_setting('test.main_id')::uuid),
  encode(extensions.digest(current_setting('test.main_token'), 'sha256'), 'hex'),
  'invitation stores only the SHA-256 token hash'
);

select public.ok(
  (select token_hash <> current_setting('test.main_token')
   from public.staff_invitations where id = current_setting('test.main_id')::uuid),
  'the plaintext token is never stored'
);

select public.is(
  (select status from public.staff_invitations where id = current_setting('test.main_id')::uuid),
  'pending',
  'new invitation is pending'
);

select public.ok(
  (select expires_at > now() + interval '6 days'
   from public.staff_invitations where id = current_setting('test.main_id')::uuid),
  'invitation expires after seven days'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.throws_ok(
  $$
    select public.create_staff_invitation(
      'موظف مالك',
      '01000000011',
      array['owner']::text[],
      array['b2000000-0000-4000-8000-000000000001']::uuid[],
      'b2000000-0000-4000-8000-000000000001'::uuid,
      'owner'
    )
  $$,
  '42501',
  'owner_required',
  'manager cannot invite an owner'
);

select public.throws_ok(
  $$
    select public.create_staff_invitation(
      'موظف فرع آخر',
      '01000000012',
      array['viewer']::text[],
      array['b2000000-0000-4000-8000-000000000002']::uuid[],
      'b2000000-0000-4000-8000-000000000002'::uuid,
      'viewer'
    )
  $$,
  '42501',
  'branch_out_of_scope',
  'manager cannot invite into a branch outside their scope'
);

select public.throws_ok(
  $$
    select public.create_staff_invitation(
      'موظف مكرر',
      '01000000001',
      array['viewer']::text[],
      array['b2000000-0000-4000-8000-000000000001']::uuid[],
      'b2000000-0000-4000-8000-000000000001'::uuid,
      'viewer'
    )
  $$,
  '23505',
  'invitation_exists',
  'a pending invitation for the same mobile is rejected'
);

select public.throws_ok(
  $$
    select public.create_staff_invitation(
      'موظف بلا رقم',
      'abc',
      array['viewer']::text[],
      array['b2000000-0000-4000-8000-000000000001']::uuid[],
      'b2000000-0000-4000-8000-000000000001'::uuid,
      'viewer'
    )
  $$,
  '22023',
  'invalid_phone',
  'malformed mobile numbers are rejected'
);

select public.is(
  (select count(*) from public.list_staff_invitations()),
  1::bigint,
  'manager sees the pending invitation'
);

select public.is(
  (select count(*) from public.list_staff_invitations('01000000001')),
  1::bigint,
  'manager can search invitations by mobile'
);

reset role;

-- ---------------------------------------------------------------------------
-- Authorization boundaries.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select public.throws_ok(
  $$
    select public.create_staff_invitation(
      'موظف مبيعات',
      '01000000021',
      array['viewer']::text[],
      array['b2000000-0000-4000-8000-000000000001']::uuid[],
      'b2000000-0000-4000-8000-000000000001'::uuid,
      'viewer'
    )
  $$,
  '42501',
  'permission_denied',
  'sales cannot create invitations'
);

select public.is(
  (select count(*) from public.list_staff_invitations()),
  0::bigint,
  'sales cannot list invitations without users.view'
);

reset role;

set local role anon;
select set_config('request.jwt.claims', '{}', true);

select public.throws_ok(
  $$ select public.create_staff_invitation('مجهول', '01000000022', array['viewer'], array['b2000000-0000-4000-8000-000000000001'::uuid], 'b2000000-0000-4000-8000-000000000001'::uuid, 'viewer') $$,
  '42501',
  null,
  'anon cannot create invitations'
);

select public.throws_ok(
  $$ select public.list_staff_invitations() $$,
  '42501',
  null,
  'anon cannot list invitations'
);

-- ---------------------------------------------------------------------------
-- Public preview and mobile verification.
-- ---------------------------------------------------------------------------

select public.is(
  (select public.get_staff_invitation(current_setting('test.main_token')) ->> 'full_name'),
  'موظف دعوة M1.3',
  'public preview returns the invited name'
);

select public.is(
  (select public.get_staff_invitation(current_setting('test.main_token')) ->> 'phone_masked'),
  '010*****001',
  'public preview masks the mobile number'
);

select public.ok(
  not (public.get_staff_invitation(current_setting('test.main_token')) ? 'token_hash'),
  'public preview never exposes the token hash'
);

select public.ok(
  public.get_staff_invitation(repeat('0', 64)) is null,
  'unknown tokens return no preview'
);

select set_config(
  'test.wrong_phone_result',
  public.verify_staff_invitation(current_setting('test.main_token'), '01000000009')::text,
  true
);

select public.is(
  (select current_setting('test.wrong_phone_result')::jsonb ->> 'error'),
  'invalid_phone',
  'wrong mobile is rejected'
);

select public.is(
  (select (current_setting('test.wrong_phone_result')::jsonb ->> 'attempts_remaining')::integer),
  4,
  'wrong mobile increments the attempt counter'
);

select public.is(
  (select public.verify_staff_invitation(current_setting('test.main_token'), '01000000001') ->> 'phone_confirmed'),
  'true',
  'correct mobile confirms the invitation'
);

-- ---------------------------------------------------------------------------
-- Attempt limit.
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select set_config('test.lock_token', result ->> 'token', true),
       set_config('test.lock_id', result ->> 'invitation_id', true)
from (
  select public.create_staff_invitation(
    'موظف قفل M1.3',
    '01000000002',
    array['viewer']::text[],
    array['b2000000-0000-4000-8000-000000000001']::uuid[],
    'b2000000-0000-4000-8000-000000000001'::uuid,
    'viewer'
  ) as result
) as created;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);

select public.is(
  (select public.verify_staff_invitation(current_setting('test.lock_token'), '01000000009') ->> 'error'),
  'invalid_phone', 'attempt 1 of 5 is rejected'
);
select public.is(
  (select public.verify_staff_invitation(current_setting('test.lock_token'), '01000000009') ->> 'error'),
  'invalid_phone', 'attempt 2 of 5 is rejected'
);
select public.is(
  (select public.verify_staff_invitation(current_setting('test.lock_token'), '01000000009') ->> 'error'),
  'invalid_phone', 'attempt 3 of 5 is rejected'
);
select public.is(
  (select public.verify_staff_invitation(current_setting('test.lock_token'), '01000000009') ->> 'error'),
  'invalid_phone', 'attempt 4 of 5 is rejected'
);
select public.is(
  (select public.verify_staff_invitation(current_setting('test.lock_token'), '01000000009') ->> 'error'),
  'invitation_locked', 'attempt 5 of 5 locks the invitation'
);

select public.is(
  (select public.get_staff_invitation(current_setting('test.lock_token')) ->> 'status'),
  'locked',
  'locked status is persisted'
);

select public.is(
  (select public.verify_staff_invitation(current_setting('test.lock_token'), '01000000002') ->> 'error'),
  'invitation_locked', 'locked invitation rejects the correct mobile'
);

-- ---------------------------------------------------------------------------
-- Expiry and regeneration.
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select set_config('test.expired_token', result ->> 'token', true),
       set_config('test.expired_id', result ->> 'invitation_id', true)
from (
  select public.create_staff_invitation(
    'موظف منتهي M1.3',
    '01000000003',
    array['viewer']::text[],
    array['b2000000-0000-4000-8000-000000000001']::uuid[],
    'b2000000-0000-4000-8000-000000000001'::uuid,
    'viewer'
  ) as result
) as created;

reset role;
update public.staff_invitations
set expires_at = now() - interval '1 day'
where id = current_setting('test.expired_id')::uuid;

set local role anon;
select set_config('request.jwt.claims', '{}', true);

select public.is(
  (select public.verify_staff_invitation(current_setting('test.expired_token'), '01000000003') ->> 'error'),
  'invitation_expired', 'expired invitation is rejected'
);

select public.is(
  (select public.get_staff_invitation(current_setting('test.expired_token')) ->> 'status'),
  'expired',
  'expired status is persisted'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select set_config('test.regen_token', result ->> 'token', true)
from (
  select public.regenerate_staff_invitation(current_setting('test.expired_id')::uuid) as result
) as regenerated;

select public.ok(
  current_setting('test.regen_token') <> current_setting('test.expired_token'),
  'regeneration rotates the token'
);

select public.is(
  (select status from public.list_staff_invitations()
   where invitation_id = current_setting('test.expired_id')::uuid),
  'pending',
  'regeneration returns the invitation to pending'
);

select public.is(
  (select attempts from public.list_staff_invitations()
   where invitation_id = current_setting('test.expired_id')::uuid),
  0,
  'regeneration resets the attempt counter'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);

select public.ok(
  public.get_staff_invitation(current_setting('test.expired_token')) is null,
  'the old token stops working after regeneration'
);

select public.is(
  (select public.get_staff_invitation(current_setting('test.regen_token')) ->> 'full_name'),
  'موظف منتهي M1.3',
  'the regenerated token previews the invitation'
);

-- ---------------------------------------------------------------------------
-- Cancellation and branch scope.
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.is(
  (select public.cancel_staff_invitation(current_setting('test.main_id')::uuid) ->> 'status'),
  'cancelled',
  'manager cancels a pending invitation'
);

select public.is(
  (select public.verify_staff_invitation(current_setting('test.main_token'), '01000000001') ->> 'error'),
  'invitation_cancelled', 'cancelled invitation cannot be used'
);

select public.throws_ok(
  $$ select public.regenerate_staff_invitation(current_setting('test.main_id')::uuid) $$,
  'P0002', 'invitation_cancelled', 'cancelled invitation cannot be regenerated'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select public.throws_ok(
  $$ select public.cancel_staff_invitation(current_setting('test.lock_id')::uuid) $$,
  '42501', 'permission_denied', 'sales cannot cancel invitations'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);

select public.throws_ok(
  $$ select public.cancel_staff_invitation(current_setting('test.lock_id')::uuid) $$,
  '42501', 'branch_out_of_scope', 'a manager from another branch cannot cancel'
);

select public.is(
  (select count(*) from public.list_staff_invitations()),
  0::bigint,
  'a manager from another branch sees no invitations'
);

reset role;

-- ---------------------------------------------------------------------------
-- Acceptance lifecycle.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select set_config('test.accept_token', result ->> 'token', true),
       set_config('test.accept_id', result ->> 'invitation_id', true)
from (
  select public.create_staff_invitation(
    'موظف قبول M1.3',
    '01000000004',
    array['sales']::text[],
    array['b2000000-0000-4000-8000-000000000001']::uuid[],
    'b2000000-0000-4000-8000-000000000001'::uuid,
    'sales'
  ) as result
) as created;

reset role;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

select public.throws_ok(
  $$ select public.begin_staff_invitation_acceptance(current_setting('test.accept_token'), '01000000004') $$,
  '42501', 'service_role_required', 'authenticated callers cannot claim an invitation'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select public.is(
  (select public.begin_staff_invitation_acceptance(current_setting('test.accept_token'), '01000000004') ->> 'invitation_id'),
  current_setting('test.accept_id'),
  'service role claims the invitation'
);

reset role;

select public.is(
  (select status from public.staff_invitations where id = current_setting('test.accept_id')::uuid),
  'processing',
  'claim moves the invitation to processing'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select public.is(
  (select public.begin_staff_invitation_acceptance(current_setting('test.accept_token'), '01000000004') ->> 'error'),
  'invitation_in_use', 'a second claim is rejected while the first is active'
);

reset role;

-- D-26: the accepted user also needs a one-time signup claim.
insert into public.staff_signup_claims (email, expires_at)
values ('m1.3i.accepted.tst@example.com', now() + interval '15 minutes');

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
  '20000000-0000-4000-8000-000000000010',
  'authenticated',
  'authenticated',
  'm1.3i.accepted.tst@example.com',
  now(),
  '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
  '{"full_name":"موظف قبول M1.3","phone":"01000000004"}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select public.is(
  (select public.complete_staff_invitation_acceptance(
    current_setting('test.accept_id')::uuid,
    '20000000-0000-4000-8000-000000000010'::uuid,
    '20000000-0000-4000-8000-000000000001'::uuid
  ) ->> 'status'),
  'accepted',
  'completion consumes the invitation'
);

reset role;

select public.is(
  (select status from public.staff_invitations where id = current_setting('test.accept_id')::uuid),
  'accepted',
  'accepted status is persisted'
);

select public.is(
  (select accepted_user_id from public.staff_invitations where id = current_setting('test.accept_id')::uuid),
  '20000000-0000-4000-8000-000000000010'::uuid,
  'invitation records the accepted user'
);

select public.is(
  (select count(*) from public.user_roles
   where user_id = '20000000-0000-4000-8000-000000000010'),
  1::bigint,
  'acceptance assigns exactly one role row'
);

select public.is(
  (select role.code from public.user_roles as assignment
   join public.roles as role on role.id = assignment.role_id
   where assignment.user_id = '20000000-0000-4000-8000-000000000010'),
  'sales',
  'acceptance assigns the invited role'
);

select public.is(
  (select branch_id from public.user_branches
   where user_id = '20000000-0000-4000-8000-000000000010'),
  'b2000000-0000-4000-8000-000000000001'::uuid,
  'acceptance assigns the invited branch'
);

select public.is(
  (select branch_id from public.profiles where id = '20000000-0000-4000-8000-000000000010'),
  'b2000000-0000-4000-8000-000000000001'::uuid,
  'acceptance syncs the profile branch'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select public.is(
  (select public.begin_staff_invitation_acceptance(current_setting('test.accept_token'), '01000000004') ->> 'error'),
  'invitation_used', 'a consumed invitation cannot be claimed again'
);

select public.throws_ok(
  $$ select public.complete_staff_invitation_acceptance(current_setting('test.accept_id')::uuid, '20000000-0000-4000-8000-000000000010'::uuid, null) $$,
  'P0002', 'invitation_not_processing', 'a consumed invitation cannot be completed again'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);

select public.is(
  (select public.get_staff_invitation(current_setting('test.accept_token')) ->> 'status'),
  'accepted',
  'public preview reports the consumed invitation as accepted'
);

select public.is(
  (select (public.get_staff_invitation(current_setting('test.accept_token')) ->> 'can_accept')::boolean),
  false,
  'public preview marks the consumed invitation as not acceptable'
);

-- ---------------------------------------------------------------------------
-- Compensation and failed completion.
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select set_config('test.release_token', result ->> 'token', true),
       set_config('test.release_id', result ->> 'invitation_id', true)
from (
  select public.create_staff_invitation(
    'موظف إفراج M1.3',
    '01000000005',
    array['viewer']::text[],
    array['b2000000-0000-4000-8000-000000000001']::uuid[],
    'b2000000-0000-4000-8000-000000000001'::uuid,
    'viewer'
  ) as result
) as created;

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select public.is(
  (select public.begin_staff_invitation_acceptance(current_setting('test.release_token'), '01000000005') ->> 'invitation_id'),
  current_setting('test.release_id'),
  'service role claims the release fixture'
);

select public.is(
  (select public.release_staff_invitation(current_setting('test.release_id')::uuid) ->> 'status'),
  'pending',
  'release returns a claimed invitation to pending'
);

select public.is(
  (select public.begin_staff_invitation_acceptance(current_setting('test.release_token'), '01000000005') ->> 'invitation_id'),
  current_setting('test.release_id'),
  'a released invitation can be claimed again'
);

select public.throws_ok(
  $$ select public.complete_staff_invitation_acceptance(current_setting('test.release_id')::uuid, '20000000-0000-4000-8000-000000000077'::uuid, null) $$,
  'P0002', 'staff_profile_required', 'completion requires an active staff profile'
);

reset role;

-- ---------------------------------------------------------------------------
-- Audit trail.
-- ---------------------------------------------------------------------------

select public.is(
  (select count(*) from public.audit_logs
   where action = 'user.invitation_created'
     and record_id = current_setting('test.accept_id')),
  1::bigint,
  'invitation creation is audited'
);

select public.is(
  (select count(*) from public.audit_logs
   where action = 'user.invitation_accepted'
     and record_id = current_setting('test.accept_id')),
  1::bigint,
  'invitation acceptance is audited'
);

select public.ok(
  (select count(*) from public.audit_logs
   where action = 'user.invitation_cancelled'
     and record_id = current_setting('test.main_id')) >= 1,
  'invitation cancellation is audited'
);

select public.ok(
  (select count(*) from public.audit_logs
   where action = 'user.invitation_regenerated'
     and record_id = current_setting('test.expired_id')) >= 1,
  'invitation regeneration is audited'
);

-- ---------------------------------------------------------------------------
-- my_access guard and settings RLS.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

select public.is(
  (select (public.my_access() ->> 'has_profile')::boolean),
  true,
  'my_access reports an existing staff profile'
);

select public.is(
  (select (public.my_access() ->> 'has_role')::boolean),
  false,
  'my_access reports a staff profile without roles'
);

select public.is(
  (select (public.my_access() ->> 'is_active')::boolean),
  true,
  'my_access reports the profile as active'
);

select public.is(
  jsonb_array_length((select public.my_access() -> 'permissions')),
  0,
  'a profile without roles has no permissions'
);

select public.is(
  (select count(*) from public.system_settings),
  0::bigint,
  'a roleless staff account cannot read system settings'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.is(
  (select (public.my_access() ->> 'has_role')::boolean),
  true,
  'my_access reports the manager role'
);

select public.is(
  (select count(*) from public.system_settings),
  1::bigint,
  'settings.view allows reading system settings'
);

reset role;

select * from public.finish();

rollback;
