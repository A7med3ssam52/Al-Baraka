-- M1.3 — User management tests (pgTAP).
-- Run with: supabase test db
--
-- The test is self-contained: it creates two temporary branches and six users,
-- exercises the authenticated/service-role wrappers, and rolls everything back.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures.
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, address, is_active)
values
  ('b1000000-0000-4000-8000-000000000001', 'TST-31', 'فرع اختبار M1.3 أول', 'اختبار M1.3', true),
  ('b1000000-0000-4000-8000-000000000002', 'TST-32', 'فرع اختبار M1.3 ثانٍ', 'اختبار M1.3', true)
on conflict (code) do update
set name = excluded.name,
    address = excluded.address,
    is_active = excluded.is_active;

-- D-26: every auth.users insert must consume a one-time signup claim.
insert into public.staff_signup_claims (email, expires_at)
values
  ('m1.3.manager.tst@example.com', now() + interval '15 minutes'),
  ('m1.3.viewer.tst@example.com', now() + interval '15 minutes'),
  ('m1.3.owner.tst@example.com', now() + interval '15 minutes'),
  ('m1.3.target.tst@example.com', now() + interval '15 minutes'),
  ('m1.3.inactive.tst@example.com', now() + interval '15 minutes'),
  ('m1.3.pending.tst@example.com', now() + interval '15 minutes');

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
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'm1.3.manager.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مدير اختبار M1.3"}'::jsonb,
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'm1.3.viewer.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مشاهد اختبار M1.3"}'::jsonb,
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'm1.3.owner.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مالك اختبار M1.3"}'::jsonb,
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'm1.3.target.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"هدف اختبار M1.3"}'::jsonb,
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'm1.3.inactive.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"معطل اختبار M1.3"}'::jsonb,
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000006',
    'authenticated',
    'authenticated',
    'm1.3.pending.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"دعوة اختبار M1.3"}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

update public.profiles
set branch_id = case
      when id = '10000000-0000-4000-8000-000000000002'
        then 'b1000000-0000-4000-8000-000000000002'::uuid
      else 'b1000000-0000-4000-8000-000000000001'::uuid
    end,
    role = case id
      when '10000000-0000-4000-8000-000000000001' then 'manager'
      when '10000000-0000-4000-8000-000000000003' then 'owner'
      when '10000000-0000-4000-8000-000000000004' then 'sales'
      else 'viewer'
    end,
    is_active = id <> '10000000-0000-4000-8000-000000000005'
where id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000006'
);

insert into public.user_branches (user_id, branch_id, is_default)
select fixture.user_id, fixture.branch_id, true
from (
  values
    ('10000000-0000-4000-8000-000000000001'::uuid, 'b1000000-0000-4000-8000-000000000001'::uuid),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'b1000000-0000-4000-8000-000000000002'::uuid),
    ('10000000-0000-4000-8000-000000000003'::uuid, 'b1000000-0000-4000-8000-000000000001'::uuid),
    ('10000000-0000-4000-8000-000000000004'::uuid, 'b1000000-0000-4000-8000-000000000001'::uuid),
    ('10000000-0000-4000-8000-000000000005'::uuid, 'b1000000-0000-4000-8000-000000000001'::uuid),
    ('10000000-0000-4000-8000-000000000006'::uuid, 'b1000000-0000-4000-8000-000000000001'::uuid)
) as fixture(user_id, branch_id)
on conflict (user_id, branch_id) do update
set is_default = excluded.is_default;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select fixture.user_id, role.id, fixture.branch_id, true
from (
  values
    ('10000000-0000-4000-8000-000000000001'::uuid, 'manager'::text, 'b1000000-0000-4000-8000-000000000001'::uuid),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'viewer'::text, 'b1000000-0000-4000-8000-000000000002'::uuid),
    ('10000000-0000-4000-8000-000000000003'::uuid, 'owner'::text, 'b1000000-0000-4000-8000-000000000001'::uuid),
    ('10000000-0000-4000-8000-000000000004'::uuid, 'sales'::text, 'b1000000-0000-4000-8000-000000000001'::uuid),
    ('10000000-0000-4000-8000-000000000005'::uuid, 'viewer'::text, 'b1000000-0000-4000-8000-000000000001'::uuid),
    ('10000000-0000-4000-8000-000000000006'::uuid, 'viewer'::text, 'b1000000-0000-4000-8000-000000000001'::uuid)
) as fixture(user_id, role_code, branch_id)
join public.roles as role on role.code = fixture.role_code
on conflict (user_id, role_id, branch_id) do update
set is_primary = excluded.is_primary;

