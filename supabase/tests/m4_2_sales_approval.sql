-- M4.2 — Approve a cash sale (pgTAP).

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

insert into public.branches (id, code, name, is_active)
values ('b0000000-0000-4000-8000-000000000044', 'TST-44', 'فرع بيع M4.2', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values ('m4.2.s.tst@example.com', now() + interval '15 minutes'),
       ('m4.2.m.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000334', 'authenticated', 'authenticated', 'm4.2.s.tst@example.com', now(), '{"full_name":"بيع S"}'::jsonb, now(), now()),
       ('00000000-0000-4000-8000-000000000335', 'authenticated', 'authenticated', 'm4.2.m.tst@example.com', now(), '{"full_name":"بيع M"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values ('00000000-0000-4000-8000-000000000334', 'بيع S', '+201000000390', 'sales', 'b0000000-0000-4000-8000-000000000044', true),
       ('00000000-0000-4000-8000-000000000335', 'بيع M', '+201000000391', 'manager', 'b0000000-0000-4000-8000-000000000044', true)
on conflict (id) do update set full_name=excluded.full_name, phone=excluded.phone, role=excluded.role, branch_id=excluded.branch_id, is_active=excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
values ('00000000-0000-4000-8000-000000000334', 'b0000000-0000-4000-8000-000000000044', true),
       ('00000000-0000-4000-8000-000000000335', 'b0000000-0000-4000-8000-000000000044', true)
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select u.id::uuid, r.id, 'b0000000-0000-4000-8000-000000000044'::uuid, true
from (values ('00000000-0000-4000-8000-000000000334','sales'),('00000000-0000-4000-8000-000000000335','manager')) as u(id,rc)
join public.roles r on r.code=u.rc
on conflict do nothing;

-- cleanup
delete from public.sales_invoice_items where invoice_id in (select id from public.sales_invoices where branch_id='b0000000-0000-4000-8000-000000000044');
delete from public.sales_invoices where branch_id='b0000000-0000-4000-8000-000000000044';
delete from public.stock_movements where branch_id='b0000000-0000-4000-8000-000000000044';
delete from public.product_stock where branch_id='b0000000-0000-4000-8000-000000000044';
delete from public.vehicles where chassis_no='M42CH00000001';
delete from public.products where code='PRD-4200';
update public.code_sequences set next_number=4200 where entity in ('product','vehicle','sales_invoice','customer','journal_entry');
update public.system_settings set default_discount_limit=0 where id;

-- fund cashbox
update public.cashboxes set current_balance=100000 where branch_id='b0000000-0000-4000-8000-000000000044' and is_default;

select public.no_plan();

-- manager creates product + vehicle
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000335","role":"authenticated"}', true);

select public.create_product('منتج بيع M4.2', null, null, null, 'قطعة', null, null, 50);

select public.record_stock_movement('opening', 10, (select id from public.products where code='PRD-4200'), null, 50, 'b0000000-0000-4000-8000-000000000044');
select public.create_vehicle(
  'M42CH00000001', 'M42EN00000001', 'motorcycle', null, null, null,
  null, null, null, null, 30000, 0, 0, null, 40000,
  'b0000000-0000-4000-8000-000000000044'
);

-- sales user creates customer + draft
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000334","role":"authenticated"}', true);

select public.create_customer('عميل بيع M4.2','29810122345611','01012345678');

select public.save_sales_invoice(
  (select id from public.customers where code='CUS-4200'),
  jsonb_build_array(
    jsonb_build_object('vehicle_id',(select id from public.vehicles where code='VEH-4200'),'quantity',1,'unit_price',35000,'discount',0),
    jsonb_build_object('product_id',(select id from public.products where code='PRD-4200'),'quantity',2,'unit_price',50,'discount',0)
  ),
  null, current_date, 'cash', 0, 35100, null
);

select public.is((select number from public.sales_invoices where branch_id='b0000000-0000-4000-8000-000000000044'), 'SINV-04200', 'draft created');

-- manager approves
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000335","role":"authenticated"}', true);

select public.is(
  (select status from public.approve_sales_invoice((select id from public.sales_invoices where number='SINV-04200'))),
  'approved',
  'approval returns approved status'
);

select public.is(
  (select status from public.vehicles where code='VEH-4200'),
  'sold',
  'vehicle is marked sold'
);

select public.is(
  (select count(*) from public.stock_movements where reference_type='sales_invoice' and branch_id='b0000000-0000-4000-8000-000000000044'),
  2::bigint,
  'two stock movements posted'
);

select public.is(
  (select count(*) from public.customer_transactions where reference_type='sales_invoice' and branch_id='b0000000-0000-4000-8000-000000000044'),
  2::bigint,
  'sale and payment recorded for customer'
);

select public.is(
  (select count(*) from public.journal_entries where source_type='sales_invoice' and branch_id='b0000000-0000-4000-8000-000000000044'),
  1::bigint,
  'journal entry posted'
);

select public.is(
  (select count(*) from public.cash_transactions where reference_type='sales_invoice' and branch_id='b0000000-0000-4000-8000-000000000044'),
  1::bigint,
  'cash receipt posted'
);

-- idempotency
select public.throws_ok(
  $$ select public.approve_sales_invoice((select id from public.sales_invoices where number='SINV-04200')) $$,
  'P0001',
  null,
  'a second approval is rejected'
);

select public.throws_ok(
  $$ select public.approve_sales_invoice('00000000-0000-4000-8000-000000000999'::uuid) $$,
  'P0001',
  null,
  'an unknown invoice is rejected'
);

-- sales role cannot approve
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000334","role":"authenticated"}', true);
select public.throws_ok(
  $$ select public.approve_sales_invoice((select id from public.sales_invoices where number='SINV-04200')) $$,
  '42501',
  null,
  'sales role cannot approve'
);

select public.finish();
rollback;
