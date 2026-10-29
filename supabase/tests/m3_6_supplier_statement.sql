-- M3.6 — Supplier profile, statement, and printable purchase invoice (pgTAP).
-- Self-contained fixtures + rollback. Fixed UUIDs keep asserts independent.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Branch + fixture users:
--   319 inventory => suppliers.view + purchases.view, cannot approve
--   320 manager   => approves
--   321 no roles  => nothing
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, is_active)
values
  ('b0000000-0000-4000-8000-000000000037', 'TST-37', 'فرع كشف مورد M3.6', true),
  ('b0000000-0000-4000-8000-000000000099', 'TST-99', 'فرع آخر M3.6', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values
  ('m3.6.a.tst@example.com', now() + interval '15 minutes'),
  ('m3.6.m.tst@example.com', now() + interval '15 minutes'),
  ('m3.6.c.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000319', 'authenticated', 'authenticated', 'm3.6.a.tst@example.com', now(), '{"full_name":"كشف A"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000320', 'authenticated', 'authenticated', 'm3.6.m.tst@example.com', now(), '{"full_name":"كشف M"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000321', 'authenticated', 'authenticated', 'm3.6.c.tst@example.com', now(), '{"full_name":"كشف C"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values
  ('00000000-0000-4000-8000-000000000319', 'كشف A', '+201000000350', 'inventory', 'b0000000-0000-4000-8000-000000000037', true),
  ('00000000-0000-4000-8000-000000000320', 'كشف M', '+201000000351', 'manager', 'b0000000-0000-4000-8000-000000000037', true),
  ('00000000-0000-4000-8000-000000000321', 'كشف C', '+201000000352', 'viewer', 'b0000000-0000-4000-8000-000000000037', true)
on conflict (id) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    branch_id = excluded.branch_id,
    is_active = excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
select u.id::uuid, b.id, true
from (values
  ('00000000-0000-4000-8000-000000000319', 'b0000000-0000-4000-8000-000000000037'),
  ('00000000-0000-4000-8000-000000000320', 'b0000000-0000-4000-8000-000000000037'),
  ('00000000-0000-4000-8000-000000000321', 'b0000000-0000-4000-8000-000000000037')
) as u(id, branch)
join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select u.id::uuid, r.id, b.id, true
from (values
  ('00000000-0000-4000-8000-000000000319', 'inventory'),
  ('00000000-0000-4000-8000-000000000320', 'manager')
) as u(id, role_code)
join public.roles as r on r.code = u.role_code
join public.branches as b on b.code = 'TST-37'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Clean leftovers + fixtures.
-- ---------------------------------------------------------------------------

delete from public.supplier_transactions
where supplier_id in (select id from public.suppliers where code in ('SUP-5370', 'SUP-5371'));
delete from public.purchase_invoices
where supplier_id in (select id from public.suppliers where code in ('SUP-5370', 'SUP-5371'));
delete from public.vehicles where chassis_no = 'M36CH00000001';
delete from public.products where code = 'PRD-0700';
delete from public.suppliers where code in ('SUP-5370', 'SUP-5371');

insert into public.suppliers (code, full_name, phone, branch_id)
values
  ('SUP-5370', 'مورد كشف M3.6', '01077778888', 'b0000000-0000-4000-8000-000000000037'),
  ('SUP-5371', 'مورد فرع آخر M3.6', '01077779999', 'b0000000-0000-4000-8000-000000000099');

update public.cashboxes
set current_balance = 100000
where branch_id = 'b0000000-0000-4000-8000-000000000037' and is_default;

alter table public.products disable trigger audit_products_change;
alter table public.vehicles disable trigger audit_vehicles_change;
update public.code_sequences set next_number = 700
where entity in ('product', 'vehicle', 'purchase_invoice', 'journal_entry');
alter table public.products enable trigger audit_products_change;
alter table public.vehicles enable trigger audit_vehicles_change;

select public.no_plan();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000319","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Section 1: fixtures + an approved cash invoice.
-- ---------------------------------------------------------------------------

select public.is(
  (select code from public.create_product('منتج كشف M3.6', null, null, null, 'قطعة')),
  'PRD-0700',
  'the fixture product is numbered'
);

select public.is(
  (select code from public.create_vehicle(
    'M36CH00000001', 'M36EN00000001', 'motorcycle', null, null, null,
    null, null, (select id from public.suppliers where code = 'SUP-5370'),
    date '2026-10-20', 40000, 0, 0, null, 48000,
    'b0000000-0000-4000-8000-000000000037'
  )),
  'VEH-0700',
  'the fixture vehicle is numbered'
);

select public.is(
  (select number from public.save_purchase_invoice(
    (select id from public.suppliers where code = 'SUP-5370'),
    jsonb_build_array(
      jsonb_build_object(
        'product_id', (select id from public.products where code = 'PRD-0700'),
        'quantity', 10, 'unit_price', 100, 'discount', 0
      ),
      jsonb_build_object(
        'vehicle_id', (select id from public.vehicles where code = 'VEH-0700'),
        'quantity', 1, 'unit_price', 40000, 'discount', 0
      )
    ),
    null, date '2026-10-25', 100, 200, 50, 'cash', 5000, 'فاتورة كشف المورد'
  )),
  'PINV-00700',
  'the cash invoice is created'
);

select public.throws_ok(
  format(
    'select public.approve_purchase_invoice(%L)',
    (select id from public.purchase_invoices where number = 'PINV-00700')
  ),
  '42501',
  null,
  'the inventory role still cannot approve'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000320","role":"authenticated"}', true);

select public.is(
  (select status from public.approve_purchase_invoice(
    (select id from public.purchase_invoices where number = 'PINV-00700')
  )),
  'approved',
  'the manager approves the invoice'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000319","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Section 2: supplier profile totals.
-- ---------------------------------------------------------------------------

select public.is(
  (select (public.get_supplier_profile(
    (select id from public.suppliers where code = 'SUP-5370')
  ) -> 'totals' ->> 'invoiced_total')::numeric),
  41150::numeric,
  'the profile totals the approved invoice'
);

select public.is(
  (select (public.get_supplier_profile(
    (select id from public.suppliers where code = 'SUP-5370')
  ) -> 'totals' ->> 'paid_total')::numeric),
  5000::numeric,
  'the profile totals the upfront payment'
);

select public.is(
  (select (public.get_supplier_profile(
    (select id from public.suppliers where code = 'SUP-5370')
  ) -> 'totals' ->> 'balance')::numeric),
  36150::numeric,
  'the profile balance matches invoices minus payments'
);

select public.is(
  (select (public.get_supplier_profile(
    (select id from public.suppliers where code = 'SUP-5370')
  ) -> 'totals' ->> 'invoice_count')::integer),
  1,
  'the profile counts the invoices'
);

select public.is(
  (select public.get_supplier_profile(
    (select id from public.suppliers where code = 'SUP-5370')
  ) -> 'invoices' -> 0 ->> 'number'),
  'PINV-00700',
  'the profile lists the invoice number'
);

select public.is(
  (select (public.get_supplier_profile(
    (select id from public.suppliers where code = 'SUP-5370')
  ) -> 'invoices' -> 0 ->> 'remaining_amount')::numeric),
  36150::numeric,
  'the invoice row shows the remaining amount'
);

select public.is(
  (select public.get_supplier_profile(
    (select id from public.suppliers where code = 'SUP-5370')
  ) #>> '{supplier,branch_name}'),
  'فرع كشف مورد M3.6',
  'the profile resolves the supplier branch name'
);

-- ---------------------------------------------------------------------------
-- Section 3: statement + running balance.
-- ---------------------------------------------------------------------------

select public.is(
  (select count(*) from public.list_supplier_statement(
    (select id from public.suppliers where code = 'SUP-5370')
  )),
  2::bigint,
  'the statement holds the invoice and the payment'
);

select public.is(
  (select credit from public.list_supplier_statement(
    (select id from public.suppliers where code = 'SUP-5370')
  ) limit 1),
  41150::numeric,
  'the invoice posts as a credit'
);

select public.is(
  (select debit from public.list_supplier_statement(
    (select id from public.suppliers where code = 'SUP-5370')
  ) offset 1 limit 1),
  5000::numeric,
  'the payment posts as a debit'
);

select public.is(
  (select reference_number from public.list_supplier_statement(
    (select id from public.suppliers where code = 'SUP-5370')
  ) limit 1),
  'PINV-00700',
  'the ledger row carries the invoice number'
);

select public.is(
  (select running_balance from public.list_supplier_statement(
    (select id from public.suppliers where code = 'SUP-5370')
  ) where transaction_type = 'payment'),
  36150::numeric,
  'the closing balance matches the profile'
);

select public.is(
  (select (public.get_supplier_profile(
    (select id from public.suppliers where code = 'SUP-5370')
  ) -> 'totals' ->> 'balance')::numeric),
  (select running_balance from public.list_supplier_statement(
    (select id from public.suppliers where code = 'SUP-5370')
  ) where transaction_type = 'payment'),
  'profile balance equals the last statement balance'
);

-- ---------------------------------------------------------------------------
-- Section 4: a draft does not enter the statement.
-- ---------------------------------------------------------------------------

select public.is(
  (select number from public.save_purchase_invoice(
    (select id from public.suppliers where code = 'SUP-5370'),
    jsonb_build_array(jsonb_build_object(
      'product_id', (select id from public.products where code = 'PRD-0700'),
      'quantity', 1, 'unit_price', 999, 'discount', 0
    )),
    null, date '2026-10-26', 0, 0, 0, 'credit', 0
  )),
  'PINV-00701',
  'a draft invoice is created'
);

select public.is(
  (select count(*) from public.list_supplier_statement(
    (select id from public.suppliers where code = 'SUP-5370')
  )),
  2::bigint,
  'the draft does not enter the statement'
);

select public.is(
  (select (public.get_supplier_profile(
    (select id from public.suppliers where code = 'SUP-5370')
  ) -> 'totals' ->> 'balance')::numeric),
  36150::numeric,
  'the draft does not move the profile balance'
);

select public.is(
  (select (public.get_supplier_profile(
    (select id from public.suppliers where code = 'SUP-5370')
  ) -> 'totals' ->> 'invoice_count')::integer),
  2,
  'the profile still counts the draft invoice'
);

-- ---------------------------------------------------------------------------
-- Section 5: second approval, dated filter.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000320","role":"authenticated"}', true);

select public.is(
  (select status from public.approve_purchase_invoice(
    (select id from public.purchase_invoices where number = 'PINV-00701')
  )),
  'approved',
  'the credit invoice is approved'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000319","role":"authenticated"}', true);

select public.is(
  (select (public.get_supplier_profile(
    (select id from public.suppliers where code = 'SUP-5370')
  ) -> 'totals' ->> 'balance')::numeric),
  37149::numeric,
  'the credit invoice grows the balance'
);

select public.is(
  (select count(*) from public.list_supplier_statement(
    (select id from public.suppliers where code = 'SUP-5370'),
    date '2026-10-26', date '2026-10-26'
  )),
  1::bigint,
  'the statement honours the date filter'
);

select public.is(
  (select running_balance from public.list_supplier_statement(
    (select id from public.suppliers where code = 'SUP-5370'),
    date '2026-10-26', date '2026-10-26'
  )),
  999::numeric,
  'the filtered statement restarts the running balance'
);

-- ---------------------------------------------------------------------------
-- Section 6: printable invoice payload.
-- ---------------------------------------------------------------------------

select public.is(
  (select public.get_purchase_invoice_print(
    (select id from public.purchase_invoices where number = 'PINV-00700')
  ) #>> '{invoice,number}'),
  'PINV-00700',
  'the print payload carries the invoice number'
);

select public.is(
  (select public.get_purchase_invoice_print(
    (select id from public.purchase_invoices where number = 'PINV-00700')
  ) #>> '{supplier,full_name}'),
  'مورد كشف M3.6',
  'the print payload carries the supplier'
);

select public.is(
  (select public.get_purchase_invoice_print(
    (select id from public.purchase_invoices where number = 'PINV-00700')
  ) #>> '{branch,name}'),
  'فرع كشف مورد M3.6',
  'the print payload carries the branch header'
);

select public.is(
  (select public.get_purchase_invoice_print(
    (select id from public.purchase_invoices where number = 'PINV-00700')
  ) #>> '{settings,app_name}'),
  'معرض البركة',
  'the print payload carries the showroom header'
);

select public.is(
  (select jsonb_array_length(public.get_purchase_invoice_print(
    (select id from public.purchase_invoices where number = 'PINV-00700')
  ) -> 'items')),
  2,
  'the print payload carries every line'
);

select public.is(
  (select (public.get_purchase_invoice_print(
    (select id from public.purchase_invoices where number = 'PINV-00700')
  ) #>> '{items,0,code}')),
  'PRD-0700',
  'the print line carries the product code'
);

select public.is(
  (select (public.get_purchase_invoice_print(
    (select id from public.purchase_invoices where number = 'PINV-00700')
  ) #>> '{items,1,code}')),
  'VEH-0700',
  'the print line carries the vehicle code'
);

select public.is(
  (select (public.get_purchase_invoice_print(
    (select id from public.purchase_invoices where number = 'PINV-00700')
  ) #>> '{items,0,landed_unit_cost}')::numeric),
  100.61::numeric,
  'the print line shows the landed cost'
);

-- ---------------------------------------------------------------------------
-- Section 7: branch scoping + locked-out user.
-- ---------------------------------------------------------------------------

select public.throws_ok(
  format(
    'select public.get_supplier_profile(%L)',
    (select id from public.suppliers where code = 'SUP-5371')
  ),
  '42501',
  null,
  'a supplier from another branch is not visible'
);

select public.is(
  set_config(
    'm36.supplier_id',
    (select id from public.suppliers where code = 'SUP-5370')::text,
    false
  ) is not null,
  true,
  'the supplier id is captured for the locked-out section'
);

select public.is(
  set_config(
    'm36.invoice_id',
    (select id from public.purchase_invoices where number = 'PINV-00700')::text,
    false
  ) is not null,
  true,
  'the invoice id is captured for the locked-out section'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000321","role":"authenticated"}', true);

select public.throws_ok(
  $$ select public.get_supplier_profile(current_setting('m36.supplier_id')::uuid) $$,
  '42501',
  null,
  'a user without roles cannot read a supplier profile'
);

select public.throws_ok(
  $$ select public.list_supplier_statement(current_setting('m36.supplier_id')::uuid) $$,
  '42501',
  null,
  'a user without roles cannot read a supplier statement'
);

select public.throws_ok(
  $$ select public.get_purchase_invoice_print(current_setting('m36.invoice_id')::uuid) $$,
  '42501',
  null,
  'a user without roles cannot print a purchase invoice'
);

select public.is(
  coalesce((select count(*) from public.supplier_transactions), 0),
  0::bigint,
  'the locked-out user sees no supplier ledger rows through RLS'
);

select public.finish();
rollback;
