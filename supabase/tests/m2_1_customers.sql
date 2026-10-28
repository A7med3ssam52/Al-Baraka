-- M2.1 — Customers tests (pgTAP).
-- Self-contained fixtures + rollback. Fixed UUIDs keep asserts independent.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated;
grant execute on all functions in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures.
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, is_active)
values
  ('b0000000-0000-4000-8000-000000000001', 'TST-01', 'فرع اختبار M2.1', true),
  ('b0000000-0000-4000-8000-000000000002', 'TST-02', 'فرع اختبار M2.1 ثانٍ', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values
  ('m2.1.sales.tst@example.com', now() + interval '15 minutes'),
  ('m2.1.viewer.tst@example.com', now() + interval '15 minutes');

select public.no_plan();

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'm2.1.sales.tst@example.com', now(), '{"full_name":"مبيعات M2.1","default_branch":"TST-01"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'm2.1.viewer.tst@example.com', now(), '{"full_name":"مشاهد M2.1","default_branch":"TST-01"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values
  ('00000000-0000-4000-8000-000000000101', 'مبيعات M2.1', '+201000000101', 'sales', 'b0000000-0000-4000-8000-000000000001', true),
  ('00000000-0000-4000-8000-000000000102', 'مشاهد M2.1', '+201000000102', 'viewer', 'b0000000-0000-4000-8000-000000000001', true)
on conflict (id) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    branch_id = excluded.branch_id,
    is_active = excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
select u.id::uuid, b.id, true
from (values
  ('00000000-0000-4000-8000-000000000101', 'b0000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000102', 'b0000000-0000-4000-8000-000000000001')
) as u(id, branch) join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select u.id::uuid, r.id, b.id, true
from (values
  ('00000000-0000-4000-8000-000000000101', 'sales'),
  ('00000000-0000-4000-8000-000000000102', 'viewer')
) as u(id, role_code)
join public.roles as r on r.code = u.role_code
join public.branches as b on b.code = 'TST-01'
on conflict do nothing;

alter table public.customers disable trigger customers_block_delete;
delete from public.customers where code like 'CUS%' and code ~ '^CUS-[0-9]';
alter table public.customers enable trigger customers_block_delete;
update public.code_sequences set next_number = 1 where entity = 'customer';

-- ---------------------------------------------------------------------------
-- Section 1: validation helpers (run unauthenticated-safe; the functions are
-- immutable and granted to authenticated only, so run as superuser here).
-- ---------------------------------------------------------------------------

select public.is(public.validate_national_id('30212319901010'), false, 'NID must have 14 digits');
select public.is(public.validate_national_id('33301211234567'), false, 'NID from a future date is rejected');
select public.is(public.validate_national_id('20001352345677'), false, 'NID with month 13 is rejected');
select public.is(public.validate_national_id('21053512345671'), false, 'NID with impossible date is rejected');
select public.is(public.validate_national_id('29810122345671'), true, 'Valid 1900s-century NID accepted');
select public.is(public.validate_national_id('30308152345678'), true, 'Valid 2000s-century NID accepted');

select public.is(public.normalize_egypt_mobile('01012345678'), '+201012345678', '0-prefixed mobile normalizes');
select public.is(public.normalize_egypt_mobile('201012345678'), '+201012345678', '20-prefixed mobile normalizes');
select public.is(public.normalize_egypt_mobile('00201012345678'), '+201012345678', '00-prefix stripped');
select public.is(public.normalize_egypt_mobile('+201012345678'), '+201012345678', 'Already normal');

do $$
declare
  caught text;
begin
  caught := 'no_error';
  begin
    perform public.normalize_egypt_mobile('01412345678');
  exception when sqlstate '22023' then
    caught := 'invalid_mobile';
  end;
  if caught <> 'invalid_mobile' then
    raise exception 'expected invalid_mobile but got %', caught;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Section 2: customer creation through the RPC as sales.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}', true);

select public.ok(public.has_permission('customers.create'), 'sales can create customers');
select public.ok(public.has_permission('customers.view'), 'sales can view customers');
select public.ok(not public.has_permission('customers.archive'), 'sales cannot archive');

-- Direct table writes are closed (no INSERT policy).
select throws_ok(
  $t$insert into public.customers (code, full_name, national_id, mobile, branch_id)
    values ('CUS-9001', 'سازك مباشر', '30101152000001', '+201012345678',
            'b0000000-0000-4000-8000-000000000001')$t$,
  '42501',
  null,
  'Direct insert into customers is denied'
);

select public.is(
  (select count(*) from public.customers where national_id = '29810122345671'),
  0::bigint,
  'Direct insert denied leaves no row behind'
);

-- RLS denies writes, so the RPC runs as security definer.
select public.is(
  (select code from public.create_customer(
    'عامر زاهد سعفان', '29810122345671', '01012345678',
    '201123456780', 'موظف', 'بلفطية'
  )),
  'CUS-0001',
  'First customer gets CUS-0001'
);

select public.is(
  (select mobile from public.customers where national_id = '29810122345671'),
  '+201012345678',
  'Mobile was normalized on create'
);

-- Duplicate national ID.
select throws_ok(
  format('select public.create_customer(%L, %L, %L)',
    'عميل مكرر', '29810122345671', '01012345678'),
  '23505',
  null,
  'Duplicate national ID is rejected'
);

-- Invalid national ID.
select throws_ok(
  format('select public.create_customer(%L, %L, %L)',
    'عميل ثالث', '3010115200000', '01012345678'),
  '22023',
  null,
  'Wrong national ID length is rejected'
);

-- Duplicate check helper both before/after creation.
select public.ok(
  (public.check_customer_duplicates('29810122345671', '01012345678') -> 'national_id' ->> 'code') is not null,
  'Duplicate detection finds the existing customer'
);

select public.ok(
  (public.check_customer_duplicates('30211111111111', '01234567891') -> 'national_id' ->> 'code') is null,
  'No duplicate for a fresh identity'
);

-- Second customer gets an increasing code.
select public.is(
  (select code from public.create_customer(
    'سعاد مأمون عبدالله', '30308152345678', '01234567891', null, 'معلمة', 'زقازيق'
  )),
  'CUS-0002',
  'Second customer gets CUS-0002'
);

-- Status changes require the right permission.
select public.ok(
  (select status from public.set_customer_status(
    (select id from public.customers where code = 'CUS-0002'), 'inactive'
  )) = 'inactive',
  'Status changes to inactive'
);

select throws_ok(
  format('select public.set_customer_status((select id from public.customers where code = %L), %L)',
    'CUS-0002', 'archived'),
  '42501',
  null,
  'Archive requires customers.archive permission (sales lacks it)'
);

-- Deletes are always blocked.
select throws_ok(
  'delete from public.customers where full_name = ' || chr(39) || 'عامر زاهد سعفان' || chr(39),
  '42501',
  null,
  'Deletes are blocked behind archiving'
);

-- ---------------------------------------------------------------------------
-- Section 3: viewer — read-only.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}', true);

select public.is(
  (select count(*) from public.customers),
  2::bigint,
  'Viewer reads the customers it can see'
);

select throws_ok(
  format('select public.create_customer(%L, %L, %L)',
    'قاطع عميل', '20411011234561', '01100000001'),
  '42501',
  null,
  'Viewer cannot create a customer'
);

select public.finish();
rollback;
