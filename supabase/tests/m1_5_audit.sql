-- M1.5 — Audit log and UI-guard support tests (pgTAP).
-- Run with: supabase test db
--
-- Self-contained: creates two branches and three staff users, exercises audit
-- triggers, redaction, visibility, pagination, and append-only behavior.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures.
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, address, is_active)
values
  ('b4000000-0000-4000-8000-000000000001', 'TST-61', 'فرع مراجعة M1.5 أول', 'اختبار M1.5', true),
  ('b4000000-0000-4000-8000-000000000002', 'TST-62', 'فرع مراجعة M1.5 ثانٍ', 'اختبار M1.5', true)
on conflict (code) do update
set name = excluded.name,
    address = excluded.address,
    is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values
  ('m1.5.manager.tst@example.com', now() + interval '15 minutes'),
  ('m1.5.viewer.tst@example.com', now() + interval '15 minutes'),
  ('m1.5.owner.tst@example.com', now() + interval '15 minutes');

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
    '40000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'm1.5.manager.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مدير مراجعة M1.5"}'::jsonb,
    now(),
    now()
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'm1.5.viewer.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مشاهد مراجعة M1.5"}'::jsonb,
    now(),
    now()
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'm1.5.owner.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مالك مراجعة M1.5"}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

update public.profiles
set branch_id = 'b4000000-0000-4000-8000-000000000001'::uuid,
    role = case id
      when '40000000-0000-4000-8000-000000000001' then 'manager'
      when '40000000-0000-4000-8000-000000000002' then 'viewer'
      when '40000000-0000-4000-8000-000000000003' then 'owner'
      else 'viewer'
    end
where id in (
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000003'
);

insert into public.user_branches (user_id, branch_id, is_default)
select fixture.user_id, fixture.branch_id, true
from (
  values
    ('40000000-0000-4000-8000-000000000001'::uuid, 'b4000000-0000-4000-8000-000000000001'::uuid),
    ('40000000-0000-4000-8000-000000000002'::uuid, 'b4000000-0000-4000-8000-000000000001'::uuid),
    ('40000000-0000-4000-8000-000000000003'::uuid, 'b4000000-0000-4000-8000-000000000001'::uuid)
) as fixture(user_id, branch_id)
on conflict (user_id, branch_id) do update
set is_default = excluded.is_default;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select fixture.user_id, role.id, fixture.branch_id, true
from (
  values
    ('40000000-0000-4000-8000-000000000001'::uuid, 'manager'::text, 'b4000000-0000-4000-8000-000000000001'::uuid),
    ('40000000-0000-4000-8000-000000000002'::uuid, 'viewer'::text, 'b4000000-0000-4000-8000-000000000001'::uuid),
    ('40000000-0000-4000-8000-000000000003'::uuid, 'owner'::text, 'b4000000-0000-4000-8000-000000000001'::uuid)
) as fixture(user_id, role_code, branch_id)
join public.roles as role on role.code = fixture.role_code
on conflict (user_id, role_id, branch_id) do update
set is_primary = excluded.is_primary;

select public.no_plan();

-- ---------------------------------------------------------------------------
-- Manager actions are attributed and visible in scope.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

update public.branches
set name = 'فرع مراجعة M1.5 أول — محدث'
where id = 'b4000000-0000-4000-8000-000000000001';

select public.is(
  (
    select count(*)
    from public.list_audit_logs(
      p_action => 'update',
      p_table => 'branches',
      p_branch_id => 'b4000000-0000-4000-8000-000000000001'::uuid
    )
  ),
  1::bigint,
  'a branch update creates one audit row'
);

select public.is(
  (
    select user_name
    from public.list_audit_logs(
      p_action => 'update',
      p_table => 'branches',
      p_branch_id => 'b4000000-0000-4000-8000-000000000001'::uuid
    )
    limit 1
  ),
  'مدير مراجعة M1.5',
  'the audit row is attributed to the acting manager'
);

select public.ok(
  (
    select old_data ? 'name' and new_data ? 'name'
    from public.list_audit_logs(
      p_action => 'update',
      p_table => 'branches',
      p_branch_id => 'b4000000-0000-4000-8000-000000000001'::uuid
    )
    limit 1
  ),
  'the audit row stores old and new branch data'
);

