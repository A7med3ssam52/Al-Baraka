-- M3.4 — Purchase invoices, draft side (pgTAP).
-- Self-contained fixtures + rollback. Fixed UUIDs keep asserts independent.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Branch + fixture users:
--   313 inventory  => purchases.view/create/update
--   314 manager    => every permission (approve/cancel)
--   315 no roles
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, is_active)
values ('b0000000-0000-4000-8000-000000000035', 'TST-35', 'فرع مشتريات M3.4', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values
  ('m3.4.a.tst@example.com', now() + interval '15 minutes'),
  ('m3.4.m.tst@example.com', now() + interval '15 minutes'),
  ('m3.4.c.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000313', 'authenticated', 'authenticated', 'm3.4.a.tst@example.com', now(), '{"full_name":"مشتريات A"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000314', 'authenticated', 'authenticated', 'm3.4.m.tst@example.com', now(), '{"full_name":"مشتريات M"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000315', 'authenticated', 'authenticated', 'm3.4.c.tst@example.com', now(), '{"full_name":"مشتريات C"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values
  ('00000000-0000-4000-8000-000000000313', 'مشتريات A', '+201000000330', 'inventory', 'b0000000-0000-4000-8000-000000000035', true),
  ('00000000-0000-4000-8000-000000000314', 'مشتريات M', '+201000000331', 'manager', 'b0000000-0000-4000-8000-000000000035', true),
  ('00000000-0000-4000-8000-000000000315', 'مشتريات C', '+201000000332', 'viewer', 'b0000000-0000-4000-8000-000000000035', true)
on conflict (id) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    branch_id = excluded.branch_id,
    is_active = excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
select u.id::uuid, b.id, true
from (values
  ('00000000-0000-4000-8000-000000000313', 'b0000000-0000-4000-8000-000000000035'),
  ('00000000-0000-4000-8000-000000000314', 'b0000000-0000-4000-8000-000000000035'),
  ('00000000-0000-4000-8000-000000000315', 'b0000000-0000-4000-8000-000000000035')
) as u(id, branch)
join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select u.id::uuid, r.id, b.id, true
from (values
  ('00000000-0000-4000-8000-000000000313', 'inventory'),
  ('00000000-0000-4000-8000-000000000314', 'manager')
) as u(id, role_code)
join public.roles as r on r.code = u.role_code
join public.branches as b on b.code = 'TST-35'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Clean leftovers + fixtures.
-- ---------------------------------------------------------------------------

delete from public.supplier_transactions
where supplier_id in (select id from public.suppliers where code in ('SUP-5350', 'SUP-5351'));
delete from public.purchase_invoices
where supplier_id in (select id from public.suppliers where code in ('SUP-5350', 'SUP-5351'));
delete from public.documents where doc_number in ('DOC-99001', 'DOC-99002');
delete from public.vehicles where chassis_no in ('M34CH00000001', 'M34CH00000002');
delete from public.products where code = 'PRD-0500';
delete from public.suppliers where code in ('SUP-5350', 'SUP-5351');

insert into public.suppliers (code, full_name, phone, branch_id)
values
  ('SUP-5350', 'مورد فواتير M3.4', '01011112222', 'b0000000-0000-4000-8000-000000000035'),
  ('SUP-5351', 'مورد آخر M3.4', '01011113333', 'b0000000-0000-4000-8000-000000000035');

insert into public.documents (doc_number, title, doc_type, owner_type, supplier_id, branch_id)
values
  ('DOC-99001', 'مرفق فاتورة المورد', 'other', 'supplier',
    (select id from public.suppliers where code = 'SUP-5350'),
    'b0000000-0000-4000-8000-000000000035'),
  ('DOC-99002', 'مرفق مورد آخر', 'other', 'supplier',
    (select id from public.suppliers where code = 'SUP-5351'),
    'b0000000-0000-4000-8000-000000000035');

alter table public.products disable trigger audit_products_change;
alter table public.vehicles disable trigger audit_vehicles_change;
alter table public.purchase_invoices disable trigger audit_purchase_invoices_change;
alter table public.purchase_invoice_items disable trigger audit_purchase_invoice_items_change;
update public.code_sequences set next_number = 500
where entity in ('product', 'vehicle', 'purchase_invoice');
alter table public.products enable trigger audit_products_change;
alter table public.vehicles enable trigger audit_vehicles_change;
alter table public.purchase_invoices enable trigger audit_purchase_invoices_change;
alter table public.purchase_invoice_items enable trigger audit_purchase_invoice_items_change;

select public.no_plan();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000313","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Section 1: fixture product + vehicle.
-- ---------------------------------------------------------------------------

select public.is(
  (select code from public.create_product('منتج فاتورة M3.4', null, null, null, 'قطعة')),
  'PRD-0500',
  'the fixture product is numbered'
);

select public.is(
  (select code from public.create_vehicle(
    'M34CH00000001', 'M34EN00000001', 'motorcycle', null, null, null,
    null, null, (select id from public.suppliers where code = 'SUP-5350'),
    date '2026-10-20', 40000, 0, 0, null, 48000,
    'b0000000-0000-4000-8000-000000000035'
  )),
  'VEH-0500',
  'the fixture vehicle is numbered'
);

-- ---------------------------------------------------------------------------
-- Section 2: draft creation with allocation.
-- ---------------------------------------------------------------------------

select public.is(
  (select number from public.save_purchase_invoice(
    (select id from public.suppliers where code = 'SUP-5350'),
    jsonb_build_array(
      jsonb_build_object(
        'product_id', (select id from public.products where code = 'PRD-0500'),
        'description', 'قطع غيار',
        'quantity', 10,
        'unit_price', 100,
        'discount', 0
      ),
      jsonb_build_object(
        'vehicle_id', (select id from public.vehicles where code = 'VEH-0500'),
        'description', 'دراجة',
        'quantity', 1,
        'unit_price', 40000,
        'discount', 0
      )
    ),
    null, date '2026-10-25', 100, 200, 50, 'cash', 5000,
    'فاتورة اختبار', 'REF-1'
  )),
  'PINV-00500',
  'the invoice takes the next atomic PINV number'
);

select public.is(
  (select subtotal from public.purchase_invoices where number = 'PINV-00500'),
  41000::numeric,
  'the subtotal sums the line totals'
);

select public.is(
  (select total from public.purchase_invoices where number = 'PINV-00500'),
  41150::numeric,
  'the total applies the discount then the direct costs'
);

select public.is(
  (select remaining_amount from public.purchase_invoices where number = 'PINV-00500'),
  36150::numeric,
  'the remaining amount is total minus paid'
);

select public.is(
  (select status from public.purchase_invoices where number = 'PINV-00500'),
  'draft',
  'a new invoice starts as a draft'
);

select public.is(
  (select cashbox_id is not null from public.purchase_invoices where number = 'PINV-00500'),
  true,
  'a cash invoice resolves the branch default cashbox'
);

select public.is(
  (select allocated_transport from public.purchase_invoice_items
   where invoice_id = (select id from public.purchase_invoices where number = 'PINV-00500')
     and line_no = 1),
  4.88::numeric,
  'transport is allocated proportionally to the line value'
);

select public.is(
  (select allocated_prep from public.purchase_invoice_items
   where invoice_id = (select id from public.purchase_invoices where number = 'PINV-00500')
     and line_no = 1),
  1.22::numeric,
  'prep cost follows the same allocation basis'
);

select public.is(
  (select allocated_transport from public.purchase_invoice_items
   where invoice_id = (select id from public.purchase_invoices where number = 'PINV-00500')
     and line_no = 2),
  195.12::numeric,
  'the last line absorbs the transport rounding remainder'
);

select public.is(
  (select landed_unit_cost from public.purchase_invoice_items
   where invoice_id = (select id from public.purchase_invoices where number = 'PINV-00500')
     and line_no = 1),
  100.61::numeric,
  'the landed unit cost includes the allocated direct costs'
);

select public.is(
  (select item_count from public.list_purchase_invoices('all', null, 'PINV-00500')),
  2::integer,
  'the list reports the item count'
);

-- ---------------------------------------------------------------------------
-- Section 3: validation.
-- ---------------------------------------------------------------------------

select public.throws_ok(
  format(
    'select public.save_purchase_invoice(%L, %L::jsonb, null, current_date, %s)',
    (select id from public.suppliers where code = 'SUP-5350'),
    jsonb_build_array(jsonb_build_object(
      'product_id', (select id from public.products where code = 'PRD-0500'),
      'quantity', 1, 'unit_price', 100
    )),
    5000
  ),
  '22023',
  null,
  'a discount larger than the subtotal is rejected'
);

select public.throws_ok(
  format(
    'select public.save_purchase_invoice(%L, %L::jsonb)',
    (select id from public.suppliers where code = 'SUP-5350'),
    jsonb_build_array(jsonb_build_object(
      'product_id', (select id from public.products where code = 'PRD-0500'),
      'vehicle_id', (select id from public.vehicles where code = 'VEH-0500'),
      'quantity', 1, 'unit_price', 100
    ))
  ),
  '22023',
  null,
  'a line cannot target a product and a vehicle together'
);

select public.throws_ok(
  format(
    'select public.save_purchase_invoice(%L, %L::jsonb)',
    (select id from public.suppliers where code = 'SUP-5350'),
    jsonb_build_array(jsonb_build_object(
      'product_id', (select id from public.products where code = 'PRD-0500'),
      'quantity', 0, 'unit_price', 100
    ))
  ),
  '22023',
  null,
  'a zero-quantity line is rejected'
);

select public.throws_ok(
  format(
    'select public.save_purchase_invoice(%L, %L::jsonb)',
    '00000000-0000-4000-8000-0000000000ff',
    jsonb_build_array(jsonb_build_object(
      'product_id', (select id from public.products where code = 'PRD-0500'),
      'quantity', 1, 'unit_price', 100
    ))
  ),
  'P0001',
  null,
  'a missing supplier is rejected'
);

select public.throws_ok(
  format(
    'select public.save_purchase_invoice(%L, %L::jsonb, null, current_date, 0, 0, 0, %L)',
    (select id from public.suppliers where code = 'SUP-5350'),
    jsonb_build_array(jsonb_build_object(
      'product_id', (select id from public.products where code = 'PRD-0500'),
      'quantity', 1, 'unit_price', 100
    )),
    'bank'
  ),
  'P0001',
  null,
  'a bank invoice without an active bank account is rejected'
);

select public.throws_ok(
  format(
    'select public.save_purchase_invoice(%L, %L::jsonb, null, current_date, 0, 0, 0, %L, %s)',
    (select id from public.suppliers where code = 'SUP-5350'),
    jsonb_build_array(jsonb_build_object(
      'product_id', (select id from public.products where code = 'PRD-0500'),
      'quantity', 1, 'unit_price', 100
    )),
    'credit',
    50
  ),
  '22023',
  null,
  'a credit invoice cannot carry an upfront payment'
);

-- ---------------------------------------------------------------------------
-- Section 4: draft update replaces the lines.
-- ---------------------------------------------------------------------------

select public.lives_ok(
  format(
    'select public.save_purchase_invoice(%L, %L::jsonb, %L, date %L, 0, 0, 0, %L, 0)',
    (select id from public.suppliers where code = 'SUP-5350'),
    jsonb_build_array(jsonb_build_object(
      'product_id', (select id from public.products where code = 'PRD-0500'),
      'quantity', 5, 'unit_price', 100
    )),
    (select id from public.purchase_invoices where number = 'PINV-00500'),
    '2026-10-26',
    'credit'
  ),
  'a draft invoice accepts an update'
);

select public.is(
  (select total from public.purchase_invoices where number = 'PINV-00500'),
  500::numeric,
  'the updated total reflects the new single line'
);

select public.is(
  (select count(*) from public.purchase_invoice_items
   where invoice_id = (select id from public.purchase_invoices where number = 'PINV-00500')),
  1::bigint,
  'the update replaced the previous lines'
);

-- ---------------------------------------------------------------------------
-- Section 5: unified document attachment.
-- ---------------------------------------------------------------------------

select public.is(
  (select document_id from public.set_purchase_invoice_document(
    (select id from public.purchase_invoices where number = 'PINV-00500'),
    (select id from public.documents where doc_number = 'DOC-99001')
  )),
  (select id from public.documents where doc_number = 'DOC-99001'),
  'a supplier document can be attached to the invoice'
);

select public.throws_ok(
  format(
    'select public.set_purchase_invoice_document(%L, %L)',
    (select id from public.purchase_invoices where number = 'PINV-00500'),
    (select id from public.documents where doc_number = 'DOC-99002')
  ),
  'P0001',
  null,
  'a document that belongs to another supplier is rejected'
);

select public.is(
  (select (public.get_purchase_invoice(
    (select id from public.purchase_invoices where number = 'PINV-00500')
  ) ->> 'invoice')::jsonb ->> 'number'),
  'PINV-00500',
  'the detail function returns the header'
);

select public.is(
  (select jsonb_array_length(public.get_purchase_invoice(
    (select id from public.purchase_invoices where number = 'PINV-00500')
  ) -> 'items')),
  1,
  'the detail function returns its lines'
);

select public.is(
  public.supplier_balance((select id from public.suppliers where code = 'SUP-5350')),
  0::numeric,
  'a draft invoice does not move the supplier balance yet'
);

-- ---------------------------------------------------------------------------
-- Section 6: cancel (manager only).
-- ---------------------------------------------------------------------------

select public.throws_ok(
  format(
    'select public.cancel_purchase_invoice(%L)',
    (select id from public.purchase_invoices where number = 'PINV-00500')
  ),
  '42501',
  null,
  'the inventory role cannot cancel invoices'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000314","role":"authenticated"}', true);

select public.is(
  (select status from public.cancel_purchase_invoice(
    (select id from public.purchase_invoices where number = 'PINV-00500'),
    'إلغاء تجريبي'
  )),
  'cancelled',
  'a manager cancels the draft'
);

select public.throws_ok(
  format(
    'select public.save_purchase_invoice(%L, %L::jsonb, %L)',
    (select id from public.suppliers where code = 'SUP-5350'),
    jsonb_build_array(jsonb_build_object(
      'product_id', (select id from public.products where code = 'PRD-0500'),
      'quantity', 1, 'unit_price', 100
    )),
    (select id from public.purchase_invoices where number = 'PINV-00500')
  ),
  'P0001',
  null,
  'a cancelled invoice can no longer be edited'
);

-- ---------------------------------------------------------------------------
-- Section 7: user C (no roles) is locked out.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000315","role":"authenticated"}', true);

select public.is(
  coalesce((select count(*) from public.purchase_invoices), 0),
  0::bigint,
  'C sees zero invoices through RLS'
);

select public.throws_ok(
  format(
    'select public.save_purchase_invoice(%L, %L::jsonb)',
    (select id from public.suppliers where code = 'SUP-5350'),
    jsonb_build_array(jsonb_build_object(
      'quantity', 1, 'unit_price', 100
    ))
  ),
  '42501',
  null,
  'C cannot create invoices'
);

select public.throws_ok(
  $$ select public.list_purchase_invoices() $$,
  '42501',
  null,
  'C cannot read the invoice list'
);

select public.finish();
rollback;
