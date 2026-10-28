-- M3.1 — Classifications and quantitative products (pgTAP).
-- Self-contained fixtures + rollback. Fixed UUIDs keep asserts independent.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Branch + fixture users:
--   A (306): sales+inventory => products.view/create/update/archive
--   C (307): no roles        => nothing
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, is_active)
values ('b0000000-0000-4000-8000-000000000031', 'TST-31', 'فرع اختبار M3.1', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values
  ('m3.1.a.tst@example.com', now() + interval '15 minutes'),
  ('m3.1.c.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000306', 'authenticated', 'authenticated', 'm3.1.a.tst@example.com', now(), '{"full_name":"منتجات A"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000307', 'authenticated', 'authenticated', 'm3.1.c.tst@example.com', now(), '{"full_name":"منتجات C"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values
  ('00000000-0000-4000-8000-000000000306', 'منتجات A', '+201000000316', 'sales', 'b0000000-0000-4000-8000-000000000031', true),
  ('00000000-0000-4000-8000-000000000307', 'منتجات C', '+201000000317', 'viewer', 'b0000000-0000-4000-8000-000000000031', true)
on conflict (id) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    branch_id = excluded.branch_id,
    is_active = excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
select u.id::uuid, b.id, true
from (values
  ('00000000-0000-4000-8000-000000000306', 'b0000000-0000-4000-8000-000000000031'),
  ('00000000-0000-4000-8000-000000000307', 'b0000000-0000-4000-8000-000000000031')
) as u(id, branch)
join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select u.id::uuid, r.id, b.id, (u.role_code = 'sales')
from (values
  ('00000000-0000-4000-8000-000000000306', 'sales'),
  ('00000000-0000-4000-8000-000000000306', 'inventory')
) as u(id, role_code)
join public.roles as r on r.code = u.role_code
join public.branches as b on b.code = 'TST-31'
on conflict do nothing;

-- Clean fixtures from earlier runs.
delete from public.products where code in ('PRD-0100', 'PRD-0101', 'PRD-0102');
delete from public.product_models where name = 'موديل M3.1';
delete from public.product_brands where name = 'ماركة M3.1';
delete from public.product_categories where name in ('إطار M3.1', 'زيت M3.1', 'أب F.1');

alter table public.products disable trigger audit_products_change;
alter table public.product_categories disable trigger audit_product_categories_change;
update public.code_sequences set next_number = 100 where entity = 'product';
alter table public.products enable trigger audit_products_change;
alter table public.product_categories enable trigger audit_product_categories_change;

select public.no_plan();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000306","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Section 1: permissions and reference catalog.
-- ---------------------------------------------------------------------------

select public.ok(public.has_permission('products.view'), 'A can view products');
select public.ok(public.has_permission('products.create'), 'A can create products');
select public.ok(not public.has_permission('roles.manage'), 'unrelated permission stays untouched');

select public.lives_ok(
  $$ select public.save_product_category('إطار M3.1') $$,
  'a parent category is created'
);

select public.is(
  (select parent_id from public.save_product_category(
    'زيت M3.1', (select id from public.product_categories where name = 'إطار M3.1'))),
  (select id from public.product_categories where name = 'إطار M3.1'),
  'a child category stores its parent'
);

select public.throws_ok(
  $$ select public.save_product_category('ز') $$,
  '22023',
  null,
  'a reference name shorter than 2 characters is rejected'
);

select public.lives_ok(
  $$ select public.save_product_brand('ماركة M3.1') $$,
  'the fixed-name brand is created once'
);

select public.throws_ok(
  $$ select public.save_product_brand('ماركة M3.1') $$,
  '23505',
  null,
  'a duplicate brand name is rejected by the unique constraint'
);


select public.is(
  (select count(*) from public.product_units where is_active),
  5::bigint,
  'the seeded measurement units are available'
);

select public.is(
  (select count(*) from public.save_product_model(
    (select id from public.product_brands where name = 'ماركة M3.1'), 'موديل M3.1')),
  1::bigint,
  'the brand model is created under its brand'
);

select public.throws_ok(
  format('select public.save_product_model(gen_random_uuid(), %L)', 'موديل يتيم'),
  'P0001',
  null,
  'a model with a missing brand is rejected'
);

-- ---------------------------------------------------------------------------
-- Section 2: products.
-- ---------------------------------------------------------------------------

select public.is(
  (select code from public.create_product(
    'إطار أمامي M3.1',
    (select id from public.product_categories where name = 'إطار M3.1'),
    (select id from public.product_brands where name = 'ماركة M3.1'),
    (select id from public.product_models where name = 'موديل M3.1'),
    'قطعة',
    '22800001230001',
    'قاس 120/70-17',
    350.50,
    'avco',
    8
  )),
  'PRD-0100',
  'the product takes the next atomic PRD code'
);

select public.is(
  (select stock_qty from public.products where code = 'PRD-0100'),
  0::numeric,
  'a fresh product starts with zero stock'
);

select public.is(
  (select unit_cost from public.products where code = 'PRD-0100'),
  350.50::numeric,
  'the opening unit cost is stored'
);

select public.throws_ok(
  $$ select public.create_product('غطاء مرآة M3.1', null, null, null, 'قطعة', '22800001230001') $$,
  'P0001',
  null,
  'a duplicate barcode is rejected'
);

select public.throws_ok(
  $$ select public.create_product('غامض', null, null, null, 'قطعة', null, null, null, 'weighted_avg', null) $$,
  '22023',
  null,
  'an unknown valuation method is rejected'
);

select public.throws_ok(
  $$ select public.create_product('ن', null, null, null, null, null, null, -5) $$,
  '22023',
  null,
  'a negative unit cost is rejected'
);

select public.throws_ok(
  $$ select public.create_product('في', null, null, null, 'قطعة', '22800001230099', null, null, null, 1000000000) $$,
  '22023',
  null,
  'an absurd reorder level is rejected'
);

select public.lives_ok(
  $$ select public.create_product('زيت موتور M3.1', null, null, null, 'لتر', null, null, 95, 'fifo', 20) $$,
  'a second product without barcode is created'
);

select public.lives_ok(
  $$ select public.update_product(
    (select id from public.products where code = 'PRD-0101'),
    'زيت موتور M3.1 دوم',
    null, null, null, 'لتر', '22800001230002', null, 110, 'fifo', 25
  ) $$,
  'the product update rewrites its data'
);

select public.is(
  (select barcode from public.products where code = 'PRD-0101'),
  '22800001230002',
  'the updated barcode persists'
);

select public.throws_ok(
  format('select public.update_product(gen_random_uuid(), %L)', 'متصور'),
  'P0001',
  null,
  'updating a missing product is rejected'
);

select public.is(
  (select status from public.set_product_status(
    (select id from public.products where code = 'PRD-0101'), 'inactive')),
  'inactive',
  'the product status flips to inactive'
);

select public.is(
  (select count(*) from public.list_products('active')),
  1::bigint,
  'active listing excludes the inactive product'
);

select public.is(
  (select status from public.set_product_status(
    (select id from public.products where code = 'PRD-0101'), 'archived')),
  'archived',
  'inventory role archives the product'
);

-- ---------------------------------------------------------------------------
-- Section 3: user C (no roles) is locked out.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000307","role":"authenticated"}', true);

select public.throws_ok(
  $$ select public.create_product('متجسس', null, null, null, null, null, null, null, null, null) $$,
  '42501',
  null,
  'C cannot create products'
);

select public.is(
  coalesce((select count(*) from public.products), 0),
  0::bigint,
  'C sees zero products through RLS'
);

select public.is(
  coalesce((select count(*) from public.product_categories), 0),
  0::bigint,
  'C sees zero categories through RLS'
);

select public.finish();
rollback;
