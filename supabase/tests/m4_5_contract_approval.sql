-- M4.5 — Approve contract (pgTAP).

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

insert into public.branches (id, code, name, is_active)
values ('b0000000-0000-4000-8000-000000000047', 'TST-47', 'فرع اعتماد عقد M4.5', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values ('m4.5.m.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000339', 'authenticated', 'authenticated', 'm4.5.m.tst@example.com', now(), '{"full_name":"اعتماد M"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values ('00000000-0000-4000-8000-000000000339', 'اعتماد M', '+201000000395', 'manager', 'b0000000-0000-4000-8000-000000000047', true)
on conflict (id) do update set full_name=excluded.full_name, phone=excluded.phone, role=excluded.role, branch_id=excluded.branch_id, is_active=excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
values ('00000000-0000-4000-8000-000000000339', 'b0000000-0000-4000-8000-000000000047', true)
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select '00000000-0000-4000-8000-000000000339'::uuid, r.id, 'b0000000-0000-4000-8000-000000000047'::uuid, true
from public.roles r where r.code='manager'
on conflict do nothing;

-- fund cashbox
update public.cashboxes set current_balance=100000 where branch_id='b0000000-0000-4000-8000-000000000047' and is_default;
delete from public.installments where schedule_id in (select id from public.installment_schedules where contract_id in (select id from public.contracts where branch_id='b0000000-0000-4000-8000-000000000047'));
delete from public.installment_schedules where contract_id in (select id from public.contracts where branch_id='b0000000-0000-4000-8000-000000000047');
delete from public.contract_guarantors where contract_id in (select id from public.contracts where branch_id='b0000000-0000-4000-8000-000000000047');
delete from public.contracts where branch_id='b0000000-0000-4000-8000-000000000047';
delete from public.payments where branch_id='b0000000-0000-4000-8000-000000000047';
delete from public.sales_invoice_items where invoice_id in (select id from public.sales_invoices where branch_id='b0000000-0000-4000-8000-000000000047');
delete from public.sales_invoices where branch_id='b0000000-0000-4000-8000-000000000047';
delete from public.stock_movements where branch_id='b0000000-0000-4000-8000-000000000047';
delete from public.product_stock where branch_id='b0000000-0000-4000-8000-000000000047';
delete from public.vehicles where chassis_no='M45CH00000001';
delete from public.products where code='PRD-4500';
update public.code_sequences set next_number=4500 where entity in ('product','vehicle','sales_invoice','customer','contract','journal_entry');

select public.no_plan();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000339","role":"authenticated"}', true);

-- product + vehicle
select public.create_product('منتج اعتماد عقد M4.5', null, null, null, 'قطعة', null, null, 50);
select public.create_vehicle('M45CH00000001','M45EN00000001','motorcycle',null,null,null,null,null,null,null,30000,0,0,null,40000,'b0000000-0000-4000-8000-000000000047');

-- opening stock
select public.record_stock_movement('opening', 5, (select id from public.products where code='PRD-4500'), null, 50, 'b0000000-0000-4000-8000-000000000047');

-- customer
select public.create_customer('عميل اعتماد عقد M4.5','29810122345644','01012345678');

-- installment draft (total 10000)
select public.save_sales_invoice(
  (select id from public.customers where code='CUS-4500'),
  jsonb_build_array(jsonb_build_object(
    'vehicle_id',(select id from public.vehicles where code='VEH-4500'),
    'quantity',1,'unit_price',10000,'discount',0
  )),
  null, current_date, 'installment', 0, 0, null
);

-- contract (down 2000, financed 8000, 4 installments monthly)
select public.save_contract(
  (select id from public.sales_invoices where number='SINV-04500'),
  2000, 4, 'monthly', null, current_date + 30, null, 'عقد اعتماد M4.5'
);

-- generate schedule
select public.generate_installment_schedule(
  (select id from public.contracts where number='CON-04500'), false
);

-- approve contract
select public.is(
  (select status from public.approve_contract(
    (select id from public.contracts where number='CON-04500')
  )),
  'active',
  'contract is activated'
);

select public.is(
  (select status from public.vehicles where code='VEH-4500'),
  'sold',
  'vehicle is marked sold'
);

select public.is(
  (select status from public.sales_invoices where number='SINV-04500'),
  'approved',
  'sales invoice is approved'
);

select public.is(
  (select count(*) from public.stock_movements where reference_type='sales_invoice' and branch_id='b0000000-0000-4000-8000-000000000047'),
  1::bigint,
  'stock movement posted'
);

select public.is(
  (select count(*) from public.payments where contract_id=(select id from public.contracts where number='CON-04500')),
  1::bigint,
  'down payment recorded'
);

select public.is(
  (select count(*) from public.customer_transactions where reference_type='contract' and branch_id='b0000000-0000-4000-8000-000000000047'),
  2::bigint,
  'sale and down payment recorded for customer'
);

select public.is(
  (select count(*) from public.journal_entries where source_type='contract' and branch_id='b0000000-0000-4000-8000-000000000047'),
  1::bigint,
  'journal entry posted'
);

-- idempotency
select public.throws_ok(
  $$ select public.approve_contract((select id from public.contracts where number='CON-04500')) $$,
  'P0001',
  null,
  'a second approval is rejected'
);

select public.finish();
rollback;
