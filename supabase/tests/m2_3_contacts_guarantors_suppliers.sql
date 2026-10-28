-- M2.3 — Customer contacts, guarantors, and suppliers tests (pgTAP).
-- Self-contained fixtures + rollback. Fixed UUIDs keep asserts independent.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Vaults/branches. Fixed UUIDs; the fixture user belongs to TST-02 only, so
-- every cross-branch assert is meaningful.
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, is_active)
values ('b0000000-0000-4000-8000-000000000002', 'TST-02', 'فرع اختبار M2.3', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values ('m2.3.supply.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000301', 'authenticated', 'authenticated', 'm2.3.supply.tst@example.com', now(), '{"full_name":"مخزون M2.3"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values ('00000000-0000-4000-8000-000000000301', 'مخزون M2.3', '+201000000301', 'inventory', 'b0000000-0000-4000-8000-000000000002', true)
on conflict (id) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    branch_id = excluded.branch_id,
    is_active = excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
select u.id::uuid, b.id, true
from (values ('00000000-0000-4000-8000-000000000301', 'b0000000-0000-4000-8000-000000000002')) as u(id, branch)
join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select u.id::uuid, r.id, b.id, (u.role_code = 'sales')
from (values
  ('00000000-0000-4000-8000-000000000301', 'sales'),
  ('00000000-0000-4000-8000-000000000301', 'inventory')
) as u(id, role_code)
join public.roles as r on r.code = u.role_code
join public.branches as b on b.code = 'TST-02'
on conflict do nothing;

alter table public.customers disable trigger customers_block_delete;
delete from public.customer_contacts where customer_id in (select id from public.customers where national_id = '30101152345672');
delete from public.customers where national_id = '30101152345672';
alter table public.customers enable trigger customers_block_delete;

insert into public.customers (code, full_name, national_id, mobile, branch_id)
values ('CUS-5232', 'عميل ضامن M2.3', '30101152345672', '+201033333001', 'b0000000-0000-4000-8000-000000000002');

delete from public.guarantors where national_id = '30101152345673';

-- ---------------------------------------------------------------------------
-- Section 1: suppliers through the RPC.
-- ---------------------------------------------------------------------------

alter table public.suppliers disable trigger audit_suppliers_change;
delete from public.suppliers where full_name in ('مورد الركن الصلب', 'مورد قطع الجنوط');
alter table public.suppliers enable trigger audit_suppliers_change;
update public.code_sequences set next_number = 77 where entity = 'supplier';

select public.no_plan();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000301","role":"authenticated"}', true);

select public.ok(public.has_permission('suppliers.view'), 'inventory can view suppliers');
select public.ok(public.has_permission('suppliers.create'), 'inventory can create suppliers');
select public.ok(public.has_permission('customers.view'), 'inventory can view customers');

select public.is(
  (select code from public.create_supplier(
    'مورد الركن الصلب', '01112345678', 'أحمد الركن', null, null, 'المنصورة'
  )),
  'SUP-0077',
  'the supplier sequence continues from code_sequences'
);

select public.is(
  (select phone from public.suppliers where code = 'SUP-0077'),
  '+201112345678',
  'the supplier phone is normalized on create'
);

select public.is(
  (select code from public.create_supplier(
    'مورد قطع الجنوط', '01098765432'
  )),
  'SUP-0078',
  'the next supplier advances the sequence atomically'
);

select public.throws_ok(
  $$ select public.create_supplier('ن', '01012345678') $$,
  '22023',
  null,
  'a supplier name shorter than 2 characters is rejected'
);

select public.throws_ok(
  format('select public.create_supplier(%L, %L)', 'مورد بروب', '01412345678'),
  '22023',
  null,
  'an invalid supplier mobile is rejected'
);

select public.is(
  (select contact_name from public.update_supplier(
    (select id from public.suppliers where code = 'SUP-0077'),
    'مورد الركن الصلب', '01012345678', 'محمود التغليف', null, '6 أكتوبر'
  )),
  'محمود التغليف',
  'the supplier update stores the contact person'
);

select public.is(
  (select phone from public.update_supplier(
    (select id from public.suppliers where code = 'SUP-0077'),
    'مورد الركن الصلب', '01012345678', 'محمود التغليف', null, '6 أكتوبر'
  )),
  '+201012345678',
  'the supplier update normalizes the phone'
);

select public.throws_ok(
  format('select public.update_supplier(gen_random_uuid()::uuid, %L, %L)', 'مورد غير موجود', '01012345678'),
  'P0001',
  null,
  'updating a missing supplier is rejected'
);

select public.is(
  (select status from public.set_supplier_status(
    (select id from public.suppliers where code = 'SUP-0078'), 'inactive')),
  'inactive',
  'the supplier status changes to inactive'
);

select public.is(
  (select count(*) from public.list_suppliers('active')),
  1::bigint,
  'active listing excludes inactive suppliers'
);

select public.is(
  (select count(*) from public.list_suppliers('all')),
  2::bigint,
  'listing all statuses returns both suppliers'
);

select public.is(
  (select count(*) from public.list_suppliers('all', 'جنوط')),
  1::bigint,
  'unified search finds a supplier by its Arabic name'
);

-- ---------------------------------------------------------------------------
-- Section 2: customer contacts.
-- ---------------------------------------------------------------------------

select public.is(
  (select count(*) from public.add_customer_contact(
    (select id from public.customers where national_id = '30101152345672'),
    'زميل عمل', '01512345678', 'يتفق على والدته بتفويض توقيع'
  )),
  1::bigint,
  'the added contact is stored'
);

select public.is(
  (select count(*) from public.list_customer_contacts(
    (select id from public.customers where national_id = '30101152345672'))),
  1::bigint,
  'the added contact is listed'
);

select public.is(
  (select mobile from public.list_customer_contacts(
    (select id from public.customers where national_id = '30101152345672'))
  where label = 'زميل عمل'),
  '+201512345678',
  'the contact mobile is normalized on create'
);

select public.throws_ok(
  $$ select public.add_customer_contact(
    (select id from public.customers where national_id = '30101152345672'),
    ' ', '01512345678') $$,
  '22023',
  null,
  'a contact with an empty label is rejected'
);

select public.throws_ok(
  $$ select public.add_customer_contact(
    (select id from public.customers where national_id = '30101152345672'),
    'أسرة', '01412345678') $$,
  '22023',
  null,
  'a contact with an invalid mobile is rejected'
);

select public.throws_ok(
  $$ select public.delete_customer_contact(gen_random_uuid()) $$,
  'P0001',
  null,
  'deleting a missing contact is rejected'
);

select public.lives_ok(
  $$ select public.delete_customer_contact(
    (select id from public.customer_contacts
     where customer_id = (select id from public.customers where national_id = '30101152345672')
       and label = 'زميل عمل')) $$,
  'the contact delete completes silently'
);

select public.is(
  (select count(*) from public.list_customer_contacts(
    (select id from public.customers where national_id = '30101152345672'))),
  0::bigint,
  'the contact list is empty after the delete'
);

-- ---------------------------------------------------------------------------
-- Section 3: guarantors.
-- ---------------------------------------------------------------------------

select public.is(
  (select national_id from public.add_guarantor(
    'ضامن موثق M2.3', '30101152345673', '01212345678', 'موظف حكومة'
  )),
  '30101152345673',
  'a valid guarantor is created with its national id'
);

select public.throws_ok(
  $$ select public.add_guarantor('عم', '30101152345677', '01212345678') $$,
  '22023',
  null,
  'a guarantor name shorter than 3 characters is rejected'
);

select public.throws_ok(
  $$ select public.add_guarantor('ضامن باطل', '30001352345677', '01212345678') $$,
  '22023',
  null,
  'a guarantor with month 13 is rejected'
);

select public.is(
  (select count(*) from public.list_guarantors('30101152345673')),
  1::bigint,
  'the guarantor search finds the valid record'
);

select public.finish();
rollback;
