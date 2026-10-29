-- M3.8 — Inventory, vehicle, and purchase reports (pgTAP).
-- Self-contained fixtures + rollback. Fixed UUIDs keep asserts independent.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Branches + fixture users:
--   325 inventory @ TST-40 => reports.view
--   326 manager   @ TST-40 => approves
--   327 inventory @ TST-41 => other branch only
--   328 viewer    @ TST-40 => no reports.view
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, is_active)
values
  ('b0000000-0000-4000-8000-000000000040', 'TST-40', 'فرع تقارير M3.8', true),
  ('b0000000-0000-4000-8000-000000000041', 'TST-41', 'فرع آخر M3.8', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values
  ('m3.8.a.tst@example.com', now() + interval '15 minutes'),
  ('m3.8.m.tst@example.com', now() + interval '15 minutes'),
  ('m3.8.b.tst@example.com', now() + interval '15 minutes'),
  ('m3.8.c.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000325', 'authenticated', 'authenticated', 'm3.8.a.tst@example.com', now(), '{"full_name":"تقرير A"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000326', 'authenticated', 'authenticated', 'm3.8.m.tst@example.com', now(), '{"full_name":"تقرير M"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000327', 'authenticated', 'authenticated', 'm3.8.b.tst@example.com', now(), '{"full_name":"تقرير B"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000328', 'authenticated', 'authenticated', 'm3.8.c.tst@example.com', now(), '{"full_name":"تقرير C"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values
  ('00000000-0000-4000-8000-000000000325', 'تقرير A', '+201000000370', 'inventory', 'b0000000-0000-4000-8000-000000000040', true),
  ('00000000-0000-4000-8000-000000000326', 'تقرير M', '+201000000371', 'manager', 'b0000000-0000-4000-8000-000000000040', true),
  ('00000000-0000-4000-8000-000000000327', 'تقرير B', '+201000000372', 'inventory', 'b0000000-0000-4000-8000-000000000041', true),
  ('00000000-0000-4000-8000-000000000328', 'تقرير C', '+201000000373', 'viewer', 'b0000000-0000-4000-8000-000000000040', true)
on conflict (id) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    branch_id = excluded.branch_id,
    is_active = excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
select u.id::uuid, b.id, true
from (values
  ('00000000-0000-4000-8000-000000000325', 'b0000000-0000-4000-8000-000000000040'),
  ('00000000-0000-4000-8000-000000000326', 'b0000000-0000-4000-8000-000000000040'),
  ('00000000-0000-4000-8000-000000000327', 'b0000000-0000-4000-8000-000000000041'),
  ('00000000-0000-4000-8000-000000000328', 'b0000000-0000-4000-8000-000000000040')
) as u(id, branch)
join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select u.id::uuid, r.id, b.id, true
from (values
  ('00000000-0000-4000-8000-000000000325', 'inventory', 'b0000000-0000-4000-8000-000000000040'),
  ('00000000-0000-4000-8000-000000000326', 'manager', 'b0000000-0000-4000-8000-000000000040'),
  ('00000000-0000-4000-8000-000000000327', 'inventory', 'b0000000-0000-4000-8000-000000000041')
) as u(id, role_code, branch)
join public.roles as r on r.code = u.role_code
join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Clean leftovers + fixtures.
-- ---------------------------------------------------------------------------

delete from public.supplier_transactions
where supplier_id in (select id from public.suppliers where code = 'SUP-9000');
delete from public.purchase_invoices
where supplier_id in (select id from public.suppliers where code = 'SUP-9000');
delete from public.stock_movements
where product_id in (select id from public.products where code in ('PRD-0900', 'PRD-0901'))
   or vehicle_id in (select id from public.vehicles where chassis_no = 'M38CH00000001');
delete from public.product_stock
where product_id in (select id from public.products where code in ('PRD-0900', 'PRD-0901'));
delete from public.vehicles where chassis_no = 'M38CH00000001';
delete from public.products where code in ('PRD-0900', 'PRD-0901');
delete from public.suppliers where code = 'SUP-9000';

alter table public.products disable trigger audit_products_change;
alter table public.vehicles disable trigger audit_vehicles_change;
update public.code_sequences set next_number = 900
where entity in ('product', 'vehicle', 'purchase_invoice', 'journal_entry');
alter table public.products enable trigger audit_products_change;
alter table public.vehicles enable trigger audit_vehicles_change;

insert into public.suppliers (code, full_name, phone, branch_id)
values ('SUP-9000', 'مورد تقارير M3.8', '01077770000', 'b0000000-0000-4000-8000-000000000040');

select public.no_plan();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000325","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Section 1: fixtures, opening stock, and an approved purchase.
-- ---------------------------------------------------------------------------

select public.is(
  (select code from public.create_product('منتج تقارير M3.8', null, null, null, 'قطعة')),
  'PRD-0900',
  'the stocked product is numbered'
);

select public.is(
  (select code from public.create_product(
    'منتج ناقص M3.8', null, null, null, 'قطعة', null, null, 25, 'avco', 5
  )),
  'PRD-0901',
  'the low-stock product is numbered'
);

select public.is(
  (select code from public.create_vehicle(
    'M38CH00000001', 'M38EN00000001', 'motorcycle', null, null, null,
    null, null, (select id from public.suppliers where code = 'SUP-9000'),
    date '2026-10-27', 40000, 0, 0, null, 50000,
    'b0000000-0000-4000-8000-000000000040'
  )),
  'VEH-0900',
  'the fixture vehicle is numbered'
);

select public.is(
  set_config(
    'm38.product_id',
    (select id from public.products where code = 'PRD-0900')::text,
    false
  ) is not null,
  true,
  'the stocked product id is captured'
);

select public.is(
  set_config(
    'm38.low_product_id',
    (select id from public.products where code = 'PRD-0901')::text,
    false
  ) is not null,
  true,
  'the low-stock product id is captured'
);

select public.is(
  set_config(
    'm38.vehicle_id',
    (select id from public.vehicles where code = 'VEH-0900')::text,
    false
  ) is not null,
  true,
  'the vehicle id is captured'
);

select public.lives_ok(
  format(
    'select public.record_stock_movement(%L, %s, %L, null, %s, %L)',
    'opening', 5,
    current_setting('m38.product_id'),
    100,
    'b0000000-0000-4000-8000-000000000040'
  ),
  'five opening units are recorded'
);

select public.is(
  (select number from public.save_purchase_invoice(
    (select id from public.suppliers where code = 'SUP-9000'),
    jsonb_build_array(
      jsonb_build_object(
        'product_id', current_setting('m38.product_id')::uuid,
        'quantity', 10, 'unit_price', 100, 'discount', 0
      ),
      jsonb_build_object(
        'vehicle_id', current_setting('m38.vehicle_id')::uuid,
        'quantity', 1, 'unit_price', 40000, 'discount', 0
      )
    ),
    null, date '2026-10-28', 0, 100, 200, 'credit', 0, 'فاتورة تقارير M3.8'
  )),
  'PINV-00900',
  'the purchase invoice is drafted'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000326","role":"authenticated"}', true);

select public.is(
  (select status from public.approve_purchase_invoice(
    (select id from public.purchase_invoices where number = 'PINV-00900')
  )),
  'approved',
  'the manager approves the purchase invoice'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000325","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Section 2: inventory report.
-- ---------------------------------------------------------------------------

select public.is(
  (select (public.get_inventory_report(
    'b0000000-0000-4000-8000-000000000040'
  ) #>> '{summary,branch_count}')::integer),
  1,
  'the inventory report counts the branch'
);

select public.is(
  (select (public.get_inventory_report(
    'b0000000-0000-4000-8000-000000000040'
  ) #>> '{summary,product_count}')::integer),
  2,
  'the inventory report counts the products'
);

select public.is(
  (select (public.get_inventory_report(
    'b0000000-0000-4000-8000-000000000040'
  ) #>> '{summary,total_quantity}')::numeric),
  15::numeric,
  'the report totals opening plus purchased quantities'
);

select public.is(
  (select (public.get_inventory_report(
    'b0000000-0000-4000-8000-000000000040'
  ) #>> '{summary,total_value}')::numeric),
  1507.35::numeric,
  'the report values the stock at the weighted product cost'
);

select public.is(
  (select (public.get_inventory_report(
    'b0000000-0000-4000-8000-000000000040'
  ) #>> '{summary,low_stock_count}')::integer),
  1,
  'the report flags the product below its reorder level'
);

select public.is(
  (select jsonb_array_length(public.get_inventory_report(
    'b0000000-0000-4000-8000-000000000040'
  ) -> 'rows')),
  2,
  'the report returns one row per product and branch'
);

select public.is(
  (select public.get_inventory_report(
    'b0000000-0000-4000-8000-000000000040'
  ) #>> '{rows,0,product_code}'),
  'PRD-0900',
  'the first row is the stocked product'
);

select public.is(
  (select (public.get_inventory_report(
    'b0000000-0000-4000-8000-000000000040'
  ) #>> '{rows,0,quantity}')::numeric),
  15::numeric,
  'the row shows the branch balance'
);

select public.is(
  (select (public.get_inventory_report(
    'b0000000-0000-4000-8000-000000000040'
  ) #>> '{rows,0,stock_value}')::numeric),
  1507.35::numeric,
  'the row shows the stock value'
);

select public.is(
  (select (public.get_inventory_report(
    'b0000000-0000-4000-8000-000000000040'
  ) #>> '{rows,1,is_low}')::boolean),
  true,
  'the empty product is marked as low stock'
);

select public.is(
  (select jsonb_array_length(public.get_inventory_report(
    null, 'PRD-0901'
  ) -> 'rows')),
  1,
  'the search filter narrows the report'
);

select public.throws_ok(
  $$ select public.get_inventory_report('b0000000-0000-4000-8000-000000000041') $$,
  '42501',
  null,
  'another branch is not visible in the inventory report'
);

-- ---------------------------------------------------------------------------
-- Section 3: vehicle report.
-- ---------------------------------------------------------------------------

select public.is(
  (select (public.get_vehicles_report(
    'b0000000-0000-4000-8000-000000000040'
  ) #>> '{summary,vehicle_count}')::integer),
  1,
  'the vehicle report counts the branch vehicles'
);

select public.is(
  (select (public.get_vehicles_report(
    'b0000000-0000-4000-8000-000000000040'
  ) #>> '{summary,available_count}')::integer),
  1,
  'the approved vehicle is available'
);

select public.is(
  (select (public.get_vehicles_report(
    'b0000000-0000-4000-8000-000000000040'
  ) #>> '{summary,sold_count}')::integer),
  0,
  'nothing is sold yet'
);

select public.is(
  (select (public.get_vehicles_report(
    'b0000000-0000-4000-8000-000000000040'
  ) #>> '{summary,total_approved_cost}')::numeric),
  (select approved_cost from public.vehicles where code = 'VEH-0900'),
  'the report totals the approved vehicle cost'
);

select public.is(
  (select (public.get_vehicles_report(
    'b0000000-0000-4000-8000-000000000040'
  ) #>> '{summary,expected_margin}')::numeric),
  (select suggested_price - approved_cost from public.vehicles where code = 'VEH-0900'),
  'the report nets the expected margin'
);

select public.is(
  (select public.get_vehicles_report(
    'b0000000-0000-4000-8000-000000000040'
  ) #>> '{rows,0,vehicle_code}'),
  'VEH-0900',
  'the report lists the vehicle code'
);

select public.throws_ok(
  $$ select public.get_vehicles_report('b0000000-0000-4000-8000-000000000041') $$,
  '42501',
  null,
  'the vehicle report rejects a branch the user does not belong to'
);

-- ---------------------------------------------------------------------------
-- Section 4: vehicle movement ledger.
-- ---------------------------------------------------------------------------

select public.is(
  (select count(*) from public.list_vehicle_movements(
    current_setting('m38.vehicle_id')::uuid
  )),
  1::bigint,
  'the vehicle has one movement after approval'
);

select public.is(
  (select movement_type from public.list_vehicle_movements(
    current_setting('m38.vehicle_id')::uuid
  )),
  'purchase',
  'the movement is a purchase'
);

select public.is(
  (select reference_number from public.list_vehicle_movements(
    current_setting('m38.vehicle_id')::uuid
  )),
  'PINV-00900',
  'the movement resolves the purchase invoice number'
);

select public.is(
  (select quantity from public.list_vehicle_movements(
    current_setting('m38.vehicle_id')::uuid
  )),
  1::numeric,
  'a vehicle moves as a single unit'
);

select public.is(
  (select unit_cost from public.list_vehicle_movements(
    current_setting('m38.vehicle_id')::uuid
  )),
  (select approved_cost from public.vehicles where code = 'VEH-0900'),
  'the movement carries the approved cost'
);

select public.is(
  (select count(*) from public.list_vehicle_movements(
    current_setting('m38.vehicle_id')::uuid,
    date '2026-01-01', date '2026-01-02'
  )),
  0::bigint,
  'the movement report honours the date filter'
);

-- ---------------------------------------------------------------------------
-- Section 5: vehicle cost breakdown.
-- ---------------------------------------------------------------------------

select public.is(
  (select public.get_vehicle_cost_breakdown(
    current_setting('m38.vehicle_id')::uuid
  ) #>> '{purchase,number}'),
  'PINV-00900',
  'the breakdown resolves the purchase invoice'
);

select public.is(
  (select (public.get_vehicle_cost_breakdown(
    current_setting('m38.vehicle_id')::uuid
  ) #>> '{purchase,landed_unit_cost}')::numeric),
  (select approved_cost from public.vehicles where code = 'VEH-0900'),
  'the purchase line landed cost matches the approved cost'
);

select public.is(
  (select (public.get_vehicle_cost_breakdown(
    current_setting('m38.vehicle_id')::uuid
  ) #>> '{difference}')::numeric),
  0::numeric,
  'the approved cost matches the recomputed cost'
);

select public.is(
  (select (public.get_vehicle_cost_breakdown(
    current_setting('m38.vehicle_id')::uuid
  ) #>> '{recomputed_cost}')::numeric),
  (select (public.get_vehicle_cost_breakdown(
    current_setting('m38.vehicle_id')::uuid
  ) #>> '{approved_cost}')::numeric),
  'the recomputed cost equals the approved cost'
);

select public.is(
  (select
    (public.get_vehicle_cost_breakdown(
      current_setting('m38.vehicle_id')::uuid
    ) #>> '{purchase,purchase_price}')::numeric
    + (public.get_vehicle_cost_breakdown(
      current_setting('m38.vehicle_id')::uuid
    ) #>> '{purchase,allocated_transport}')::numeric
    + (public.get_vehicle_cost_breakdown(
      current_setting('m38.vehicle_id')::uuid
    ) #>> '{purchase,allocated_prep}')::numeric),
  (select approved_cost from public.vehicles where code = 'VEH-0900'),
  'purchase price plus allocated costs rebuilds the approved cost'
);

-- ---------------------------------------------------------------------------
-- Section 6: purchases report.
-- ---------------------------------------------------------------------------

select public.is(
  (select (public.get_purchases_report(
    date '2026-10-01', date '2026-10-31'
  ) #>> '{summary,invoice_count}')::integer),
  1,
  'the purchases report counts the invoice'
);

select public.is(
  (select (public.get_purchases_report(
    date '2026-10-01', date '2026-10-31'
  ) #>> '{summary,approved_total}')::numeric),
  41300::numeric,
  'the report totals the approved invoice'
);

select public.is(
  (select (public.get_purchases_report(
    date '2026-10-01', date '2026-10-31'
  ) #>> '{summary,paid_total}')::numeric),
  0::numeric,
  'the report shows nothing paid on credit'
);

select public.is(
  (select (public.get_purchases_report(
    date '2026-10-01', date '2026-10-31'
  ) #>> '{summary,remaining_total}')::numeric),
  41300::numeric,
  'the report shows the full remaining balance'
);

select public.is(
  (select (public.get_purchases_report(
    date '2026-10-01', date '2026-10-31'
  ) #>> '{summary,supplier_count}')::integer),
  1,
  'the report counts the suppliers'
);

select public.is(
  (select (public.get_purchases_report(
    date '2026-10-01', date '2026-10-31'
  ) #>> '{by_supplier,0,total}')::numeric),
  41300::numeric,
  'the supplier breakdown totals the invoice'
);

select public.is(
  (select public.get_purchases_report(
    date '2026-10-01', date '2026-10-31'
  ) #>> '{invoices,0,number}'),
  'PINV-00900',
  'the report lists the invoice number'
);

select public.is(
  (select number from public.save_purchase_invoice(
    (select id from public.suppliers where code = 'SUP-9000'),
    jsonb_build_array(jsonb_build_object(
      'product_id', current_setting('m38.product_id')::uuid,
      'quantity', 3, 'unit_price', 100, 'discount', 0
    )),
    null, date '2026-10-29', 0, 0, 0, 'credit', 0
  )),
  'PINV-00901',
  'a draft purchase is created'
);

select public.is(
  (select (public.get_purchases_report(
    date '2026-10-01', date '2026-10-31'
  ) #>> '{summary,draft_count}')::integer),
  1,
  'the draft is counted separately'
);

select public.is(
  (select (public.get_purchases_report(
    date '2026-10-01', date '2026-10-31'
  ) #>> '{summary,draft_total}')::numeric),
  300::numeric,
  'the draft value is reported without moving the approved total'
);

select public.is(
  (select (public.get_purchases_report(
    date '2026-10-01', date '2026-10-31'
  ) #>> '{summary,approved_total}')::numeric),
  41300::numeric,
  'the draft does not change the approved total'
);

select public.is(
  (select (public.get_purchases_report(
    date '2026-01-01', date '2026-01-31'
  ) #>> '{summary,invoice_count}')::integer),
  0,
  'the purchases report honours the date filter'
);

select public.is(
  (select (public.get_purchases_report(
    date '2026-10-01', date '2026-10-31',
    (select id from public.suppliers where code = 'SUP-9000')
  ) #>> '{summary,invoice_count}')::integer),
  2,
  'the purchases report honours the supplier filter'
);

-- ---------------------------------------------------------------------------
-- Section 7: branch scoping + locked-out user.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000327","role":"authenticated"}', true);

select public.throws_ok(
  $$ select public.get_inventory_report('b0000000-0000-4000-8000-000000000040') $$,
  '42501',
  null,
  'another branch inventory report is rejected'
);

select public.is(
  (select (public.get_inventory_report(null, 'PRD-0900') #>> '{summary,total_quantity}')::numeric),
  0::numeric,
  'an unscoped report only values the membership branches'
);

select public.throws_ok(
  $$ select public.get_vehicles_report('b0000000-0000-4000-8000-000000000040') $$,
  '42501',
  null,
  'another branch vehicle report is rejected'
);

select public.throws_ok(
  $$ select public.get_vehicle_cost_breakdown(current_setting('m38.vehicle_id')::uuid) $$,
  '42501',
  null,
  'another branch vehicle cost is rejected'
);

select public.throws_ok(
  $$ select public.get_purchases_report(null, null, (select id from public.suppliers where code = 'SUP-9000')) $$,
  'P0001',
  null,
  'another branch supplier filter is rejected'
);

select public.is(
  (select count(*) from public.list_vehicle_movements()),
  0::bigint,
  'the other branch sees no vehicle movements'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000328","role":"authenticated"}', true);

select public.throws_ok(
  $$ select public.get_inventory_report() $$,
  '42501',
  null,
  'a viewer cannot read the inventory report'
);

select public.throws_ok(
  $$ select public.get_vehicles_report() $$,
  '42501',
  null,
  'a viewer cannot read the vehicle report'
);

select public.throws_ok(
  $$ select public.get_purchases_report() $$,
  '42501',
  null,
  'a viewer cannot read the purchases report'
);

select public.throws_ok(
  $$ select public.list_vehicle_movements() $$,
  '42501',
  null,
  'a viewer cannot read the vehicle movements report'
);

select public.throws_ok(
  $$ select public.get_vehicle_cost_breakdown(current_setting('m38.vehicle_id')::uuid) $$,
  '42501',
  null,
  'a viewer cannot read a vehicle cost breakdown'
);

select public.finish();
rollback;
