-- M4.1 — Sales invoices (draft side) (pgTAP).
-- Self-contained fixtures + rollback. Fixed UUIDs keep asserts independent.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

insert into public.branches (id, code, name, is_active)
values
  ('b0000000-0000-4000-8000-000000000042', 'TST-42', 'فرع مبيعات M4.1', true),
  ('b0000000-0000-4000-8000-000000000043', 'TST-43', 'فرع آخر M4.1', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values
  ('m4.1.s.tst@example.com', now() + interval '15 minutes'),
  ('m4.1.m.tst@example.com', now() + interval '15 minutes'),
  ('m4.1.b.tst@example.com', now() + interval '15 minutes'),
  ('m4.1.v.tst@example.com', now() + interval '15 minutes'),
  ('m4.1.c.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000329', 'authenticated', 'authenticated', 'm4.1.s.tst@example.com', now(), '{"full_name":"مبيعات S"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000330', 'authenticated', 'authenticated', 'm4.1.m.tst@example.com', now(), '{"full_name":"مبيعات M"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000331', 'authenticated', 'authenticated', 'm4.1.b.tst@example.com', now(), '{"full_name":"مبيعات B"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000332', 'authenticated', 'authenticated', 'm4.1.v.tst@example.com', now(), '{"full_name":"مبيعات V"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000333', 'authenticated', 'authenticated', 'm4.1.c.tst@example.com', now(), '{"full_name":"مبيعات C"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values
  ('00000000-0000-4000-8000-000000000329', 'مبيعات S', '+201000000380', 'sales', 'b0000000-0000-4000-8000-000000000042', true),
  ('00000000-0000-4000-8000-000000000330', 'مبيعات M', '+201000000381', 'manager', 'b0000000-0000-4000-8000-000000000042', true),
  ('00000000-0000-4000-8000-000000000331', 'مبيعات B', '+201000000382', 'sales', 'b0000000-0000-4000-8000-000000000043', true),
  ('00000000-0000-4000-8000-000000000332', 'مبيعات V', '+201000000383', 'viewer', 'b0000000-0000-4000-8000-000000000042', true),
  ('00000000-0000-4000-8000-000000000333', 'مبيعات C', '+201000000384', 'viewer', 'b0000000-0000-4000-8000-000000000042', true)
on conflict (id) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    branch_id = excluded.branch_id,
    is_active = excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
select u.id::uuid, b.id, true
from (values
  ('00000000-0000-4000-8000-000000000329', 'b0000000-0000-4000-8000-000000000042'),
  ('00000000-0000-4000-8000-000000000330', 'b0000000-0000-4000-8000-000000000042'),
  ('00000000-0000-4000-8000-000000000331', 'b0000000-0000-4000-8000-000000000043'),
  ('00000000-0000-4000-8000-000000000332', 'b0000000-0000-4000-8000-000000000042'),
  ('00000000-0000-4000-8000-000000000333', 'b0000000-0000-4000-8000-000000000042')
) as u(id, branch)
join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select u.id::uuid, r.id, b.id, true
from (values
  ('00000000-0000-4000-8000-000000000329', 'sales', 'b0000000-0000-4000-8000-000000000042'),
  ('00000000-0000-4000-8000-000000000330', 'manager', 'b0000000-0000-4000-8000-000000000042'),
  ('00000000-0000-4000-8000-000000000331', 'sales', 'b0000000-0000-4000-8000-000000000043'),
  ('00000000-0000-4000-8000-000000000332', 'viewer', 'b0000000-0000-4000-8000-000000000042')
) as u(id, role_code, branch)
join public.roles as r on r.code = u.role_code
join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

delete from public.sales_invoice_items
where invoice_id in (
  select id from public.sales_invoices
  where branch_id in ('b0000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000043')
);
delete from public.sales_invoices
where branch_id in ('b0000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000043');
delete from public.stock_movements
where branch_id in ('b0000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000043');
delete from public.product_stock
where branch_id in ('b0000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000043');
delete from public.vehicles
where chassis_no in ('M41CH00000001', 'M41CH00000002', 'M41CH00000003', 'M41CH00000004');
delete from public.products where code = 'PRD-1000';

alter table public.products disable trigger audit_products_change;
alter table public.vehicles disable trigger audit_vehicles_change;
update public.code_sequences set next_number = 1000
where entity in ('product', 'vehicle', 'sales_invoice', 'customer');
alter table public.products enable trigger audit_products_change;
alter table public.vehicles enable trigger audit_vehicles_change;

update public.system_settings set default_discount_limit = 500 where id;

select public.no_plan();

-- manager creates product
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000330","role":"authenticated"}', true);

select public.is(
  (select code from public.create_product('منتج مبيعات M4.1', null, null, null, 'قطعة', null, null, 100)),
  'PRD-1000',
  'the fixture product is numbered'
);

-- vehicles as superuser
reset role;

insert into public.vehicles (code, chassis_no, engine_no, vehicle_type, purchase_price, transport_cost, prep_cost, approved_cost, suggested_price, branch_id, status, created_by, updated_by)
values
  ('VEH-1000', 'M41CH00000001', 'M41EN00000001', 'motorcycle', 40000, 0, 0, 40000, 50000, 'b0000000-0000-4000-8000-000000000042', 'available', null, null),
  ('VEH-1001', 'M41CH00000002', 'M41EN00000002', 'motorcycle', 40000, 0, 0, 40000, 50000, 'b0000000-0000-4000-8000-000000000042', 'sold', null, null),
  ('VEH-1002', 'M41CH00000003', 'M41EN00000003', 'motorcycle', 40000, 0, 0, 40000, 50000, 'b0000000-0000-4000-8000-000000000042', 'reserved', null, null),
  ('VEH-1003', 'M41CH00000004', 'M41EN00000004', 'motorcycle', 40000, 0, 0, 40000, 50000, 'b0000000-0000-4000-8000-000000000043', 'available', null, null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000330","role":"authenticated"}', true);

select public.is((select code from public.vehicles where chassis_no = 'M41CH00000001'), 'VEH-1000', 'the available vehicle is numbered');
select public.is((select code from public.vehicles where chassis_no = 'M41CH00000002'), 'VEH-1001', 'the sold vehicle is numbered');
select public.is((select code from public.vehicles where chassis_no = 'M41CH00000003'), 'VEH-1002', 'the reserved vehicle is numbered');
-- (VEH-1003 is in another branch and not visible to this user)

-- sales user fixtures
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000329","role":"authenticated"}', true);

select public.is(
  (select public.sales_discount_policy() #>> '{limit}')::numeric,
  500::numeric,
  'the sales user has a five-hundred discount limit'
);

select public.is(
  (select (public.sales_discount_policy() #>> '{can_approve}')::boolean),
  false,
  'the sales user cannot approve discounts'
);

select public.is(
  (select code from public.create_customer(
    'عميل مبيعات M4.1', '29810122345699', '01012345678'
  )),
  'CUS-1000',
  'the fixture customer is numbered'
);

select public.is(
  set_config(
    'm41.product_id',
    (select id from public.products where code = 'PRD-1000')::text,
    false
  ) is not null,
  true,
  'the product id is captured'
);

select public.is(
  set_config(
    'm41.vehicle_id',
    (select id from public.vehicles where code = 'VEH-1000')::text,
    false
  ) is not null,
  true,
  'the available vehicle id is captured'
);

select public.is(
  set_config(
    'm41.customer_id',
    (select id from public.customers where code = 'CUS-1000')::text,
    false
  ) is not null,
  true,
  'the customer id is captured'
);

select public.is(
  (select count(*) from public.list_vehicles('available')),
  1::bigint,
  'only the available vehicle shows up in the available list'
);

-- create draft
select public.is(
  (select number from public.save_sales_invoice(
    current_setting('m41.customer_id')::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'vehicle_id', current_setting('m41.vehicle_id')::uuid,
        'quantity', 1, 'unit_price', 40000, 'discount', 0
      ),
      jsonb_build_object(
        'product_id', current_setting('m41.product_id')::uuid,
        'quantity', 2, 'unit_price', 100, 'discount', 0
      )
    ),
    null, date '2026-10-29', 'cash', 200, 10000, 'مسودة مبيعات M4.1'
  )),
  'SINV-01000',
  'the draft takes the next SINV number'
);

select public.is(
  (select status from public.sales_invoices where number = 'SINV-01000'),
  'draft',
  'a new sale starts as a draft'
);

select public.is(
  (select subtotal from public.sales_invoices where number = 'SINV-01000'),
  40200::numeric,
  'the subtotal sums the lines'
);

select public.is(
  (select total from public.sales_invoices where number = 'SINV-01000'),
  40000::numeric,
  'the total subtracts the invoice discount'
);

select public.is(
  (select remaining_amount from public.sales_invoices where number = 'SINV-01000'),
  30000::numeric,
  'the remaining amount is total minus paid'
);

select public.is(
  (select count(*) from public.list_sales_invoices()),
  1::bigint,
  'the list reports the invoices'
);

select public.is(
  (select (public.get_sales_invoice(
    (select id from public.sales_invoices where number = 'SINV-01000')
  ) #>> '{items,0,vehicle_code}')),
  'VEH-1000',
  'the first line is the available vehicle'
);

select public.is(
  (select (public.get_sales_invoice(
    (select id from public.sales_invoices where number = 'SINV-01000')
  ) #>> '{items,1,product_code}')),
  'PRD-1000',
  'the second line is the product'
);

select public.is(
  (select (public.get_sales_invoice(
    (select id from public.sales_invoices where number = 'SINV-01000')
  ) #>> '{items,0,unit_cost}')::numeric),
  (select approved_cost from public.vehicles where code = 'VEH-1000'),
  'the vehicle line stores the approved cost'
);

select public.is(
  (select (public.get_sales_invoice(
    (select id from public.sales_invoices where number = 'SINV-01000')
  ) #>> '{items,1,unit_cost}')::numeric),
  100::numeric,
  'the product line stores the product cost'
);

select public.is(
  (select status from public.vehicles where code = 'VEH-1000'),
  'available',
  'a draft sale leaves the vehicle available'
);

select public.is(
  coalesce((select quantity from public.product_stock
   where product_id = current_setting('m41.product_id')::uuid
     and branch_id = 'b0000000-0000-4000-8000-000000000042'), 0),
  0::numeric,
  'a draft sale leaves the stock untouched'
);

select public.is(
  (select count(*) from public.stock_movements
   where branch_id in ('b0000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000043')),
  0::bigint,
  'a draft sale writes no stock movement'
);

-- restore draft
select public.is(
  (select number from public.save_sales_invoice(
    current_setting('m41.customer_id')::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'vehicle_id', current_setting('m41.vehicle_id')::uuid,
        'quantity', 1, 'unit_price', 40000, 'discount', 0
      ),
      jsonb_build_object(
        'product_id', current_setting('m41.product_id')::uuid,
        'quantity', 2, 'unit_price', 100, 'discount', 0
      )
    ),
    (select id from public.sales_invoices where number = 'SINV-01000'),
    date '2026-10-29', 'cash', 300, 5000, 'مسودة محدّثة'
  )),
  'SINV-01000',
  'restoring a draft keeps its number'
);

select public.is(
  (select total from public.sales_invoices where number = 'SINV-01000'),
  39900::numeric,
  'the restored draft recomputes the total'
);

select public.is(
  (select remaining_amount from public.sales_invoices where number = 'SINV-01000'),
  34900::numeric,
  'the restored draft recomputes the remaining amount'
);

select public.is(
  (select count(*) from public.list_sales_invoices()),
  1::bigint,
  'the restored draft keeps the invoices'
);

select public.is(
  (select (public.get_sales_invoice(
    (select id from public.sales_invoices where number = 'SINV-01000')
  ) #>> '{invoice,notes}')),
  'مسودة محدّثة',
  'the restored draft keeps the updated notes'
);

-- discount ceiling by role
select public.throws_ok(
  format(
    'select public.save_sales_invoice(%L, %L::jsonb, %L, current_date, %L, %s, %s, %L)',
    current_setting('m41.customer_id'),
    jsonb_build_array(jsonb_build_object(
      'product_id', current_setting('m41.product_id')::uuid,
      'quantity', 1, 'unit_price', 1000, 'discount', 0
    )),
    (select id from public.sales_invoices where number = 'SINV-01000'),
    'cash', 600, 0, 'خصم مفرط'
  ),
  'P0001',
  null,
  'a sales user cannot exceed the discount limit'
);

select public.is(
  (select discount from public.sales_invoices where number = 'SINV-01000'),
  300::numeric,
  'the rejected discount leaves the draft unchanged'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000330","role":"authenticated"}', true);

select public.is(
  (select discount from public.save_sales_invoice(
    current_setting('m41.customer_id')::uuid,
    jsonb_build_array(jsonb_build_object(
      'product_id', current_setting('m41.product_id')::uuid,
      'quantity', 1, 'unit_price', 1000, 'discount', 0
    )),
    (select id from public.sales_invoices where number = 'SINV-01000'),
    date '2026-10-29', 'cash', 600, 0
  )),
  600::numeric,
  'the manager may exceed the discount limit'
);

select public.is(
  (select discount_approved_by from public.sales_invoices where number = 'SINV-01000'),
  '00000000-0000-4000-8000-000000000330'::uuid,
  'the approving manager is recorded'
);

select public.is(
  (select (public.sales_discount_policy() #>> '{can_approve}')::boolean),
  true,
  'the manager may approve discounts'
);

select public.is(
  (select public.sales_discount_policy() #>> '{limit}'),
  null,
  'the manager has no discount limit'
);

select public.save_sales_invoice(
  current_setting('m41.customer_id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'product_id', current_setting('m41.product_id')::uuid,
    'quantity', 1, 'unit_price', 1000, 'discount', 0
  )),
  (select id from public.sales_invoices where number = 'SINV-01000'),
  date '2026-10-29', 'cash', 200, 0
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000329","role":"authenticated"}', true);

-- vehicle availability guards
select public.throws_ok(
  format(
    'select public.save_sales_invoice(%L, %L::jsonb)',
    current_setting('m41.customer_id'),
    jsonb_build_array(jsonb_build_object(
      'vehicle_id', (select id from public.vehicles where code = 'VEH-1001')::uuid,
      'quantity', 1, 'unit_price', 40000, 'discount', 0
    ))
  ),
  'P0001',
  null,
  'a sold vehicle cannot be added to a sale'
);

select public.throws_ok(
  format(
    'select public.save_sales_invoice(%L, %L::jsonb)',
    current_setting('m41.customer_id'),
    jsonb_build_array(jsonb_build_object(
      'vehicle_id', (select id from public.vehicles where code = 'VEH-1002')::uuid,
      'quantity', 1, 'unit_price', 40000, 'discount', 0
    ))
  ),
  'P0001',
  null,
  'a reserved vehicle cannot be added to a sale'
);

-- (branch-mismatch covered by RLS hiding cross-branch vehicles)
select public.throws_ok(
  format(
    'select public.save_sales_invoice(%L, %L::jsonb)',
    current_setting('m41.customer_id'),
    jsonb_build_array(
      jsonb_build_object(
        'vehicle_id', current_setting('m41.vehicle_id')::uuid,
        'quantity', 1, 'unit_price', 40000, 'discount', 0
      ),
      jsonb_build_object(
        'vehicle_id', current_setting('m41.vehicle_id')::uuid,
        'quantity', 1, 'unit_price', 40000, 'discount', 0
      )
    )
  ),
  '22023',
  null,
  'a duplicate vehicle line is rejected'
);

-- validation guards
select public.throws_ok(
  format(
    'select public.save_sales_invoice(%L, %L::jsonb)',
    current_setting('m41.customer_id'),
    '[]'::jsonb
  ),
  '22023',
  null,
  'an empty sale is rejected'
);

select public.throws_ok(
  format(
    'select public.save_sales_invoice(%L, %L::jsonb)',
    current_setting('m41.customer_id'),
    jsonb_build_array(jsonb_build_object(
      'product_id', current_setting('m41.product_id')::uuid,
      'vehicle_id', current_setting('m41.vehicle_id')::uuid,
      'quantity', 1, 'unit_price', 100, 'discount', 0
    ))
  ),
  '22023',
  null,
  'a line with two targets is rejected'
);

select public.throws_ok(
  format(
    'select public.save_sales_invoice(%L, %L::jsonb)',
    current_setting('m41.customer_id'),
    jsonb_build_array(jsonb_build_object(
      'vehicle_id', current_setting('m41.vehicle_id')::uuid,
      'quantity', 2, 'unit_price', 40000, 'discount', 0
    ))
  ),
  '22023',
  null,
  'a vehicle line with quantity other than one is rejected'
);

select public.throws_ok(
  format(
    'select public.save_sales_invoice(%L, %L::jsonb, null, current_date, %L, 0, %s)',
    current_setting('m41.customer_id'),
    jsonb_build_array(jsonb_build_object(
      'product_id', current_setting('m41.product_id')::uuid,
      'quantity', 1, 'unit_price', 100, 'discount', 0
    )),
    'cash', 99999
  ),
  '22023',
  null,
  'paid amount cannot exceed the total'
);

-- (covered by save_sales_invoice validation)

select public.lives_ok(
  format(
    'select public.save_sales_invoice(%L, %L::jsonb, null, current_date, %L, 0, 0)',
    current_setting('m41.customer_id'),
    jsonb_build_array(jsonb_build_object(
      'product_id', current_setting('m41.product_id')::uuid,
      'quantity', 1, 'unit_price', 100, 'discount', 0
    )),
    'installment'
  ),
  'an installment sale is accepted'
);

-- customer guards
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000331","role":"authenticated"}', true);

select public.is(
  (select code from public.create_customer(
    'عميل فرع آخر M4.1', '29810122345698', '01112345678'
  )),
  'CUS-1001',
  'the other-branch customer is numbered'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000329","role":"authenticated"}', true);

select public.throws_ok(
  format(
    'select public.save_sales_invoice(%L, %L::jsonb)',
    (select id from public.customers where code = 'CUS-1001'),
    jsonb_build_array(jsonb_build_object(
      'product_id', current_setting('m41.product_id')::uuid,
      'quantity', 1, 'unit_price', 100, 'discount', 0
    ))
  ),
  'P0001',
  null,
  'a customer from another branch cannot be used'
);

select public.throws_ok(
  format(
    'select public.save_sales_invoice(%L, %L::jsonb)',
    current_setting('m41.customer_id'),
    jsonb_build_array(jsonb_build_object(
      'product_id', '00000000-0000-4000-8000-000000000999'::uuid,
      'quantity', 1, 'unit_price', 100, 'discount', 0
    ))
  ),
  'P0001',
  null,
  'an unknown product cannot be sold'
);

-- second draft and filters
select public.is(
  (select number from public.save_sales_invoice(
    current_setting('m41.customer_id')::uuid,
    jsonb_build_array(jsonb_build_object(
      'product_id', current_setting('m41.product_id')::uuid,
      'quantity', 1, 'unit_price', 100, 'discount', 0
    )),
    null, date '2026-10-29', 'cash', 0, 100
  )),
  'SINV-01002',
  'the next draft takes the following number'
);

select public.is(
  (select count(*) from public.list_sales_invoices('all', current_setting('m41.customer_id')::uuid)),
  3::bigint,
  'the customer filter narrows the list'
);

select public.is(
  (select count(*) from public.list_sales_invoices('draft')),
  3::bigint,
  'the status filter counts the drafts'
);

select public.is(
  (select count(*) from public.list_sales_invoices('cancelled')),
  0::bigint,
  'no sale is cancelled yet'
);

-- viewer
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000332","role":"authenticated"}', true);

select public.is(
  (select count(*) from public.list_sales_invoices()),
  3::bigint,
  'the viewer can read the drafts'
);

select public.throws_ok(
  format(
    'select public.save_sales_invoice(%L, %L::jsonb)',
    current_setting('m41.customer_id'),
    jsonb_build_array(jsonb_build_object(
      'product_id', current_setting('m41.product_id')::uuid,
      'quantity', 1, 'unit_price', 100, 'discount', 0
    ))
  ),
  '42501',
  null,
  'the viewer cannot create a sale'
);

select public.lives_ok(
  $$ select public.sales_discount_policy() $$,
  'the viewer may read the discount policy'
);

-- other branch and locked-out
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000331","role":"authenticated"}', true);

select public.is(
  (select count(*) from public.list_sales_invoices()),
  0::bigint,
  'the other branch sees no sales'
);

select public.throws_ok(
  format(
    'select public.get_sales_invoice(%L)',
    (select id from public.sales_invoices where number = 'SINV-01000')
  ),
  'P0001',
  null,
  'the other branch cannot read a sale detail'
);

select public.throws_ok(
  format(
    'select public.cancel_sales_invoice(%L)',
    (select id from public.sales_invoices where number = 'SINV-01000')
  ),
  'P0001',
  null,
  'the other branch cannot cancel a sale'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000333","role":"authenticated"}', true);

select public.throws_ok(
  $$ select public.list_sales_invoices() $$,
  '42501',
  null,
  'a user without roles cannot list sales'
);

select public.throws_ok(
  format(
    'select public.get_sales_invoice(%L)',
    (select id from public.sales_invoices where number = 'SINV-01000')
  ),
  '42501',
  null,
  'a user without roles cannot read a sale detail'
);

select public.throws_ok(
  $$ select public.sales_discount_policy() $$,
  '42501',
  null,
  'a user without roles cannot read the discount policy'
);

select public.throws_ok(
  format(
    'select public.save_sales_invoice(%L, %L::jsonb)',
    current_setting('m41.customer_id'),
    jsonb_build_array(jsonb_build_object(
      'product_id', current_setting('m41.product_id')::uuid,
      'quantity', 1, 'unit_price', 100, 'discount', 0
    ))
  ),
  '42501',
  null,
  'a user without roles cannot create a sale'
);

-- cancel draft
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000329","role":"authenticated"}', true);

select public.is(
  (select status from public.cancel_sales_invoice(
    (select id from public.sales_invoices where number = 'SINV-01002'), 'إلغاء اختباري'
  )),
  'cancelled',
  'a draft sale can be cancelled'
);

select public.throws_ok(
  format(
    'select public.save_sales_invoice(%L, %L::jsonb, %L)',
    current_setting('m41.customer_id'),
    jsonb_build_array(jsonb_build_object(
      'product_id', current_setting('m41.product_id')::uuid,
      'quantity', 1, 'unit_price', 100, 'discount', 0
    )),
    (select id from public.sales_invoices where number = 'SINV-01002')
  ),
  'P0001',
  null,
  'a cancelled sale can no longer be edited'
);

select public.throws_ok(
  format(
    'select public.cancel_sales_invoice(%L)',
    (select id from public.sales_invoices where number = 'SINV-01002')
  ),
  'P0001',
  null,
  'a cancelled sale cannot be cancelled again'
);

select public.is(
  (select count(*) from public.list_sales_invoices('cancelled')),
  1::bigint,
  'the cancelled sale is counted separately'
);

select public.finish();
rollback;
