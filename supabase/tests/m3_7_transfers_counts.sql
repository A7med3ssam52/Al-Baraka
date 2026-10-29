-- M3.7 — Branch transfers and stock counts (pgTAP).
-- Self-contained fixtures + rollback. Fixed UUIDs keep asserts independent.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Branches + fixture users:
--   322 inventory => products.update + counts.create (not counts.approve)
--   323 manager   => everything
--   324 no roles  => nothing
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, is_active)
values
  ('b0000000-0000-4000-8000-000000000038', 'TST-38', 'فرع تحويل M3.7', true),
  ('b0000000-0000-4000-8000-000000000039', 'TST-39', 'فرع استلام M3.7', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values
  ('m3.7.a.tst@example.com', now() + interval '15 minutes'),
  ('m3.7.m.tst@example.com', now() + interval '15 minutes'),
  ('m3.7.c.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000322', 'authenticated', 'authenticated', 'm3.7.a.tst@example.com', now(), '{"full_name":"تحويل A"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000323', 'authenticated', 'authenticated', 'm3.7.m.tst@example.com', now(), '{"full_name":"تحويل M"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000324', 'authenticated', 'authenticated', 'm3.7.c.tst@example.com', now(), '{"full_name":"تحويل C"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values
  ('00000000-0000-4000-8000-000000000322', 'تحويل A', '+201000000360', 'inventory', 'b0000000-0000-4000-8000-000000000038', true),
  ('00000000-0000-4000-8000-000000000323', 'تحويل M', '+201000000361', 'manager', 'b0000000-0000-4000-8000-000000000038', true),
  ('00000000-0000-4000-8000-000000000324', 'تحويل C', '+201000000362', 'viewer', 'b0000000-0000-4000-8000-000000000038', true)
on conflict (id) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    branch_id = excluded.branch_id,
    is_active = excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
select u.id::uuid, b.id, u.is_default
from (values
  ('00000000-0000-4000-8000-000000000322', 'b0000000-0000-4000-8000-000000000038', true),
  ('00000000-0000-4000-8000-000000000322', 'b0000000-0000-4000-8000-000000000039', false),
  ('00000000-0000-4000-8000-000000000323', 'b0000000-0000-4000-8000-000000000038', true),
  ('00000000-0000-4000-8000-000000000323', 'b0000000-0000-4000-8000-000000000039', false),
  ('00000000-0000-4000-8000-000000000324', 'b0000000-0000-4000-8000-000000000038', true)
) as u(id, branch, is_default)
join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select u.id::uuid, r.id, b.id, (u.branch = 'b0000000-0000-4000-8000-000000000038')
from (values
  ('00000000-0000-4000-8000-000000000322', 'inventory', 'b0000000-0000-4000-8000-000000000038'),
  ('00000000-0000-4000-8000-000000000322', 'inventory', 'b0000000-0000-4000-8000-000000000039'),
  ('00000000-0000-4000-8000-000000000323', 'manager', 'b0000000-0000-4000-8000-000000000038'),
  ('00000000-0000-4000-8000-000000000323', 'manager', 'b0000000-0000-4000-8000-000000000039')
) as u(id, role_code, branch)
join public.roles as r on r.code = u.role_code
join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Clean leftovers + fixtures.
-- ---------------------------------------------------------------------------

delete from public.stock_count_items
where count_id in (
  select id from public.stock_counts
  where branch_id in ('b0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000039')
);
delete from public.stock_counts
where branch_id in ('b0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000039');
delete from public.stock_transfer_items
where transfer_id in (
  select id from public.stock_transfers
  where from_branch_id in ('b0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000039')
     or to_branch_id in ('b0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000039')
);
delete from public.stock_transfers
where from_branch_id in ('b0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000039')
   or to_branch_id in ('b0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000039');
delete from public.stock_movements
where product_id in (select id from public.products where code = 'PRD-0800')
   or vehicle_id in (select id from public.vehicles where chassis_no = 'M37CH00000001');
delete from public.product_stock
where product_id in (select id from public.products where code = 'PRD-0800');
delete from public.vehicles where chassis_no = 'M37CH00000001';
delete from public.products where code = 'PRD-0800';

alter table public.products disable trigger audit_products_change;
alter table public.vehicles disable trigger audit_vehicles_change;
update public.code_sequences set next_number = 800
where entity in ('product', 'vehicle', 'stock_transfer', 'stock_count');
alter table public.products enable trigger audit_products_change;
alter table public.vehicles enable trigger audit_vehicles_change;

select public.no_plan();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000322","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Section 1: fixtures with stock at the source branch.
-- ---------------------------------------------------------------------------

select public.is(
  (select code from public.create_product('منتج تحويل M3.7', null, null, null, 'قطعة')),
  'PRD-0800',
  'the fixture product is numbered'
);

select public.is(
  (select code from public.create_vehicle(
    'M37CH00000001', 'M37EN00000001', 'motorcycle', null, null, null,
    null, null, null, null, 30000, 0, 0, null, 36000,
    'b0000000-0000-4000-8000-000000000038'
  )),
  'VEH-0800',
  'the fixture vehicle is numbered'
);

select public.is(
  set_config(
    'm37.product_id',
    (select id from public.products where code = 'PRD-0800')::text,
    false
  ) is not null,
  true,
  'the product id is captured'
);

select public.lives_ok(
  format(
    'select public.record_stock_movement(%L, %s, %L, null, %s, %L)',
    'purchase', 20,
    current_setting('m37.product_id'),
    100,
    'b0000000-0000-4000-8000-000000000038'
  ),
  'the source branch receives twenty units'
);

select public.is(
  (select quantity from public.product_stock
   where product_id = current_setting('m37.product_id')::uuid
     and branch_id = 'b0000000-0000-4000-8000-000000000038'),
  20::numeric,
  'the source balance starts at twenty'
);

-- ---------------------------------------------------------------------------
-- Section 2: draft transfer does not move stock.
-- ---------------------------------------------------------------------------

select public.is(
  (select number from public.create_stock_transfer(
    'b0000000-0000-4000-8000-000000000038',
    'b0000000-0000-4000-8000-000000000039',
    jsonb_build_array(
      jsonb_build_object('product_id', current_setting('m37.product_id')::uuid, 'quantity', 5),
      jsonb_build_object(
        'vehicle_id', (select id from public.vehicles where code = 'VEH-0800'),
        'quantity', 1
      )
    ),
    date '2026-10-27', 'تحويل اختبار'
  )),
  'TRF-0800',
  'the transfer takes the next TRF number'
);

select public.is(
  (select status from public.stock_transfers where number = 'TRF-0800'),
  'draft',
  'a new transfer starts as a draft'
);

select public.is(
  (select quantity from public.product_stock
   where product_id = current_setting('m37.product_id')::uuid
     and branch_id = 'b0000000-0000-4000-8000-000000000038'),
  20::numeric,
  'a draft transfer keeps the source stock untouched'
);

select public.is(
  (select quantity from public.product_stock
   where product_id = current_setting('m37.product_id')::uuid
     and branch_id = 'b0000000-0000-4000-8000-000000000039'),
  null::numeric,
  'the destination has no balance yet'
);

-- ---------------------------------------------------------------------------
-- Section 3: sending moves stock out of the source exactly once.
-- ---------------------------------------------------------------------------

select public.is(
  (select status from public.send_stock_transfer(
    (select id from public.stock_transfers where number = 'TRF-0800')
  )),
  'in_transit',
  'sending puts the transfer in transit'
);

select public.is(
  (select quantity from public.product_stock
   where product_id = current_setting('m37.product_id')::uuid
     and branch_id = 'b0000000-0000-4000-8000-000000000038'),
  15::numeric,
  'sending removes the transferred quantity'
);

select public.is(
  (select stock_qty from public.products where code = 'PRD-0800'),
  15::numeric,
  'the in-transit quantity leaves the company total until receipt'
);

select public.is(
  (select count(*) from public.stock_movements
   where reference_type = 'stock_transfer'
     and reference_id = (select id from public.stock_transfers where number = 'TRF-0800')
     and movement_type = 'transfer_out'),
  2::bigint,
  'each line posts a single transfer-out'
);

select public.throws_ok(
  format(
    'select public.send_stock_transfer(%L)',
    (select id from public.stock_transfers where number = 'TRF-0800')
  ),
  'P0001',
  null,
  'a transfer cannot be sent twice'
);

-- ---------------------------------------------------------------------------
-- Section 4: receipt restores the destination balance without duplication.
-- ---------------------------------------------------------------------------

select public.is(
  (select status from public.receive_stock_transfer(
    (select id from public.stock_transfers where number = 'TRF-0800')
  )),
  'received',
  'receiving closes the transfer'
);

select public.is(
  (select quantity from public.product_stock
   where product_id = current_setting('m37.product_id')::uuid
     and branch_id = 'b0000000-0000-4000-8000-000000000039'),
  5::numeric,
  'the destination receives the transferred quantity'
);

select public.is(
  (select stock_qty from public.products where code = 'PRD-0800'),
  20::numeric,
  'the company total is neither doubled nor lost'
);

select public.is(
  (select branch_id from public.vehicles where code = 'VEH-0800'),
  'b0000000-0000-4000-8000-000000000039'::uuid,
  'the received vehicle belongs to the destination branch'
);

select public.is(
  (select count(*) from public.stock_movements
   where reference_type = 'stock_transfer'
     and reference_id = (select id from public.stock_transfers where number = 'TRF-0800')
     and movement_type = 'transfer_in'),
  2::bigint,
  'each line posts a single transfer-in'
);

select public.throws_ok(
  format(
    'select public.receive_stock_transfer(%L)',
    (select id from public.stock_transfers where number = 'TRF-0800')
  ),
  'P0001',
  null,
  'a transfer cannot be received twice'
);

select public.is(
  (select item_count from public.list_stock_transfers('received')),
  2::integer,
  'the list reports the item count'
);

select public.is(
  (select (public.get_stock_transfer(
    (select id from public.stock_transfers where number = 'TRF-0800')
  ) #>> '{transfer,from_branch_name}')),
  'فرع تحويل M3.7',
  'the detail resolves the source branch'
);

-- ---------------------------------------------------------------------------
-- Section 5: validation guards.
-- ---------------------------------------------------------------------------

select public.throws_ok(
  format(
    'select public.create_stock_transfer(%L, %L, %L::jsonb)',
    'b0000000-0000-4000-8000-000000000038',
    'b0000000-0000-4000-8000-000000000038',
    jsonb_build_array(jsonb_build_object(
      'product_id', current_setting('m37.product_id')::uuid, 'quantity', 1
    ))
  ),
  '22023',
  null,
  'a transfer between the same branch is rejected'
);

select public.is(
  (select number from public.create_stock_transfer(
    'b0000000-0000-4000-8000-000000000038',
    'b0000000-0000-4000-8000-000000000039',
    jsonb_build_array(jsonb_build_object(
      'product_id', current_setting('m37.product_id')::uuid, 'quantity', 100
    )),
    date '2026-10-27'
  )),
  'TRF-0801',
  'a transfer larger than the balance can still be drafted'
);

select public.throws_ok(
  format(
    'select public.send_stock_transfer(%L)',
    (select id from public.stock_transfers where number = 'TRF-0801')
  ),
  'P0001',
  null,
  'sending more than the balance fails'
);

select public.is(
  (select status from public.stock_transfers where number = 'TRF-0801'),
  'draft',
  'the failed send leaves the transfer as a draft'
);

select public.is(
  (select quantity from public.product_stock
   where product_id = current_setting('m37.product_id')::uuid
     and branch_id = 'b0000000-0000-4000-8000-000000000038'),
  15::numeric,
  'the failed send leaves the stock untouched'
);

select public.is(
  (select status from public.cancel_stock_transfer(
    (select id from public.stock_transfers where number = 'TRF-0801'), 'إلغاء اختباري'
  )),
  'cancelled',
  'a draft transfer can be cancelled'
);

select public.throws_ok(
  format(
    'select public.send_stock_transfer(%L)',
    (select id from public.stock_transfers where number = 'TRF-0801')
  ),
  'P0001',
  null,
  'a cancelled transfer cannot be sent'
);

-- ---------------------------------------------------------------------------
-- Section 6: counting keeps stock frozen until approval.
-- ---------------------------------------------------------------------------

select public.is(
  (select number from public.create_stock_count(
    array[current_setting('m37.product_id')::uuid],
    date '2026-10-27', 'جرد اختبار',
    'b0000000-0000-4000-8000-000000000038'
  )),
  'CNT-0800',
  'the count takes the next CNT number'
);

select public.is(
  (select system_qty from public.stock_count_items
   where count_id = (select id from public.stock_counts where number = 'CNT-0800')),
  15::numeric,
  'the count snapshots the system quantity'
);

select public.is(
  (select counted_qty from public.stock_count_items
   where count_id = (select id from public.stock_counts where number = 'CNT-0800')),
  15::numeric,
  'the counted quantity starts equal to the system'
);

select public.throws_ok(
  format(
    'select public.create_stock_count(%L::uuid[], current_date, null, %L)',
    array[current_setting('m37.product_id')::uuid],
    'b0000000-0000-4000-8000-000000000038'
  ),
  'P0001',
  null,
  'a second open count on the same branch is rejected'
);

select public.is(
  (select status from public.update_stock_count(
    (select id from public.stock_counts where number = 'CNT-0800'),
    jsonb_build_array(jsonb_build_object(
      'product_id', current_setting('m37.product_id')::uuid,
      'counted_qty', 12
    ))
  )),
  'draft',
  'the counted quantity is saved on the draft'
);

select public.is(
  (select difference from public.stock_count_items
   where count_id = (select id from public.stock_counts where number = 'CNT-0800')),
  -3::numeric,
  'the difference is counted minus system'
);

select public.is(
  (select stock_qty from public.products where code = 'PRD-0800'),
  20::numeric,
  'a draft count does not touch the stock'
);

select public.throws_ok(
  format(
    'select public.approve_stock_count(%L)',
    (select id from public.stock_counts where number = 'CNT-0800')
  ),
  '42501',
  null,
  'the inventory role cannot approve counts'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000323","role":"authenticated"}', true);

select public.is(
  (select status from public.approve_stock_count(
    (select id from public.stock_counts where number = 'CNT-0800')
  )),
  'approved',
  'the manager approves the count'
);

select public.is(
  (select stock_qty from public.products where code = 'PRD-0800'),
  17::numeric,
  'approval applies the difference to the company total'
);

select public.is(
  (select quantity from public.product_stock
   where product_id = current_setting('m37.product_id')::uuid
     and branch_id = 'b0000000-0000-4000-8000-000000000038'),
  12::numeric,
  'approval applies the difference to the branch balance'
);

select public.is(
  (select count(*) from public.stock_movements
   where reference_type = 'stock_count'
     and reference_id = (select id from public.stock_counts where number = 'CNT-0800')
     and movement_type = 'adjustment'),
  1::bigint,
  'approval writes one adjustment movement per differing line'
);

select public.throws_ok(
  format(
    'select public.update_stock_count(%L, %L::jsonb)',
    (select id from public.stock_counts where number = 'CNT-0800'),
    jsonb_build_array(jsonb_build_object(
      'product_id', current_setting('m37.product_id')::uuid, 'counted_qty', 1
    ))
  ),
  'P0001',
  null,
  'an approved count can no longer be edited'
);

select public.throws_ok(
  format(
    'select public.approve_stock_count(%L)',
    (select id from public.stock_counts where number = 'CNT-0800')
  ),
  'P0001',
  null,
  'an approved count cannot be approved twice'
);

select public.is(
  (select difference_count from public.list_stock_counts('approved')),
  1::integer,
  'the list reports the differing line count'
);

-- ---------------------------------------------------------------------------
-- Section 7: user C (no roles) is locked out.
-- ---------------------------------------------------------------------------

select public.is(
  set_config(
    'm37.transfer_id',
    (select id from public.stock_transfers where number = 'TRF-0800')::text,
    false
  ) is not null,
  true,
  'the transfer id is captured for the locked-out section'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000324","role":"authenticated"}', true);

select public.throws_ok(
  $$ select public.list_stock_transfers() $$,
  '42501',
  null,
  'C cannot list transfers'
);

select public.throws_ok(
  $$ select public.list_stock_counts() $$,
  '42501',
  null,
  'C cannot list counts'
);

select public.throws_ok(
  $$ select public.get_stock_transfer(current_setting('m37.transfer_id')::uuid) $$,
  '42501',
  null,
  'C cannot read a transfer detail'
);

select public.is(
  coalesce((select count(*) from public.stock_transfers), 0),
  0::bigint,
  'C sees zero transfers through RLS'
);

select public.is(
  coalesce((select count(*) from public.stock_counts), 0),
  0::bigint,
  'C sees zero counts through RLS'
);

select public.finish();
rollback;