update auth.users
set banned_until = '9999-12-31 23:59:59+00'::timestamptz
where id = '10000000-0000-4000-8000-000000000005';

update auth.users
set email_confirmed_at = null,
    invited_at = now(),
    last_sign_in_at = null
where id = '10000000-0000-4000-8000-000000000006';

update auth.users
set last_sign_in_at = now()
where id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004'
);

insert into auth.sessions (id, user_id, created_at, updated_at)
values (
  '51000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004',
  now(),
  now()
);

select public.no_plan();

-- ---------------------------------------------------------------------------
-- Manager in TST-31.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.is(
  (select count(*) from public.list_users()),
  5::bigint,
  'manager lists five users in TST-31'
);

select public.ok(
  not exists (
    select 1
    from public.list_users()
    where user_id = '10000000-0000-4000-8000-000000000002'
  ),
  'manager cannot list the TST-32 viewer'
);

select public.is(
  (select count(*) from public.list_users('هدف اختبار')),
  1::bigint,
  'manager can search users by Arabic name'
);

select public.is(
  (select count(*) from public.list_users('m1.3.target.tst')),
  1::bigint,
  'manager can search users by email'
);

select public.ok(
  (
    select roles @> '[{"code":"sales"}]'::jsonb
    from public.list_users()
    where user_id = '10000000-0000-4000-8000-000000000004'
  ),
  'manager sees the target role in the directory'
);

select public.ok(
  (
    select not email_confirmed and invited_at is not null and last_sign_in_at is null
    from public.list_users()
    where user_id = '10000000-0000-4000-8000-000000000006'
  ),
  'manager sees pending invitation metadata'
);

select public.lives_ok(
  $$
    select public.assign_user_access(
      '10000000-0000-4000-8000-000000000004'::uuid,
      array['sales', 'viewer']::text[],
      array['b1000000-0000-4000-8000-000000000001']::uuid[],
      'b1000000-0000-4000-8000-000000000001'::uuid,
      'sales'
    )
  $$,
  'manager can assign multiple roles in a managed branch'
);

select public.is(
  (
    select count(*)
    from public.user_roles
    where user_id = '10000000-0000-4000-8000-000000000004'
  ),
  2::bigint,
  'assignment writes both roles'
);

select public.is(
  (
    select count(*)
    from public.user_roles
    where user_id = '10000000-0000-4000-8000-000000000004'
      and is_primary
  ),
  1::bigint,
  'assignment keeps exactly one primary role'
);

select public.ok(
  (
    select role = 'sales'
      and branch_id = 'b1000000-0000-4000-8000-000000000001'::uuid
    from public.profiles
    where id = '10000000-0000-4000-8000-000000000004'
  ),
  'assignment syncs profiles.role and branch_id'
);

select public.is(
  (
    select count(*)
    from public.user_branches
    where user_id = '10000000-0000-4000-8000-000000000004'
      and is_default
  ),
  1::bigint,
  'assignment keeps exactly one default branch'
);

select public.lives_ok(
  $$
    select public.assign_user_access(
      '10000000-0000-4000-8000-000000000004'::uuid,
      array['viewer']::text[],
      array['b1000000-0000-4000-8000-000000000001']::uuid[],
      'b1000000-0000-4000-8000-000000000001'::uuid,
      'viewer'
    )
  $$,
  'manager can replace access again'
);

select public.is(
  (
    select count(*)
    from public.user_roles
    where user_id = '10000000-0000-4000-8000-000000000004'
  ),
  1::bigint,
  'replacement removes stale role rows'
);

select public.throws_ok(
  $$
    select public.assign_user_access(
      '10000000-0000-4000-8000-000000000004'::uuid,
      array['owner']::text[],
      array['b1000000-0000-4000-8000-000000000001']::uuid[],
      'b1000000-0000-4000-8000-000000000001'::uuid,
      'owner'
    )
  $$,
  '42501',
  'owner_required',
  'manager cannot grant the owner role'
);

