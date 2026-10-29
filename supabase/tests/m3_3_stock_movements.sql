-- M3.3 — Stock movements ledger (pgTAP).
-- Self-contained fixtures + rollback. Fixed UUIDs keep asserts independent.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Branches + fixture users:
--   A (310): sales+inventory, member of TST-33 and TST-34
--   D (311): inventory only, member of TST-33
--   C (312): no roles
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, is_active)
values
  ('b0000000-0000-4000-8000-000000000033', 'TST-33', 'فرع حركات أ', true),
  ('b0000000-0000-4000-8000-000000000034', 'TST-34', 'فرع حركات ب', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values
  ('m3.3.a.tst@example.com', now() + interval '15 minutes'),
  ('m3.3.d.tst@example.com', now() + interval '15 minutes'),
  ('m3.3.c.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000310', 'authenticated', 'authenticated', 'm3.3.a.tst@example.com', now(), '{"full_name":"حركات A"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000311', 'authenticated', 'authenticated', 'm3.3.d.tst@example.com', now(), '{"full_name":"حركات D"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000312', 'authenticated', 'authenticated', 'm3.3.c.tst@example.com', now(), '{"full_name":"حركات C"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values
  ('00000000-0000-4000-8000-000000000310', 'حركات A', '+201000000320', 'sales', 'b0000000-0000-4000-8000-000000000033', true),
  ('00000000-0000-4000-8000-000000000311', 'حركات D', '+201000000321', 'inventory', 'b0000000-0000-4000-8000-000000000033', true),
  ('00000000-0000-4000-8000-000000000312', 'حركات C', '+201000000322', 'viewer', 'b0000000-0000-4000-8000-000000000033', true)
on conflict (id) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    branch_id = excluded.branch_id,
    is_active = excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
select u.id::uuid, b.id, u.is_default
from (values
  ('00000000-0000-4000-8000-000000000310', 'b0000000-0000-4000-8000-000000000033', true),
  ('00000000-0000-4000-8000-000000000310', 'b0000000-0000-4000-8000-000000000034', false),
  ('00000000-0000-4000-8000-000000000311', 'b0000000-0000-4000-8000-000000000033', true),
  ('00000000-0000-4000-8000-000000000312', 'b0000000-0000-4000-8000-000000000033', true)
) as u(id, branch, is_default)
join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select u.id::uuid, r.id, b.id, (u.role_code = 'sales')
from (values
  ('00000000-0000-4000-8000-000000000310', 'sales'),
  ('00000000-0000-4000-8000-000000000310', 'inventory'),
  ('00000000-0000-4000-8000-000000000311', 'inventory')
) as u(id, role_code)
join public.roles as r on r.code = u.role_code
join public.branches as b on b.code = 'TST-33'
on conflict do nothing;

-- Clean previous leftovers.
delete from public.stock_movements
where product_id in (select id from public.products where code = 'PRD-0300');
delete from public.stock_movements
where vehicle_id in (select id from public.vehicles where chassis_no = 'M33CH00000001');
delete from public.product_stock
where product_id in (select id from public.products where code = 'PRD-0300');
delete from public.products where code = 'PRD-0300';
delete from public.vehicles where chassis_no = 'M33CH00000001';

alter table public.products disable trigger audit_products_change;
alter table public.stock_movements disable trigger audit_stock_movements_change;
update public.code_sequences set next_number = 300 where entity = 'product';
update public.code_sequences set next_number = 300 where entity = 'vehicle';
alter table public.products enable trigger audit_products_change;
alter table public.stock_movements enable trigger audit_stock_movements_change;

select public.no_plan();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000310","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Section 1: product movements and valuation.
-- ---------------------------------------------------------------------------

select public.is(
  (select code from public.create_product('منتج حركات M3.3', null, null, null, 'قطعة')),
  'PRD-0300',
  'the fixture product is numbered'
);

select public.is(
  set_config(
    'm33.product_id',
    (select id from public.products where code = 'PRD-0300')::text,
    false
  ) is not null,
  true,
  'the fixture product id is captured for the locked-out sections'
);

select public.is(
  (select quantity from public.record_stock_movement(
    'purchase', 10,
    (select id from public.products where code = 'PRD-0300'),
    null, 100, 'b0000000-0000-4000-8000-000000000033'
  )),
  10::numeric,
  'a purchase records the signed quantity'
);

select public.is(
  (select stock_qty from public.products where code = 'PRD-0300'),
  10::numeric,
  'the product total mirrors the movement'
);

select public.is(
  (select unit_cost from public.products where code = 'PRD-0300'),
  100::numeric,
  'the first purchase sets the unit cost'
);

select public.is(
  (select quantity from public.product_stock
   where product_id = (select id from public.products where code = 'PRD-0300')
     and branch_id = 'b0000000-0000-4000-8000-000000000033'),
  10::numeric,
  'the branch balance receives the purchase'
);

select public.lives_ok(
  format(
    'select public.record_stock_movement(%L, %s, %L, null, %s, %L)',
    'purchase', 10,
    (select id from public.products where code = 'PRD-0300')::text,
    120,
    'b0000000-0000-4000-8000-000000000033'
  ),
  'a second purchase is recorded'
);

select public.is(
  (select unit_cost from public.products where code = 'PRD-0300'),
  110::numeric,
  'a second purchase re-averages the AVCO cost'
);

select public.is(
  (select stock_qty from public.products where code = 'PRD-0300'),
  20::numeric,
  'the total grows to twenty units'
);

select public.is(
  (select quantity from public.record_stock_movement(
    'sale', -5,
    (select id from public.products where code = 'PRD-0300'),
    null, 0, 'b0000000-0000-4000-8000-000000000033'
  )),
  -5::numeric,
  'a sale is a negative movement'
);

select public.is(
  (select unit_cost from public.products where code = 'PRD-0300'),
  110::numeric,
  'a sale does not change the average cost'
);

select public.throws_ok(
  format(
    'select public.record_stock_movement(%L, %s, %L, null, 0, %L)',
    'sale', -100,
    (select id from public.products where code = 'PRD-0300')::text,
    'b0000000-0000-4000-8000-000000000033'
  ),
  'P0001',
  null,
  'selling more than the balance is rejected'
);

select public.is(
  (select stock_qty from public.products where code = 'PRD-0300'),
  15::numeric,
  'the rejected sale left the balance untouched'
);

select public.throws_ok(
  format(
    'select public.record_stock_movement(%L, %s, %L, null, 0, %L)',
    'purchase', -5,
    (select id from public.products where code = 'PRD-0300')::text,
    'b0000000-0000-4000-8000-000000000033'
  ),
  '22023',
  null,
  'a purchase with a negative quantity is rejected'
);

select public.throws_ok(
  format(
    'select public.record_stock_movement(%L, %s, %L, null, 0, %L)',
    'purchase', 0,
    (select id from public.products where code = 'PRD-0300')::text,
    'b0000000-0000-4000-8000-000000000033'
  ),
  '22023',
  null,
  'a zero movement is rejected'
);

select public.is(
  (select quantity from public.record_stock_movement(
    'adjustment', -2,
    (select id from public.products where code = 'PRD-0300'),
    null, 0, 'b0000000-0000-4000-8000-000000000033', 'manual', null, 'تسوية'
  )),
  -2::numeric,
  'an adjustment may go either way'
);

-- ---------------------------------------------------------------------------
-- Section 2: transfers stay balanced per branch.
-- ---------------------------------------------------------------------------

select public.is(
  (select quantity from public.record_stock_movement(
    'transfer_out', -3,
    (select id from public.products where code = 'PRD-0300'),
    null, 0, 'b0000000-0000-4000-8000-000000000033'
  )),
  -3::numeric,
  'the source branch issues a transfer-out'
);

select public.is(
  (select quantity from public.record_stock_movement(
    'transfer_in', 3,
    (select id from public.products where code = 'PRD-0300'),
    null, 0, 'b0000000-0000-4000-8000-000000000034'
  )),
  3::numeric,
  'the destination branch receives a transfer-in'
);

select public.is(
  (select quantity from public.product_stock
   where product_id = (select id from public.products where code = 'PRD-0300')
     and branch_id = 'b0000000-0000-4000-8000-000000000033'),
  10::numeric,
  'the source branch keeps the correct remainder'
);

select public.is(
  (select quantity from public.product_stock
   where product_id = (select id from public.products where code = 'PRD-0300')
     and branch_id = 'b0000000-0000-4000-8000-000000000034'),
  3::numeric,
  'the destination branch holds the transferred units'
);

select public.is(
  (select stock_qty from public.products where code = 'PRD-0300'),
  13::numeric,
  'the company total is neither doubled nor lost by the transfer'
);

select public.is(
  (select sum(quantity) from public.list_product_stock('b0000000-0000-4000-8000-000000000033')),
  10::numeric,
  'the branch snapshot matches the ledger'
);

select public.is(
  (select count(*) from public.stock_movements
   where product_id = (select id from public.products where code = 'PRD-0300')),
  6::bigint,
  'every product movement is recorded once'
);

select public.is(
  (select count(*) from public.list_stock_movements(
    (select id from public.products where code = 'PRD-0300'), null, 'sale')),
  1::bigint,
  'the ledger filters by movement type'
);

select public.is(
  (select sum(quantity) from public.stock_movements
   where product_id = (select id from public.products where code = 'PRD-0300')
     and branch_id = 'b0000000-0000-4000-8000-000000000033'),
  10::numeric,
  'the source branch ledger sums to its balance'
);

-- ---------------------------------------------------------------------------
-- Section 3: vehicle serial movements.
-- ---------------------------------------------------------------------------

select public.is(
  (select code from public.create_vehicle(
    'M33CH00000001', 'M33EN00000001', 'motorcycle', null, null, null,
    null, null, null, null, 30000, 500, 200,
    null, null, 'b0000000-0000-4000-8000-000000000033'
  )),
  'VEH-0300',
  'the fixture vehicle is numbered'
);

select public.is(
  (select quantity from public.record_stock_movement(
    'purchase', 1, null,
    (select id from public.vehicles where code = 'VEH-0300'),
    30000, 'b0000000-0000-4000-8000-000000000033'
  )),
  1::numeric,
  'a vehicle purchase records a single serial movement'
);

select public.throws_ok(
  format(
    'select public.record_stock_movement(%L, %s, null, %L, 0, %L)',
    'purchase', 2,
    (select id from public.vehicles where code = 'VEH-0300')::text,
    'b0000000-0000-4000-8000-000000000033'
  ),
  '22023',
  null,
  'a vehicle cannot move more than one unit at a time'
);

select public.throws_ok(
  format(
    'select public.record_stock_movement(%L, %s, null, %L, 0, %L)',
    'purchase', 1,
    (select id from public.vehicles where code = 'VEH-0300')::text,
    'b0000000-0000-4000-8000-000000000034'
  ),
  'P0001',
  null,
  'a vehicle movement in another branch is rejected'
);

select public.is(
  (select count(*) from public.list_stock_movements(
    null, (select id from public.vehicles where code = 'VEH-0300'))),
  1::bigint,
  'the vehicle ledger is filterable by vehicle'
);

-- ---------------------------------------------------------------------------
-- Section 4: RLS scoping (user D sees only their branch).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000311","role":"authenticated"}', true);

select public.is(
  (select count(*) from public.list_stock_movements(null, null, 'transfer_in')),
  0::bigint,
  'a branch-scoped user cannot read the other branch transfer'
);

select public.is(
  (select count(*) from public.list_stock_movements()),
  6::bigint,
  'the branch-scoped user sees only their own movements'
);

select public.throws_ok(
  format(
    'select public.record_stock_movement(%L, %s, %L, null, 0, %L)',
    'purchase', 1,
    (select id from public.products where code = 'PRD-0300')::text,
    'b0000000-0000-4000-8000-000000000034'
  ),
  '42501',
  null,
  'a branch-scoped user cannot post into another branch'
);

-- ---------------------------------------------------------------------------
-- Section 5: user C (no roles) is locked out.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000312","role":"authenticated"}', true);

select public.throws_ok(
  format(
    'select public.record_stock_movement(%L, %s, %L, null, 0, %L)',
    'purchase', 1,
    current_setting('m33.product_id'),
    'b0000000-0000-4000-8000-000000000033'
  ),
  '42501',
  null,
  'C cannot post stock movements'
);

select public.throws_ok(
  $$ select public.list_stock_movements() $$,
  '42501',
  null,
  'C cannot read the ledger'
);

select public.is(
  coalesce((select count(*) from public.stock_movements), 0),
  0::bigint,
  'C sees zero movement rows through RLS'
);

select public.finish();
rollback;
