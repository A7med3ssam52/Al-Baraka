-- M4.3 — Contracts (pgTAP).

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

insert into public.branches (id, code, name, is_active)
values ('b0000000-0000-4000-8000-000000000045', 'TST-45', 'فرع عقد M4.3', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values ('m4.3.s.tst@example.com', now() + interval '15 minutes'),
       ('m4.3.m.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000336', 'authenticated', 'authenticated', 'm4.3.s.tst@example.com', now(), '{"full_name":"عقد S"}'::jsonb, now(), now()),
       ('00000000-0000-4000-8000-000000000337', 'authenticated', 'authenticated', 'm4.3.m.tst@example.com', now(), '{"full_name":"عقد M"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values ('00000000-0000-4000-8000-000000000336', 'عقد S', '+201000000392', 'sales', 'b0000000-0000-4000-8000-000000000045', true),
       ('00000000-0000-4000-8000-000000000337', 'عقد M', '+201000000393', 'manager', 'b0000000-0000-4000-8000-000000000045', true)
on conflict (id) do update set full_name=excluded.full_name, phone=excluded.phone, role=excluded.role, branch_id=excluded.branch_id, is_active=excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
values ('00000000-0000-4000-8000-000000000336', 'b0000000-0000-4000-8000-000000000045', true),
       ('00000000-0000-4000-8000-000000000337', 'b0000000-0000-4000-8000-000000000045', true)
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select u.id::uuid, r.id, 'b0000000-0000-4000-8000-000000000045'::uuid, true
from (values ('00000000-0000-4000-8000-000000000336','sales'),('00000000-0000-4000-8000-000000000337','manager')) as u(id,rc)
join public.roles r on r.code=u.rc
on conflict do nothing;

-- cleanup
delete from public.contract_guarantors where contract_id in (select id from public.contracts where branch_id='b0000000-0000-4000-8000-000000000045');
delete from public.contracts where branch_id='b0000000-0000-4000-8000-000000000045';
delete from public.payments where branch_id='b0000000-0000-4000-8000-000000000045';
delete from public.sales_invoice_items where invoice_id in (select id from public.sales_invoices where branch_id='b0000000-0000-4000-8000-000000000045');
delete from public.sales_invoices where branch_id='b0000000-0000-4000-8000-000000000045';
delete from public.vehicles where chassis_no='M43CH00000001';
delete from public.products where code='PRD-4300';
update public.code_sequences set next_number=4300 where entity in ('product','vehicle','sales_invoice','customer','contract','journal_entry');

select public.no_plan();

-- manager creates product + vehicle
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000337","role":"authenticated"}', true);

select public.create_product('منتج عقد M4.3', null, null, null, 'قطعة', null, null, 50);
select public.create_vehicle('M43CH00000001','M43EN00000001','motorcycle',null,null,null,null,null,null,null,30000,0,0,null,40000,'b0000000-0000-4000-8000-000000000045');

-- sales user creates customer + installment draft
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000336","role":"authenticated"}', true);

select public.create_customer('عميل عقد M4.3','29810122345622','01012345678');

select public.save_sales_invoice(
  (select id from public.customers where code='CUS-4300'),
  jsonb_build_array(jsonb_build_object(
    'vehicle_id',(select id from public.vehicles where code='VEH-4300'),
    'quantity',1,'unit_price',10000,'discount',0
  )),
  null, current_date, 'installment', 0, 0, null
);

select public.is((select number from public.sales_invoices where branch_id='b0000000-0000-4000-8000-000000000045'), 'SINV-04300', 'installment draft created');

-- save contract
select public.is(
  (select number from public.save_contract(
    (select id from public.sales_invoices where number='SINV-04300'),
    2000, 12, 'monthly', null, current_date + 30, null, 'عقد اختبار M4.3'
  )),
  'CON-04300',
  'contract takes the next CON number'
);

select public.is(
  (select status from public.contracts where number='CON-04300'),
  'draft',
  'contract starts as draft'
);

select public.is(
  (select financed_amount from public.contracts where number='CON-04300'),
  8000::numeric,
  'financed amount is total minus down payment'
);

select public.is(
  (select down_payment from public.contracts where number='CON-04300'),
  2000::numeric,
  'down payment is stored'
);

-- cancel contract
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000337","role":"authenticated"}', true);

select public.is(
  (select status from public.cancel_contract(
    (select id from public.contracts where number='CON-04300'), 'إلغاء اختباري'
  )),
  'cancelled',
  'a draft contract can be cancelled'
);

select public.finish();
rollback;