select public.is(
  (
    select count(*)
    from public.list_audit_logs(p_table => 'system_settings', p_action => 'update')
  ),
  0::bigint,
  'no settings audit row exists before the settings update'
);

select public.is(
  public.update_system_settings(
    p_app_name => 'معرض البركة',
    p_document_prefixes => '{"sales_invoice":"SAL","purchase_invoice":"PUR","contract":"CON","receipt":"REC","payment":"PAY","journal_entry":"JV"}'::jsonb
  ) ->> 'app_name',
  'معرض البركة',
  'manager updates the settings'
);

select public.ok(
  (
    select count(*) > 0
    from public.list_audit_logs(p_table => 'system_settings', p_action => 'update')
  ),
  'the settings update is audited'
);

select public.ok(
  (
    select branch_id is null
    from public.list_audit_logs(p_table => 'system_settings', p_action => 'update')
    limit 1
  ),
  'global settings rows are visible with a null branch'
);

-- ---------------------------------------------------------------------------
-- Branch isolation and viewer denial.
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{}', true);

update public.branches
set name = 'فرع مراجعة M1.5 ثانٍ — خارج النطاق'
where id = 'b4000000-0000-4000-8000-000000000002';

select public.ok(
  exists (
    select 1 from public.audit_logs
    where table_name = 'branches'
      and record_id = 'b4000000-0000-4000-8000-000000000002'
  ),
  'the out-of-scope branch update was audited at the database level'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.is(
  (
    select count(*)
    from public.list_audit_logs(
      p_branch_id => 'b4000000-0000-4000-8000-000000000002'::uuid
    )
  ),
  0::bigint,
  'manager cannot read audit rows for another branch'
);

select public.is(
  (
    select count(*)
    from public.audit_logs
    where branch_id = 'b4000000-0000-4000-8000-000000000002'::uuid
  ),
  0::bigint,
  'RLS hides out-of-scope audit rows from direct reads'
);

select public.ok(
  (
    select count(*) > 0
    from public.list_audit_logs(
      p_branch_id => 'b4000000-0000-4000-8000-000000000001'::uuid
    )
  ),
  'manager can read audit rows for their branch'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select public.throws_ok(
  $$ select * from public.list_audit_logs() $$,
  '42501',
  'forbidden',
  'viewer cannot query the audit log'
);

select public.throws_ok(
  $$ select * from public.audit_log_filter_options() $$,
  '42501',
  'forbidden',
  'viewer cannot query audit filter options'
);

select public.throws_ok(
  $$ insert into public.audit_logs (action, table_name) values ('insert', 'forged') $$,
  '42501',
  null,
  'clients cannot insert audit rows directly'
);

select public.throws_ok(
  $$ update public.audit_logs set action = 'forged' where true $$,
  '42501',
  null,
  'clients cannot update audit rows directly'
);

select public.throws_ok(
  $$ delete from public.audit_logs where true $$,
  '42501',
  null,
  'clients cannot delete audit rows directly'
);

-- ---------------------------------------------------------------------------
-- Redaction.
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{}', true);

insert into public.staff_invitations (
  id,
  token_hash,
  full_name,
  phone,
  role_codes,
  primary_role,
  branch_ids,
  default_branch_id,
  created_by
)
values (
  '44000000-0000-4000-8000-000000000001',
  'hash-m1-5-secret',
  'دعوة مراجعة M1.5',
  '01000000099',
  array['viewer']::text[],
  'viewer',
  array['b4000000-0000-4000-8000-000000000001']::uuid[],
  'b4000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001'
);

update public.staff_invitations
set token_hash = 'hash-m1-5-secret-updated'
where id = '44000000-0000-4000-8000-000000000001';

select public.ok(
  (
    select not (old_data ? 'token_hash') and not (new_data ? 'token_hash')
    from public.audit_logs
    where table_name = 'staff_invitations'
      and record_id = '44000000-0000-4000-8000-000000000001'
      and action = 'update'
    limit 1
  ),
  'the invitation token hash is stripped from audit payloads'
);

select public.ok(
  (
    select coalesce(new_data::text, '') not like '%hash-m1-5-secret%'
    from public.audit_logs
    where table_name = 'staff_invitations'
      and record_id = '44000000-0000-4000-8000-000000000001'
      and action = 'update'
    limit 1
  ),
  'the plaintext token value never appears in the audit payload'
);

select public.is(
  (
    select branch_id
    from public.audit_logs
    where table_name = 'staff_invitations'
      and record_id = '44000000-0000-4000-8000-000000000001'
    limit 1
  ),
  'b4000000-0000-4000-8000-000000000001'::uuid,
  'invitation audit rows use the default branch as their branch scope'
);

-- ---------------------------------------------------------------------------
-- Filter options, pagination, and additional sensitive tables.
-- ---------------------------------------------------------------------------

update public.profiles
set full_name = 'مدير مراجعة M1.5 — محدث'
where id = '40000000-0000-4000-8000-000000000001';

update public.roles
set description = 'تحديث وصف دور المالك في اختبار M1.5'
where code = 'owner';

update public.cashboxes
set name_ar = 'الخزنة الرئيسية — محدثة'
where branch_id = 'b4000000-0000-4000-8000-000000000001';

update public.user_roles
set is_primary = false
where user_id = '40000000-0000-4000-8000-000000000001';

select public.ok(
  (
    (select count(*) >= 1 from public.audit_logs where action = 'update' and table_name = 'profiles' and record_id = '40000000-0000-4000-8000-000000000001')
    and (select count(*) >= 1 from public.audit_logs where action = 'update' and table_name = 'roles' and record_id = (select id::text from public.roles where code = 'owner'))
    and (select count(*) >= 1 from public.audit_logs where action = 'update' and table_name = 'cashboxes' and branch_id = 'b4000000-0000-4000-8000-000000000001'::uuid)
    and (select count(*) >= 1 from public.audit_logs where action = 'update' and table_name = 'user_roles' and record_id = (select id::text from public.user_roles where user_id = '40000000-0000-4000-8000-000000000001' and branch_id = 'b4000000-0000-4000-8000-000000000001'::uuid limit 1))
  ),
  'profile, role, cashbox, and role-assignment changes are audited'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.ok(
  (public.audit_log_filter_options() -> 'actions') ? 'update',
  'filter options include the update action'
);

select public.ok(
  (public.audit_log_filter_options() -> 'tables') ? 'branches',
  'filter options include the branches table'
);

select public.ok(
  (public.audit_log_filter_options() -> 'users') @> jsonb_build_array(
    jsonb_build_object(
      'id', '40000000-0000-4000-8000-000000000001',
      'name', 'مدير مراجعة M1.5 — محدث'
    )
  ),
  'filter options include the acting manager'
);

-- Generate enough rows to exercise pagination.
do $$
declare
  index integer;
begin
  for index in 1..25 loop
    update public.branches
    set name = 'فرع ترقيم الصفحات ' || index::text
    where id = 'b4000000-0000-4000-8000-000000000001';
  end loop;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.is(
  (
    select count(*)
    from public.list_audit_logs(
      p_table => 'branches',
      p_action => 'update',
      p_branch_id => 'b4000000-0000-4000-8000-000000000001'::uuid,
      p_limit => 5
    )
  ),
  5::bigint,
  'the audit query honors the page size'
);

select public.ok(
  (
    select max(total_count) >= 26
    from public.list_audit_logs(
      p_table => 'branches',
      p_action => 'update',
      p_branch_id => 'b4000000-0000-4000-8000-000000000001'::uuid,
      p_limit => 5
    )
  ),
  'the audit query returns the filtered total count'
);

select public.is(
  (
    select count(*)
    from public.list_audit_logs(
      p_table => 'branches',
      p_action => 'update',
      p_branch_id => 'b4000000-0000-4000-8000-000000000001'::uuid,
      p_limit => 5,
      p_offset => 5
    )
  ),
  5::bigint,
  'the audit query honors the page offset'
);

select public.matches(
  public.next_document_number(
    'sales_invoice',
    'b4000000-0000-4000-8000-000000000001'
  ),
  '^SAL-[0-9]{4}-00001$',
  'number allocation still works with audit triggers enabled'
);

select public.is(
  (
    select count(*)
    from public.audit_logs
    where table_name = 'number_sequences'
  ),
  0::bigint,
  'document numbering does not flood the audit log'
);

reset role;

select * from public.finish();

rollback;