select public.throws_ok(
  $$
    select public.assign_user_access(
      '10000000-0000-4000-8000-000000000004'::uuid,
      array['sales']::text[],
      array['b1000000-0000-4000-8000-000000000002']::uuid[],
      'b1000000-0000-4000-8000-000000000002'::uuid,
      'sales'
    )
  $$,
  '42501',
  'branch_out_of_scope',
  'manager cannot assign a branch they do not manage'
);

select public.throws_ok(
  $$
    select public.assign_user_access(
      '10000000-0000-4000-8000-000000000001'::uuid,
      array['manager']::text[],
      array['b1000000-0000-4000-8000-000000000001']::uuid[],
      'b1000000-0000-4000-8000-000000000001'::uuid,
      'manager'
    )
  $$,
  '42501',
  'cannot_modify_self',
  'manager cannot change their own role'
);

select public.throws_ok(
  $$
    select public.assign_user_access(
      '10000000-0000-4000-8000-000000000002'::uuid,
      array['viewer']::text[],
      array['b1000000-0000-4000-8000-000000000002']::uuid[],
      'b1000000-0000-4000-8000-000000000002'::uuid,
      'viewer'
    )
  $$,
  '42501',
  'user_out_of_scope',
  'manager cannot modify a user in another branch'
);

select public.throws_ok(
  $$
    select public.assign_user_access(
      '10000000-0000-4000-8000-000000000004'::uuid,
      array['sales']::text[],
      array['b1000000-0000-4000-8000-000000000001']::uuid[],
      'b1000000-0000-4000-8000-000000000001'::uuid,
      'viewer'
    )
  $$,
  '22023',
  'invalid_primary_role',
  'primary role must be part of the assigned roles'
);

select public.throws_ok(
  $$
    select public.assign_user_access(
      '10000000-0000-4000-8000-000000000004'::uuid,
      array['sales']::text[],
      array['b1000000-0000-4000-8000-000000000001']::uuid[],
      'b1000000-0000-4000-8000-000000000002'::uuid,
      'sales'
    )
  $$,
  '22023',
  'invalid_default_branch',
  'default branch must be part of the assigned branches'
);

select public.lives_ok(
  $$
    select public.update_user_profile(
      '10000000-0000-4000-8000-000000000004'::uuid,
      'اسم محدث M1.3',
      '01000000000'
    )
  $$,
  'manager can update a managed user profile'
);

select public.ok(
  (
    select full_name = 'اسم محدث M1.3' and phone = '01000000000'
    from public.profiles
    where id = '10000000-0000-4000-8000-000000000004'
  ),
  'profile update persists name and phone'
);

select public.throws_ok(
  $$
    select public.update_user_profile(
      '10000000-0000-4000-8000-000000000003'::uuid,
      'محاولة تعديل المالك',
      null
    )
  $$,
  '42501',
  'owner_required',
  'manager cannot edit an owner profile'
);

select public.lives_ok(
  $$
    select public.set_user_active(
      '10000000-0000-4000-8000-000000000004'::uuid,
      false
    )
  $$,
  'manager can deactivate a managed user'
);

reset role;

select public.ok(
  (
    select not is_active
    from public.profiles
    where id = '10000000-0000-4000-8000-000000000004'
  ),
  'deactivation updates profiles.is_active'
);

select public.ok(
  (
    select banned_until is not null and banned_until > now()
    from auth.users
    where id = '10000000-0000-4000-8000-000000000004'
  ),
  'deactivation bans the auth user'
);

