-- M1.2 — RLS and permission-matrix tests (pgTAP).
-- Run with: supabase test db
--
-- The test is self-contained: it creates two temporary branches, five users,
-- a cashbox, and journal entries, then rolls everything back. Fixed UUIDs make
-- the assertions independent of the development data.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated;
grant execute on all functions in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Test fixtures.
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, address, is_active)
values
  ('b0000000-0000-4000-8000-000000000001', 'TST-01', 'فرع اختبار أول', 'اختبار M1.2', true),
  ('b0000000-0000-4000-8000-000000000002', 'TST-02', 'فرع اختبار ثانٍ', 'اختبار M1.2', true)
on conflict (code) do update
set name = excluded.name,
    address = excluded.address,
    is_active = excluded.is_active;

-- D-26: every auth.users insert must consume a one-time signup claim.
insert into public.staff_signup_claims (email, expires_at)
values
  ('m1.2.manager.tst@example.com', now() + interval '15 minutes'),
  ('m1.2.viewer.tst@example.com', now() + interval '15 minutes'),
  ('m1.2.sales.tst@example.com', now() + interval '15 minutes'),
  ('m1.2.owner.tst@example.com', now() + interval '15 minutes'),
  ('m1.2.inactive.tst@example.com', now() + interval '15 minutes');

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
    '00000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'm1.2.manager.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مدير اختبار M1.2"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'm1.2.viewer.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مشاهد اختبار M1.2"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'm1.2.sales.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مبيعات اختبار M1.2"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'm1.2.owner.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مالك اختبار M1.2"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'm1.2.inactive.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مستخدم معطل M1.2"}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

-- D-26: the auth trigger creates only a bare profile. The fixtures insert
-- their branch memberships and roles explicitly.
update public.profiles
set branch_id = 'b0000000-0000-4000-8000-000000000001',
    role = case id
      when '00000000-0000-4000-8000-000000000001' then 'manager'
      when '00000000-0000-4000-8000-000000000003' then 'sales'
      when '00000000-0000-4000-8000-000000000004' then 'owner'
      else 'viewer'
    end,
    is_active = id <> '00000000-0000-4000-8000-000000000005'
where id in (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005'
);

update public.profiles
set branch_id = 'b0000000-0000-4000-8000-000000000002',
    role = 'viewer',
    is_active = true
where id = '00000000-0000-4000-8000-000000000002';

insert into public.user_branches (user_id, branch_id, is_default)
select fixture.user_id, fixture.branch_id, true
from (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'b0000000-0000-4000-8000-000000000002'::uuid),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid)
) as fixture(user_id, branch_id)
on conflict (user_id, branch_id) do update
set is_default = excluded.is_default;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select fixture.user_id, role.id, fixture.branch_id, true
from (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid, 'manager'::text, 'b0000000-0000-4000-8000-000000000001'::uuid),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'viewer'::text, 'b0000000-0000-4000-8000-000000000002'::uuid),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'sales'::text, 'b0000000-0000-4000-8000-000000000001'::uuid),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'owner'::text, 'b0000000-0000-4000-8000-000000000001'::uuid),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'viewer'::text, 'b0000000-0000-4000-8000-000000000001'::uuid)
) as fixture(user_id, role_code, branch_id)
join public.roles as role on role.code = fixture.role_code
on conflict (user_id, role_id, branch_id) do update
set is_primary = excluded.is_primary;

insert into public.cashboxes (id, branch_id, code, name_ar, account_id, is_default, is_active)
values (
  'c0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'TST-CASH',
  'خزنة اختبار M1.2',
  (select id from public.accounts where code = '1101'),
  true,
  true
)
on conflict (branch_id, code) do nothing;

insert into public.journal_entries (
  id,
  branch_id,
  entry_number,
  entry_date,
  description,
  status,
  total_debit,
  total_credit
)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    'TST-JV-001',
    current_date,
    'قيد اختبار الفرع الأول',
    'draft',
    100,
    100
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000002',
    'TST-JV-001',
    current_date,
    'قيد اختبار الفرع الثاني',
    'draft',
    100,
    100
  )
on conflict (branch_id, entry_number) do nothing;

insert into public.journal_entry_lines (
  journal_entry_id,
  line_number,
  account_id,
  debit,
  credit
)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    1,
    (select id from public.accounts where code = '1101'),
    100,
    0
  ),
  (
    'a0000000-0000-4000-8000-000000000001',
    2,
    (select id from public.accounts where code = '4100'),
    0,
    100
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    1,
    (select id from public.accounts where code = '1101'),
    100,
    0
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    2,
    (select id from public.accounts where code = '4100'),
    0,
    100
  )
on conflict (journal_entry_id, line_number) do nothing;

select public.no_plan();

