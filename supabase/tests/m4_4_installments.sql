-- M4.4 — Installment schedule (pgTAP).

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

insert into public.branches (id, code, name, is_active)
values ('b0000000-0000-4000-8000-000000000046', 'TST-46', 'فرع أقساط M4.4', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values ('m4.4.m.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000338', 'authenticated', 'authenticated', 'm4.4.m.tst@example.com', now(), '{"full_name":"أقساط M"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values ('00000000-0000-4000-8000-000000000338', 'أقساط M', '+201000000394', 'manager', 'b0000000-0000-4000-8000-000000000046', true)
on conflict (id) do update set full_name=excluded.full_name, phone=excluded.phone, role=excluded.role, branch_id=excluded.branch_id, is_active=excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
values ('00000000-0000-4000-8000-000000000338', 'b0000000-0000-4000-8000-000000000046', true)
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select '00000000-0000-4000-8000-000000000338'::uuid, r.id, 'b0000000-0000-4000-8000-000000000046'::uuid, true
from public.roles r where r.code='manager'
on conflict do nothing;

-- cleanup
delete from public.installments where schedule_id in (select id from public.installment_schedules where contract_id in (select id from public.contracts where branch_id='b0000000-0000-4000-8000-000000000046'));
delete from public.installment_schedules where contract_id in (select id from public.contracts where branch_id='b0000000-0000-4000-8000-000000000046');
delete from public.contract_guarantors where contract_id in (select id from public.contracts where branch_id='b0000000-0000-4000-8000-000000000046');
delete from public.contracts where branch_id='b0000000-0000-4000-8000-000000000046';
delete from public.payments where branch_id='b0000000-0000-4000-8000-000000000046';
delete from public.sales_invoice_items where invoice_id in (select id from public.sales_invoices where branch_id='b0000000-0000-4000-8000-000000000046');
delete from public.sales_invoices where branch_id='b0000000-0000-4000-8000-000000000046';
delete from public.vehicles where chassis_no='M44CH00000001';
delete from public.products where code='PRD-4400';
update public.code_sequences set next_number=4400 where entity in ('product','vehicle','sales_invoice','customer','contract','journal_entry');

select public.no_plan();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000338","role":"authenticated"}', true);

-- create product + vehicle
select public.create_product('منتج أقساط M4.4', null, null, null, 'قطعة', null, null, 50);
select public.create_vehicle('M44CH00000001','M44EN00000001','motorcycle',null,null,null,null,null,null,null,30000,0,0,null,40000,'b0000000-0000-4000-8000-000000000046');

-- customer + installment draft
select public.create_customer('عميل أقساط M4.4','29810122345633','01012345678');

select public.save_sales_invoice(
  (select id from public.customers where code='CUS-4400'),
  jsonb_build_array(jsonb_build_object(
    'vehicle_id',(select id from public.vehicles where code='VEH-4400'),
    'quantity',1,'unit_price',10000,'discount',0
  )),
  null, current_date, 'installment', 0, 0, null
);

-- contract (financed 8000, 3 installments, monthly)
select public.save_contract(
  (select id from public.sales_invoices where number='SINV-04400'),
  2000, 3, 'monthly', null, current_date + 30, null, 'عقد أقساط M4.4'
);

-- preview (should return 3 items)
select public.is(
  (select jsonb_array_length((public.generate_installment_schedule(
    (select id from public.contracts where number='CON-04400'), true
  ) -> 'items'))),
  3,
  'preview returns three installments'
);

-- persist schedule
select public.is(
  (select (public.generate_installment_schedule(
    (select id from public.contracts where number='CON-04400'), false
  ) ->> 'count')::integer),
  3,
  'schedule generated with three installments'
);

-- sum of installments = financed amount (8000)
select public.is(
  (select coalesce(sum(i.amount),0) from public.installments i
   join public.installment_schedules s on s.id=i.schedule_id
   where s.contract_id=(select id from public.contracts where number='CON-04400')
     and s.status='draft'),
  8000::numeric,
  'installment sum equals financed amount'
);

-- activate schedule
select public.lives_ok(
  format('select public.activate_installment_schedule(%L)',
    (select id from public.installment_schedules where contract_id=(select id from public.contracts where number='CON-04400') order by version desc limit 1)
  ),
  'schedule can be activated'
);

select public.is(
  (select status from public.installment_schedules where contract_id=(select id from public.contracts where number='CON-04400') and status='active'),
  'active',
  'active schedule is marked active'
);

select public.finish();
rollback;