select public.is(
  (
    select count(*)
    from auth.sessions
    where user_id = '10000000-0000-4000-8000-000000000004'
  ),
  0::bigint,
  'deactivation revokes live sessions'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.lives_ok(
  $$
    select public.set_user_active(
      '10000000-0000-4000-8000-000000000004'::uuid,
      true
    )
  $$,
  'manager can reactivate a managed user'
);

reset role;

select public.ok(
  (
    select is_active
    from public.profiles
    where id = '10000000-0000-4000-8000-000000000004'
  ),
  'reactivation updates profiles.is_active'
);

select public.ok(
  (
    select banned_until is null
    from auth.users
    where id = '10000000-0000-4000-8000-000000000004'
  ),
  'reactivation clears the auth ban'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.throws_ok(
  $$
    select public.set_user_active(
      '10000000-0000-4000-8000-000000000003'::uuid,
      false
    )
  $$,
  '42501',
  'owner_required',
  'manager cannot deactivate an owner'
);

select public.throws_ok(
  $$
    select public.set_user_active(
      '10000000-0000-4000-8000-000000000001'::uuid,
      false
    )
  $$,
  '42501',
  'cannot_modify_self',
  'manager cannot deactivate themselves'
);

select public.is(
  (
    select count(*)
    from public.audit_logs
    where record_id = '10000000-0000-4000-8000-000000000004'
      and action in ('user.access_assigned', 'user.profile_updated', 'user.deactivated', 'user.activated')
  ),
  5::bigint,
  'user management writes audit entries'
);

reset role;

-- ---------------------------------------------------------------------------
-- Viewer in TST-32.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select public.is(
  (select count(*) from public.list_users()),
  1::bigint,
  'viewer lists only their own profile'
);

select public.is(
  (select user_id from public.list_users()),
  '10000000-0000-4000-8000-000000000002'::uuid,
  'viewer sees their own user id'
);

select public.throws_ok(
  $$
    select public.assign_user_access(
      '10000000-0000-4000-8000-000000000004'::uuid,
      array['viewer']::text[],
      array['b1000000-0000-4000-8000-000000000001']::uuid[],
      'b1000000-0000-4000-8000-000000000001'::uuid,
      'viewer'
    )
  $$,
  '42501',
  'permission_denied',
  'viewer cannot assign roles'
);

select public.throws_ok(
  $$
    select public.update_user_profile(
      '10000000-0000-4000-8000-000000000004'::uuid,
      'محاولة مشاهد',
      null
    )
  $$,
  '42501',
  'permission_denied',
  'viewer cannot update profiles'
);

select public.throws_ok(
  $$
    select public.set_user_active(
      '10000000-0000-4000-8000-000000000004'::uuid,
      false
    )
  $$,
  '42501',
  'permission_denied',
  'viewer cannot deactivate users'
);

reset role;

-- ---------------------------------------------------------------------------
-- Owner.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select public.ok(
  exists (
    select 1
    from public.list_users()
    where user_id = '10000000-0000-4000-8000-000000000002'
  ),
  'owner sees users in every branch'
);

select public.lives_ok(
  $$
    select public.assign_user_access(
      '10000000-0000-4000-8000-000000000006'::uuid,
      array['owner']::text[],
      array['b1000000-0000-4000-8000-000000000001']::uuid[],
      'b1000000-0000-4000-8000-000000000001'::uuid,
      'owner'
    )
  $$,
  'owner can grant the owner role'
);

select public.ok(
  (
    select role = 'owner'
    from public.profiles
    where id = '10000000-0000-4000-8000-000000000006'
  ),
  'owner promotion syncs profiles.role'
);

select public.lives_ok(
  $$
    select public.assign_user_access(
      '10000000-0000-4000-8000-000000000006'::uuid,
      array['viewer']::text[],
      array['b1000000-0000-4000-8000-000000000001']::uuid[],
      'b1000000-0000-4000-8000-000000000001'::uuid,
      'viewer'
    )
  $$,
  'owner can demote another owner when another owner remains'
);

select public.throws_ok(
  $$
    select public.assign_user_access(
      '10000000-0000-4000-8000-000000000003'::uuid,
      array['viewer']::text[],
      array['b1000000-0000-4000-8000-000000000001']::uuid[],
      'b1000000-0000-4000-8000-000000000001'::uuid,
      'viewer'
    )
  $$,
  '42501',
  'cannot_modify_self',
  'owner cannot change their own role'
);

reset role;

-- Isolate the last-owner check from development accounts outside this fixture.
update public.profiles
set is_active = false
where id in (
  select assignment.user_id
  from public.user_roles as assignment
  join public.roles as role on role.id = assignment.role_id
  where role.code = 'owner'
)
and id <> '10000000-0000-4000-8000-000000000003';

-- Direct internal call simulates an owner demoting the last active owner.
select set_config('request.jwt.claims', '{}', true);

select public.throws_ok(
  $$
    select public._assign_user_access(
      '10000000-0000-4000-8000-000000000003'::uuid,
      array['viewer']::text[],
      array['b1000000-0000-4000-8000-000000000001']::uuid[],
      'b1000000-0000-4000-8000-000000000001'::uuid,
      'viewer',
      null,
      true
    )
  $$,
  '23514',
  'last_owner',
  'last active owner cannot be demoted'
);

-- ---------------------------------------------------------------------------
-- Self access payload used by the authenticated shell.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.is(
  (select public.my_access() ->> 'email'),
  'm1.3.manager.tst@example.com',
  'my_access returns the signed-in manager email'
);

select public.is(
  (select (public.my_access() ->> 'is_owner')::boolean),
  false,
  'my_access marks the manager as a non-owner'
);

select public.is(
  (select (public.my_access() ->> 'is_active')::boolean),
  true,
  'my_access marks the manager as active'
);

select public.is(
  jsonb_array_length((select public.my_access() -> 'permissions')),
  96,
  'my_access returns the 96 manager permissions'
);

select public.ok(
  (select public.my_access() -> 'permissions' ? 'users.view'),
  'my_access includes users.view for the manager'
);

select public.ok(
  not (select public.my_access() -> 'permissions' ? 'roles.manage'),
  'my_access excludes roles.manage for the manager'
);

select public.ok(
  (select public.my_access() -> 'roles' @> '[{"code":"manager"}]'::jsonb),
  'my_access includes the manager role assignment'
);

select public.ok(
  (select public.my_access() -> 'branches' @> '[{"code":"TST-31"}]'::jsonb),
  'my_access includes the manager branch membership'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select public.ok(
  (select (public.my_access() ->> 'is_owner')::boolean),
  'my_access marks the owner as an owner'
);

select public.is(
  jsonb_array_length((select public.my_access() -> 'permissions')),
  97,
  'my_access returns the 97 owner permissions'
);

select public.ok(
  (select public.my_access() -> 'permissions' ? 'roles.manage'),
  'my_access includes roles.manage for the owner'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);

select public.ok(
  not (select (public.my_access() ->> 'is_active')::boolean),
  'my_access flags the inactive user'
);

select public.is(
  jsonb_array_length((select public.my_access() -> 'permissions')),
  0,
  'my_access returns no permissions for the inactive user'
);

reset role;

set local role anon;
select set_config('request.jwt.claims', '{}', true);

select public.throws_ok(
  $$ select public.my_access() $$,
  '42501',
  null,
  'anon cannot execute my_access'
);

reset role;

-- ---------------------------------------------------------------------------
-- Service-role wrapper used by the invite Edge Function.
-- ---------------------------------------------------------------------------

select public.throws_ok(
  $$
    select public.admin_assign_user_access(
      '10000000-0000-4000-8000-000000000004'::uuid,
      array['sales']::text[],
      array['b1000000-0000-4000-8000-000000000001']::uuid[],
      'b1000000-0000-4000-8000-000000000001'::uuid,
      'sales',
      null
    )
  $$,
  '42501',
  'service_role_required',
  'admin wrapper rejects a non-service caller'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select public.lives_ok(
  $$
    select public.admin_assign_user_access(
      '10000000-0000-4000-8000-000000000004'::uuid,
      array['sales']::text[],
      array['b1000000-0000-4000-8000-000000000001']::uuid[],
      'b1000000-0000-4000-8000-000000000001'::uuid,
      'sales',
      '10000000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'service role can assign access for an invitation'
);

reset role;

select public.ok(
  (
    select user_id = '10000000-0000-4000-8000-000000000001'::uuid
    from public.audit_logs
    where record_id = '10000000-0000-4000-8000-000000000004'
      and action = 'user.access_assigned'
    order by created_at desc
    limit 1
  ),
  'admin assignment records the inviting manager in the audit log'
);

select * from public.finish();

rollback;