-- ---------------------------------------------------------------------------
-- Manager in TST-01.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.is(
  public.current_branch(),
  'b0000000-0000-4000-8000-000000000001'::uuid,
  'manager current_branch is TST-01'
);
select public.ok(
  public.is_branch_member('b0000000-0000-4000-8000-000000000001'),
  'manager is a member of TST-01'
);
select public.ok(
  not public.is_branch_member('b0000000-0000-4000-8000-000000000002'),
  'manager is not a member of TST-02'
);
select public.ok(public.has_permission('users.view'), 'manager can view users');
select public.ok(
  not public.has_permission('users.view', 'b0000000-0000-4000-8000-000000000002'),
  'manager cannot view users in TST-02'
);
select public.ok(not public.has_permission('roles.manage'), 'manager cannot manage roles');
select public.ok(
  exists (select 1 from public.my_permissions() as permission(code) where code = 'users.view'),
  'manager my_permissions includes users.view'
);
select public.ok(
  not exists (select 1 from public.my_permissions() as permission(code) where code = 'roles.manage'),
  'manager my_permissions excludes roles.manage'
);
select public.is(
  (select count(*) from public.branches where code in ('TST-01', 'TST-02')),
  1::bigint,
  'manager sees one test branch'
);
select public.is(
  (
    select count(*)
    from public.profiles
    where id in (
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000005'
    )
  ),
  4::bigint,
  'manager sees four TST-01 profiles'
);
select public.is(
  (
    select count(*)
    from public.profiles
    where id = '00000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'manager cannot see the TST-02 viewer'
);
select public.is(
  (
    select count(*)
    from public.user_roles
    where user_id in (
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000005'
    )
  ),
  4::bigint,
  'manager sees four TST-01 role assignments'
);
select public.is((select count(*) from public.roles), 7::bigint, 'manager sees the role catalog');
select public.is(
  (select count(*) from public.permissions),
  97::bigint,
  'manager sees the permission catalog'
);
select public.is(
  (select count(*) from public.accounts),
  23::bigint,
  'manager sees the chart of accounts'
);
select public.is(
  (
    select count(*)
    from public.cashboxes
    where branch_id = 'b0000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'manager sees the TST-01 cashbox'
);
select public.is(
  (
    select count(*)
    from public.journal_entries
    where branch_id = 'b0000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'manager sees the TST-01 journal entry'
);
select public.is(
  (
    select count(*)
    from public.journal_entry_lines
    where journal_entry_id = 'a0000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'manager sees the TST-01 journal lines'
);
select public.is(
  (
    select count(*)
    from public.journal_entries
    where branch_id = 'b0000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'manager cannot see the TST-02 journal entry'
);

reset role;

-- ---------------------------------------------------------------------------
-- Viewer in TST-02.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select public.is(
  public.current_branch(),
  'b0000000-0000-4000-8000-000000000002'::uuid,
  'viewer current_branch is TST-02'
);
select public.is(
  (select count(*) from public.branches where code in ('TST-01', 'TST-02')),
  1::bigint,
  'viewer sees one test branch'
);
select public.is(
  (
    select count(*)
    from public.profiles
    where id in (
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000005'
    )
  ),
  1::bigint,
  'viewer sees only its own profile'
);
select public.is((select count(*) from public.roles), 0::bigint, 'viewer cannot see roles');
select public.is(
  (select count(*) from public.permissions),
  0::bigint,
  'viewer cannot see permissions'
);
select public.is((select count(*) from public.accounts), 0::bigint, 'viewer cannot see accounts');
select public.is((select count(*) from public.cashboxes), 0::bigint, 'viewer sees no TST-02 cashboxes');
select public.is(
  (select count(*) from public.journal_entries),
  0::bigint,
  'viewer cannot see journal entries'
);
select public.is(
  (select count(*) from public.journal_entry_lines),
  0::bigint,
  'viewer cannot see journal lines'
);
select public.ok(not public.has_permission('users.view'), 'viewer cannot view users');
select public.is(
  (select count(*) from public.my_permissions()),
  16::bigint,
  'viewer has the expected permission count'
);
select public.ok(
  not exists (select 1 from public.my_permissions() as permission(code) where code = 'users.view'),
  'viewer my_permissions excludes users.view'
);

reset role;

-- ---------------------------------------------------------------------------
-- Owner in TST-01.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

select public.is(
  public.current_branch(),
  'b0000000-0000-4000-8000-000000000001'::uuid,
  'owner current_branch is TST-01'
);
select public.ok(public.has_permission('roles.manage'), 'owner can manage roles');
select public.ok(
  public.is_branch_member('b0000000-0000-4000-8000-000000000002'),
  'owner is a member of every branch'
);
select public.is(
  (select count(*) from public.branches where code in ('TST-01', 'TST-02')),
  2::bigint,
  'owner sees both test branches'
);
select public.is(
  (
    select count(*)
    from public.profiles
    where id in (
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000005'
    )
  ),
  5::bigint,
  'owner sees all test profiles'
);
select public.is(
  (select count(*) from public.my_permissions()),
  97::bigint,
  'owner receives every permission'
);

reset role;

-- ---------------------------------------------------------------------------
-- Inactive user in TST-01.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);

select public.ok(public.current_branch() is null, 'inactive user has no current branch');
select public.is((select count(*) from public.branches), 0::bigint, 'inactive user sees no branches');
select public.ok(
  not public.has_permission('dashboard.view'),
  'inactive user has no permissions'
);
select public.is(
  (select count(*) from public.my_permissions()),
  0::bigint,
  'inactive user receives an empty permission list'
);

reset role;

-- ---------------------------------------------------------------------------
-- Direct-write protection for the manager.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.throws_ok(
  'insert into public.cashboxes (branch_id, code, name_ar, account_id) values (''b0000000-0000-4000-8000-000000000001'', ''TST-CASH-2'', ''خزنة اختبار'', (select id from public.accounts where code = ''1101''))',
  42501,
  null,
  'manager cannot insert cashboxes directly'
);
select public.throws_ok(
  'update public.cashboxes set name_ar = name_ar where branch_id = ''b0000000-0000-4000-8000-000000000001''',
  42501,
  null,
  'manager cannot update cashboxes directly'
);
select public.throws_ok(
  'delete from public.journal_entries where id = ''a0000000-0000-4000-8000-000000000001''',
  42501,
  null,
  'manager cannot delete journal entries directly'
);
do $$
declare
  affected bigint;
begin
  update public.system_settings
  set app_name = app_name;
  get diagnostics affected = row_count;
  perform public.ok(affected = 1, 'manager can update settings');
end;
$$;
do $$
declare
  affected bigint;
begin
  update public.branches
  set name = name
  where id = 'b0000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  perform public.ok(affected = 1, 'manager can update the current branch');
end;
$$;
do $$
declare
  affected bigint;
begin
  update public.branches
  set name = name
  where id = 'b0000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  perform public.ok(affected = 0, 'manager cannot update another branch');
end;
$$;
select public.throws_ok(
  'insert into public.branches (code, name) values (''TST-03'', ''فرع اختبار ثالث'')',
  42501,
  null,
  'manager cannot insert branches'
);
select public.throws_ok(
  'insert into public.user_roles (user_id, role_id, branch_id) values (''00000000-0000-4000-8000-000000000001'', (select id from public.roles where code = ''viewer''), ''b0000000-0000-4000-8000-000000000001'')',
  42501,
  null,
  'manager cannot write user roles directly'
);
select public.throws_ok(
  'insert into public.number_sequences (branch_id, document_type, year) values (''b0000000-0000-4000-8000-000000000001'', ''test'', 2026)',
  42501,
  null,
  'manager cannot write number sequences directly'
);
select public.throws_ok(
  'insert into public.profiles (id, full_name) values (gen_random_uuid(), ''اختبار'')',
  42501,
  null,
  'manager cannot insert profiles directly'
);
select public.throws_ok(
  'update public.profiles set full_name = full_name where id = ''00000000-0000-4000-8000-000000000001''',
  42501,
  null,
  'manager cannot update profiles directly'
);

reset role;

-- ---------------------------------------------------------------------------
-- Owner can create a branch; viewer cannot update settings.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

do $$
declare
  inserted bigint;
begin
  insert into public.branches (code, name)
  values ('TST-03', 'فرع اختبار ثالث');
  get diagnostics inserted = row_count;
  perform public.ok(inserted = 1, 'owner can insert branches');
end;
$$;

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare
  affected bigint;
begin
  update public.system_settings
  set app_name = app_name;
  get diagnostics affected = row_count;
  perform public.ok(affected = 0, 'viewer cannot update settings');
end;
$$;

reset role;

-- ---------------------------------------------------------------------------
-- Anonymous access is closed.
-- ---------------------------------------------------------------------------

create temp table anon_diag(result text);
grant insert, select on anon_diag to anon;

set local role anon;

do $$
begin
  perform count(*) from public.branches;
  insert into anon_diag values ('branches: no exception');
exception when others then
  insert into anon_diag values ('branches: ' || SQLSTATE);
end;
$$;

do $$
begin
  perform public.has_permission('dashboard.view');
  insert into anon_diag values ('has_permission: no exception');
exception when others then
  insert into anon_diag values ('has_permission: ' || SQLSTATE);
end;
$$;

reset role;

select public.is(
  (select result from anon_diag where result like 'branches:%'),
  'branches: 42501',
  'anon cannot read branches'
);
select public.is(
  (select result from anon_diag where result like 'has_permission:%'),
  'has_permission: 42501',
  'anon cannot execute has_permission'
);

select * from public.finish();

rollback;
