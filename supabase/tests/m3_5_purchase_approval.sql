-- M3.5 — Atomic purchase approval (pgTAP).
-- Self-contained fixtures + rollback. Fixed UUIDs keep asserts independent.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Branch + fixture users:
--   316 inventory => creates invoices, cannot approve
--   317 manager   => approves
--   318 no roles  => nothing
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, is_active)
values ('b0000000-0000-4000-8000-000000000036', 'TST-36', 'فرع اعتماد M3.5', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values
  ('m3.5.a.tst@example.com', now() + interval '15 minutes'),
  ('m3.5.m.tst@example.com', now() + interval '15 minutes'),
  ('m3.5.c.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000316', 'authenticated', 'authenticated', 'm3.5.a.tst@example.com', now(), '{"full_name":"اعتماد A"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000317', 'authenticated', 'authenticated', 'm3.5.m.tst@example.com', now(), '{"full_name":"اعتماد M"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000318', 'authenticated', 'authenticated', 'm3.5.c.tst@example.com', now(), '{"full_name":"اعتماد C"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values
  ('00000000-0000-4000-8000-000000000316', 'اعتماد A', '+201000000340', 'inventory', 'b0000000-0000-4000-8000-000000000036', true),
  ('00000000-0000-4000-8000-000000000317', 'اعتماد M', '+201000000341', 'manager', 'b0000000-0000-4000-8000-000000000036', true),
  ('00000000-0000-4000-8000-000000000318', 'اعتماد C', '+201000000342', 'viewer', 'b0000000-0000-4000-8000-000000000036', true)
on conflict (id) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    branch_id = excluded.branch_id,
    is_active = excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
select u.id::uuid, b.id, true
from (values
  ('00000000-0000-4000-8000-000000000316', 'b0000000-0000-4000-8000-000000000036'),
  ('00000000-0000-4000-8000-000000000317', 'b0000000-0000-4000-8000-000000000036'),
  ('00000000-0000-4000-8000-000000000318', 'b0000000-0000-4000-8000-000000000036')
) as u(id, branch)
join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select u.id::uuid, r.id, b.id, true
from (values
  ('00000000-0000-4000-8000-000000000316', 'inventory'),
  ('00000000-0000-4000-8000-000000000317', 'manager')
) as u(id, role_code)
join public.roles as r on r.code = u.role_code
join public.branches as b on b.code = 'TST-36'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Clean leftovers + fixtures.
-- ---------------------------------------------------------------------------

delete from public.supplier_transactions
where supplier_id in (select id from public.suppliers where code = 'SUP-5360');
delete from public.purchase_invoices
where supplier_id in (select id from public.suppliers where code = 'SUP-5360');
delete from public.cash_transactions
where reference_type = 'purchase_invoice'
  and reference_id in (
    select id from public.purchase_invoices
    where supplier_id in (select id from public.suppliers where code = 'SUP-5360')
  );
delete from public.vehicles where chassis_no in ('M35CH00000001', 'M35CH00000002');
delete from public.products where code = 'PRD-0600';
delete from public.suppliers where code = 'SUP-5360';

insert into public.suppliers (code, full_name, phone, branch_id)
values ('SUP-5360', 'مورد اعتماد M3.5', '01055556666', 'b0000000-0000-4000-8000-000000000036');

update public.cashboxes
set current_balance = 100000
where branch_id = 'b0000000-0000-4000-8000-000000000036' and is_default;

alter table public.products disable trigger audit_products_change;
alter table public.vehicles disable trigger audit_vehicles_change;
update public.code_sequences set next_number = 600
where entity in ('product', 'vehicle', 'purchase_invoice', 'journal_entry');
alter table public.products enable trigger audit_products_change;
alter table public.vehicles enable trigger audit_vehicles_change;

select public.no_plan();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000316","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Section 1: fixtures.
-- ---------------------------------------------------------------------------

select public.is(
  (select code from public.create_product('منتج اعتماد M3.5', null, null, null, 'قطعة')),
  'PRD-0600',
  'the fixture product is numbered'
);

select public.is(
  (select code from public.create_vehicle(
    'M35CH00000001', 'M35EN00000001', 'motorcycle', null, null, null,
    null, null, (select id from public.suppliers where code = 'SUP-5360'),
    date '2026-10-20', 40000, 0, 0, null, 48000,
    'b0000000-0000-4000-8000-000000000036'
  )),
  'VEH-0600',
  'the fixture vehicle is numbered'
);

select public.is(
  (select code from public.create_vehicle(
    'M35CH00000002', 'M35EN00000002', 'motorcycle', null, null, null,
    null, null, (select id from public.suppliers where code = 'SUP-5360'),
    date '2026-10-20', 30000, 0, 0, null, 36000,
    'b0000000-0000-4000-8000-000000000036'
  )),
  'VEH-0601',
  'the second fixture vehicle is numbered'
);

select public.is(
  set_config(
    'm35.product_id',
    (select id from public.products where code = 'PRD-0600')::text,
    false
  ) is not null,
  true,
  'the product id is captured'
);

select public.is(
  (select number from public.save_purchase_invoice(
    (select id from public.suppliers where code = 'SUP-5360'),
    jsonb_build_array(
      jsonb_build_object(
        'product_id', (select id from public.products where code = 'PRD-0600'),
        'quantity', 10, 'unit_price', 100, 'discount', 0
      ),
      jsonb_build_object(
        'vehicle_id', (select id from public.vehicles where code = 'VEH-0600'),
        'quantity', 1, 'unit_price', 40000, 'discount', 0
      )
    ),
    null, date '2026-10-25', 100, 200, 50, 'cash', 5000
  )),
  'PINV-00600',
  'the cash invoice is created'
);

-- ---------------------------------------------------------------------------
-- Section 2: permission split and atomic approval.
-- ---------------------------------------------------------------------------

select public.throws_ok(
  format(
    'select public.approve_purchase_invoice(%L)',
    (select id from public.purchase_invoices where number = 'PINV-00600')
  ),
  '42501',
  null,
  'the inventory role cannot approve invoices'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000317","role":"authenticated"}', true);

select public.is(
  (select status from public.approve_purchase_invoice(
    (select id from public.purchase_invoices where number = 'PINV-00600')
  )),
  'approved',
  'a manager approves the draft'
);

select public.is(
  (select approved_at is not null from public.purchase_invoices where number = 'PINV-00600'),
  true,
  'the approval timestamp is stored'
);

select public.is(
  (select stock_qty from public.products where code = 'PRD-0600'),
  10::numeric,
  'the product stock receives the purchased quantity'
);

select public.is(
  (select unit_cost from public.products where code = 'PRD-0600'),
  100.61::numeric,
  'the product cost becomes the landed cost'
);

select public.is(
  (select quantity from public.product_stock
   where product_id = (select id from public.products where code = 'PRD-0600')
     and branch_id = 'b0000000-0000-4000-8000-000000000036'),
  10::numeric,
  'the branch balance receives the quantity'
);

select public.is(
  (select approved_cost from public.vehicles where code = 'VEH-0600'),
  40243.90::numeric,
  'the vehicle approved cost includes the allocated direct costs'
);

select public.is(
  (select purchase_price from public.vehicles where code = 'VEH-0600'),
  40000::numeric,
  'the vehicle purchase price is stored'
);

select public.is(
  (select supplier_id from public.vehicles where code = 'VEH-0600'),
  (select id from public.suppliers where code = 'SUP-5360'),
  'the vehicle remembers its supplier'
);

select public.is(
  (select count(*) from public.stock_movements
   where reference_type = 'purchase_invoice'
     and reference_id = (select id from public.purchase_invoices where number = 'PINV-00600')),
  2::bigint,
  'both lines produced a stock movement'
);

select public.is(
  public.supplier_balance((select id from public.suppliers where code = 'SUP-5360')),
  36150::numeric,
  'the supplier balance is total minus the upfront payment'
);

select public.is(
  (select current_balance from public.cashboxes
   where branch_id = 'b0000000-0000-4000-8000-000000000036' and is_default),
  95000::numeric,
  'the cashbox pays the upfront amount'
);

select public.is(
  (select count(*) from public.cash_transactions
   where reference_id = (select id from public.purchase_invoices where number = 'PINV-00600')),
  1::bigint,
  'the payment is recorded once'
);

select public.is(
  (select total_debit from public.journal_entries
   where source_type = 'purchase_invoice'
     and source_id = (select id from public.purchase_invoices where number = 'PINV-00600')),
  46150::numeric,
  'the journal entry debits inventory plus the supplier payment'
);

select public.is(
  (select total_credit from public.journal_entries
   where source_type = 'purchase_invoice'
     and source_id = (select id from public.purchase_invoices where number = 'PINV-00600')),
  46150::numeric,
  'the journal entry is balanced'
);

select public.is(
  (select count(*) from public.journal_entry_lines
   where journal_entry_id = (
     select id from public.journal_entries
     where source_id = (select id from public.purchase_invoices where number = 'PINV-00600')
   )),
  4::bigint,
  'the payment produces two extra journal lines'
);

select public.is(
  (select status from public.journal_entries
   where source_id = (select id from public.purchase_invoices where number = 'PINV-00600')),
  'posted',
  'the journal entry is posted'
);

select public.throws_ok(
  format(
    'select public.approve_purchase_invoice(%L)',
    (select id from public.purchase_invoices where number = 'PINV-00600')
  ),
  'P0001',
  null,
  'an approved invoice cannot be approved twice'
);

-- ---------------------------------------------------------------------------
-- Section 3: credit invoice (no cash effect).
-- ---------------------------------------------------------------------------

select public.is(
  (select number from public.save_purchase_invoice(
    (select id from public.suppliers where code = 'SUP-5360'),
    jsonb_build_array(jsonb_build_object(
      'product_id', (select id from public.products where code = 'PRD-0600'),
      'quantity', 5, 'unit_price', 200, 'discount', 0
    )),
    null, date '2026-10-26', 0, 0, 0, 'credit', 0
  )),
  'PINV-00601',
  'the credit invoice is created'
);

select public.is(
  (select status from public.approve_purchase_invoice(
    (select id from public.purchase_invoices where number = 'PINV-00601')
  )),
  'approved',
  'the credit invoice is approved'
);

select public.is(
  public.supplier_balance((select id from public.suppliers where code = 'SUP-5360')),
  37150::numeric,
  'the credit invoice grows the supplier balance'
);

select public.is(
  (select total_debit from public.journal_entries
   where source_id = (select id from public.purchase_invoices where number = 'PINV-00601')),
  1000::numeric,
  'the credit journal entry carries the invoice total only'
);

select public.is(
  (select count(*) from public.cash_transactions
   where reference_id = (select id from public.purchase_invoices where number = 'PINV-00601')),
  0::bigint,
  'no cash movement is recorded for a credit invoice'
);

select public.is(
  (select stock_qty from public.products where code = 'PRD-0600'),
  15::numeric,
  'the second approval adds its quantity'
);

-- ---------------------------------------------------------------------------
-- Section 4: an approval failure rolls everything back.
-- ---------------------------------------------------------------------------

select public.is(
  (select number from public.save_purchase_invoice(
    (select id from public.suppliers where code = 'SUP-5360'),
    jsonb_build_array(jsonb_build_object(
      'vehicle_id', (select id from public.vehicles where code = 'VEH-0601'),
      'quantity', 1, 'unit_price', 30000, 'discount', 0
    )),
    null, date '2026-10-27', 0, 0, 0, 'credit', 0
  )),
  'PINV-00602',
  'the vehicle invoice is created while the vehicle is available'
);

select public.is(
  set_config(
    'm35.invoice_fail',
    (select id from public.purchase_invoices where number = 'PINV-00602')::text,
    false
  ) is not null,
  true,
  'the failing invoice id is captured'
);

select public.is(
  (select status from public.set_vehicle_status(
    (select id from public.vehicles where code = 'VEH-0601'), 'sold'
  )),
  'sold',
  'the vehicle is sold before its invoice is approved'
);

select public.throws_ok(
  $$ select public.approve_purchase_invoice(current_setting('m35.invoice_fail')::uuid) $$,
  'P0001',
  null,
  'approving an invoice for a sold vehicle is rejected'
);

select public.is(
  (select status from public.purchase_invoices
   where id = current_setting('m35.invoice_fail')::uuid),
  'draft',
  'the failed invoice stays a draft'
);

select public.is(
  public.supplier_balance((select id from public.suppliers where code = 'SUP-5360')),
  37150::numeric,
  'the failed approval did not move the supplier balance'
);

select public.is(
  (select count(*) from public.supplier_transactions
   where reference_id = current_setting('m35.invoice_fail')::uuid),
  0::bigint,
  'the failed approval wrote no supplier ledger row'
);

select public.is(
  (select count(*) from public.stock_movements
   where reference_id = current_setting('m35.invoice_fail')::uuid),
  0::bigint,
  'the failed approval wrote no stock movement'
);

select public.is(
  (select count(*) from public.journal_entries
   where source_id = current_setting('m35.invoice_fail')::uuid),
  0::bigint,
  'the failed approval wrote no journal entry'
);

-- ---------------------------------------------------------------------------
-- Section 5: user C (no roles) is locked out.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000318","role":"authenticated"}', true);

select public.throws_ok(
  format(
    'select public.approve_purchase_invoice(%L)',
    (select id from public.purchase_invoices where number = 'PINV-00602')
  ),
  '42501',
  null,
  'C cannot approve invoices'
);

select public.is(
  coalesce((select count(*) from public.purchase_invoices), 0),
  0::bigint,
  'C sees zero invoices through RLS'
);

select public.is(
  coalesce((select count(*) from public.supplier_transactions), 0),
  0::bigint,
  'C sees zero supplier ledger rows through RLS'
);

select public.finish();
rollback;
