-- M3.2 — Vehicles and serial data (pgTAP).
-- Self-contained fixtures + rollback. Fixed UUIDs keep asserts independent.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Branch + fixture users:
--   A (308): sales+inventory => vehicles.view/create/update/archive
--   C (309): no roles        => nothing
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, is_active)
values
  ('b0000000-0000-4000-8000-000000000032', 'TST-32', 'فرع اختبار M3.2', true),
  ('b0000000-0000-4000-8000-000000000099', 'TST-99', 'فرع آخر', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values
  ('m3.2.a.tst@example.com', now() + interval '15 minutes'),
  ('m3.2.c.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000308', 'authenticated', 'authenticated', 'm3.2.a.tst@example.com', now(), '{"full_name":"مركبات A"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000309', 'authenticated', 'authenticated', 'm3.2.c.tst@example.com', now(), '{"full_name":"مركبات C"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values
  ('00000000-0000-4000-8000-000000000308', 'مركبات A', '+201000000318', 'sales', 'b0000000-0000-4000-8000-000000000032', true),
  ('00000000-0000-4000-8000-000000000309', 'مركبات C', '+201000000319', 'viewer', 'b0000000-0000-4000-8000-000000000032', true)
on conflict (id) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    branch_id = excluded.branch_id,
    is_active = excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
select u.id::uuid, b.id, true
from (values
  ('00000000-0000-4000-8000-000000000308', 'b0000000-0000-4000-8000-000000000032'),
  ('00000000-0000-4000-8000-000000000309', 'b0000000-0000-4000-8000-000000000032')
) as u(id, branch)
join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select u.id::uuid, r.id, b.id, (u.role_code = 'sales')
from (values
  ('00000000-0000-4000-8000-000000000308', 'sales'),
  ('00000000-0000-4000-8000-000000000308', 'inventory')
) as u(id, role_code)
join public.roles as r on r.code = u.role_code
join public.branches as b on b.code = 'TST-32'
on conflict do nothing;

-- Shared catalog fixtures.
delete from public.vehicles where chassis_no in ('M32CH00000001', 'M32CH00000002', 'M32CH00000003');
delete from public.product_models where name = 'موديل M3.2';
delete from public.product_brands where name = 'ماركة M3.2';

insert into public.product_brands (name) values ('ماركة M3.2');
insert into public.product_models (brand_id, name)
values ((select id from public.product_brands where name = 'ماركة M3.2'), 'موديل M3.2');

-- Supplier in branch for supplier FK.
delete from public.suppliers where full_name = 'مورد M3.2 vehicle';
insert into public.suppliers (code, full_name, contact_name, phone, phone2, tax_number,
  address, notes, branch_id, created_by, updated_by)
values ('SUP-5320', 'مورد M3.2 vehicle', null, '01098765432', null, null, null, null,
  'b0000000-0000-4000-8000-000000000032', null, null);

alter table public.vehicles disable trigger audit_vehicles_change;
update public.code_sequences set next_number = 200 where entity = 'vehicle';
alter table public.vehicles enable trigger audit_vehicles_change;

select public.no_plan();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000308","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Section 1: create vehicles.
-- ---------------------------------------------------------------------------

select public.is(
  (select code from public.create_vehicle(
    'M32CH00000001', 'M32EN00000001', 'motorcycle', 'سLex', 
    (select id from public.product_brands where name = 'ماركة M3.2'),
    (select id from public.product_models where name = 'موديل M3.2'),
    2024, 'أحمر',
    (select id from public.suppliers where full_name = 'مورد M3.2 vehicle'),
    date '2026-10-01', 42000, 800, 450
  )),
  'VEH-0200',
  'the vehicle takes the next atomic VEH code'
);

select public.is(
  (select approved_cost from public.vehicles where code = 'VEH-0200'),
  (42000 + 800 + 450)::numeric,
  'the approved cost defaults to purchase + direct costs'
);

select public.throws_ok(
  $$ select public.create_vehicle('M32CH00000001', 'M32EN00000009') $$,
  'P0001',
  null,
  'a duplicate chassis number is rejected'
);

select public.throws_ok(
  $$ select public.create_vehicle('M32CH00000009', 'M32EN00000001') $$,
  'P0001',
  null,
  'a duplicate engine number is rejected'
);

select public.throws_ok(
  $$ select public.create_vehicle('M32CH00000008', 'M32EN00000008', 'boat') $$,
  '22023',
  null,
  'an unknown vehicle type is rejected'
);

select public.throws_ok(
  format('select public.create_vehicle(%L, %L)', 'ش', 'م'),
  '22023',
  null,
  'serial numbers shorter than 3 characters are rejected'
);

select public.throws_ok(
  $$ select public.create_vehicle('M32CH00000007', 'M32EN00000007', 'motorcycle', null, null, null,
    null, null, null, null, -3) $$,
  '22023',
  null,
  'a negative purchase price is rejected'
);

select public.throws_ok(
  $$ select public.create_vehicle('M32CH00000006', 'M32EN00000006', 'motorcycle', null, null, null,
    null, null, null, null, null, null, null, null, null, 'b0000000-0000-4000-8000-000000000099') $$,
  '42501',
  null,
  'creating a vehicle in another branch is rejected'
);

select public.is(
  (select code from public.create_vehicle(
    'M32CH00000002', 'M32EN00000002', 'motorcycle', 'Logistics',
    (select id from public.product_brands where name = 'ماركة M3.2'),
    (select id from public.product_models where name = 'موديل M3.2'),
    2025, 'رمادي', null, date '2026-10-05', 51000, 0, 0
  )),
  'VEH-0201',
  'a second vehicle is created'
);

-- ---------------------------------------------------------------------------
-- Section 2: transitions.
-- ---------------------------------------------------------------------------

select public.is(
  (select status from public.set_vehicle_status(
    (select id from public.vehicles where code = 'VEH-0200'), 'reserved')),
  'reserved',
  'an available vehicle can be reserved'
);

select public.is(
  (select status from public.set_vehicle_status(
    (select id from public.vehicles where code = 'VEH-0200'), 'sold')),
  'sold',
  'a reserved vehicle can be sold'
);

select public.throws_ok(
  $$ select public.set_vehicle_status(
    (select id from public.vehicles where code = 'VEH-0200'), 'reserved') $$,
  '22023',
  null,
  'a sold vehicle cannot be reserved again'
);

select public.throws_ok(
  $$ select public.set_vehicle_status(
    (select id from public.vehicles where code = 'VEH-0200'), 'sold') $$,
  '22023',
  null,
  'a sold vehicle cannot be sold twice'
);

select public.throws_ok(
  $$ select public.set_vehicle_status(
    (select id from public.vehicles where code = 'VEH-0200'), 'available') $$,
  '22023',
  null,
  'a sold vehicle is not directly re-available except by return'
);

select public.is(
  (select status from public.set_vehicle_status(
    (select id from public.vehicles where code = 'VEH-0200'), 'returned')),
  'returned',
  'a sold vehicle can go to returned, and only there'
);

select public.is(
  (select status from public.set_vehicle_status(
    (select id from public.vehicles where code = 'VEH-0200'), 'available')),
  'available',
  'a returned vehicle becomes available again'
);

select public.lives_ok(
  $$ select public.update_vehicle(
    (select id from public.vehicles where code = 'VEH-0200'),
    'motorcycle', 'F-Class', null, null, 2024, 'أزرق', null, date '2026-10-02', 55000) $$,
  'a non-sold vehicle accepts data updates'
);

select public.is(
  (select suggested_price from public.vehicles where code = 'VEH-0200'),
  55000::numeric,
  'the suggested price update persists'
);

select public.throws_ok(
  format('select public.set_vehicle_status(gen_random_uuid(), %L)', 'available'),
  'P0001',
  null,
  'updating a missing vehicle status is rejected'
);

select public.is(
  (select status from public.set_vehicle_status(
    (select id from public.vehicles where code = 'VEH-0201'), 'maintenance')),
  'maintenance',
  'the vehicle goes into maintenance'
);

select public.throws_ok(
  format('select public.set_vehicle_status((select id from public.vehicles where code = %L), %L)',
         'VEH-0201', 'sold'),
  '22023',
  null,
  'a maintenance vehicle cannot jump directly to sold'
);

select public.is(
  (select status from public.set_vehicle_status(
    (select id from public.vehicles where code = 'VEH-0201'), 'damaged')),
  'damaged',
  'a maintenance vehicle can be flagged damaged'
);

select public.is(
  (select count(*) from public.list_vehicles('all')),
  2::bigint,
  'the all listing shows both vehicles'
);

select public.is(
  (select count(*) from public.list_vehicles('active')),
  2::bigint,
  'the active listing includes available and damaged vehicles'
);

select public.is(
  (select code from public.list_vehicles('reserved')),
  null,
  'no vehicle is reserved after the flow'
);

select public.is(
  (select color from public.list_vehicles('all', 'M32CH00000001')),
  'أزرق',
  'the search finds the vehicle by chassis'
);

select public.ok(
  public.has_permission('vehicles.archive'),
  'inventory holds the archive permission'
);

-- ---------------------------------------------------------------------------
-- Section 3: user C (no roles) is locked out.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000309","role":"authenticated"}', true);

select public.throws_ok(
  $$ select public.create_vehicle('M32CH00000005', 'M32EN00000005') $$,
  '42501',
  null,
  'C cannot create vehicles'
);

select public.is(
  coalesce((select count(*) from public.vehicles), 0),
  0::bigint,
  'C sees zero vehicles through RLS'
);

select public.finish();
rollback;
