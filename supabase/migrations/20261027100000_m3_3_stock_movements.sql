-- M3.3 — Stock movements ledger.
--
-- Every change to quantitative stock goes through an immutable movement row.
-- Product balances are kept per branch in product_stock (so a transfer never
-- doubles or loses stock) while products.stock_qty mirrors the company total.
-- Signed quantities encode the direction: purchases/returns-in/transfers-in are
-- positive, sales/supplier-returns/transfers-out/damage are negative, and
-- adjustments/counts may go either way. Negative stock is rejected.

-- ---------------------------------------------------------------------------
-- 1. Per-branch product balances.
-- ---------------------------------------------------------------------------

create table if not exists public.product_stock (
  branch_id uuid not null references public.branches (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (branch_id, product_id)
);

create index if not exists product_stock_product_idx on public.product_stock (product_id);

alter table public.product_stock enable row level security;

drop policy if exists product_stock_select_authorized on public.product_stock;
create policy product_stock_select_authorized
on public.product_stock
for select
to authenticated
using (
  public.has_permission('products.view')
  and public.is_branch_member(branch_id)
);

revoke all on public.product_stock from authenticated, anon;
grant select on public.product_stock to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Movements ledger.
-- ---------------------------------------------------------------------------

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  product_id uuid references public.products (id) on delete restrict,
  vehicle_id uuid references public.vehicles (id) on delete restrict,
  movement_type text not null check (
    movement_type in (
      'opening', 'purchase', 'sale', 'return_in', 'return_out',
      'transfer_in', 'transfer_out', 'adjustment', 'count', 'damage'
    )
  ),
  quantity numeric(14, 2) not null check (quantity <> 0),
  unit_cost numeric(14, 2) not null default 0 check (unit_cost >= 0),
  reference_type text,
  reference_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  check (num_nonnulls(product_id, vehicle_id) = 1)
);

create index if not exists stock_movements_branch_idx
  on public.stock_movements (branch_id, created_at desc);
create index if not exists stock_movements_product_idx
  on public.stock_movements (product_id, created_at desc);
create index if not exists stock_movements_vehicle_idx
  on public.stock_movements (vehicle_id, created_at desc);
create index if not exists stock_movements_reference_idx
  on public.stock_movements (reference_type, reference_id);

alter table public.stock_movements enable row level security;

drop policy if exists stock_movements_select_authorized on public.stock_movements;
create policy stock_movements_select_authorized
on public.stock_movements
for select
to authenticated
using (
  public.has_permission('products.view')
  and public.is_branch_member(branch_id)
);

revoke all on public.stock_movements from authenticated, anon;
grant select on public.stock_movements to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Movement direction helper.
-- ---------------------------------------------------------------------------

create or replace function public.stock_movement_expected_sign(p_type text)
returns integer
language sql
immutable
as $$
  select case lower(btrim(coalesce(p_type, '')))
    when 'opening' then 1
    when 'purchase' then 1
    when 'return_in' then 1
    when 'transfer_in' then 1
    when 'sale' then -1
    when 'return_out' then -1
    when 'transfer_out' then -1
    when 'damage' then -1
    else 0
  end;
$$;

-- ---------------------------------------------------------------------------
-- 4. record_stock_movement.
-- ---------------------------------------------------------------------------

create or replace function public.record_stock_movement(
  p_movement_type text,
  p_quantity numeric,
  p_product_id uuid default null,
  p_vehicle_id uuid default null,
  p_unit_cost numeric default 0,
  p_branch_id uuid default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_notes text default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_type text := lower(btrim(coalesce(p_movement_type, '')));
  clean_quantity numeric := coalesce(p_quantity, 0);
  clean_cost numeric := coalesce(p_unit_cost, 0);
  expected_sign integer;
  target_branch uuid := coalesce(p_branch_id, public.current_branch());
  current_qty numeric := 0;
  current_cost numeric := 0;
  valuation text := 'avco';
  new_qty numeric := 0;
  new_cost numeric;
  target_vehicle public.vehicles;
  new_row public.stock_movements;
begin
  if clean_type not in (
    'opening', 'purchase', 'sale', 'return_in', 'return_out',
    'transfer_in', 'transfer_out', 'adjustment', 'count', 'damage'
  ) then
    raise exception 'invalid_movement_type' using errcode = '22023';
  end if;

  if clean_quantity = 0 then
    raise exception 'invalid_movement_quantity' using errcode = '22023';
  end if;

  if clean_cost < 0 then
    raise exception 'invalid_movement_quantity' using errcode = '22023';
  end if;

  expected_sign := public.stock_movement_expected_sign(clean_type);
  if expected_sign <> 0 and sign(clean_quantity) <> expected_sign then
    raise exception 'invalid_movement_sign' using errcode = '22023';
  end if;

  if num_nonnulls(p_product_id, p_vehicle_id) <> 1 then
    raise exception 'invalid_movement_target' using errcode = '22023';
  end if;

  if target_branch is null or not exists (
    select 1 from public.branches where id = target_branch and is_active
  ) then
    raise exception 'invalid_branch' using errcode = '22023';
  end if;

  if not public.is_branch_member(target_branch) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_product_id is not null then
    if not public.has_permission('products.update') then
      raise exception 'forbidden' using errcode = '42501';
    end if;

    select coalesce(stock.quantity, 0), product.unit_cost, product.valuation_method
    into current_qty, current_cost, valuation
    from public.products as product
    left join public.product_stock as stock
      on stock.product_id = product.id and stock.branch_id = target_branch
    where product.id = p_product_id;

    if not found then
      raise exception 'product_missing' using errcode = 'P0001';
    end if;

    new_qty := current_qty + clean_quantity;

    if new_qty < 0 then
      raise exception 'insufficient_stock' using errcode = 'P0001';
    end if;

    insert into public.product_stock as stock (branch_id, product_id, quantity)
    values (target_branch, p_product_id, clean_quantity)
    on conflict (branch_id, product_id) do update
    set quantity = stock.quantity + excluded.quantity,
        updated_at = now();

    if clean_quantity > 0 and clean_cost > 0 then
      if valuation = 'avco' and current_qty > 0 and new_qty > 0 then
        new_cost := round(
          ((current_qty * current_cost) + (clean_quantity * clean_cost)) / new_qty,
          2
        );
      else
        new_cost := clean_cost;
      end if;
    else
      new_cost := current_cost;
    end if;

    update public.products
    set stock_qty = (
          select coalesce(sum(stock.quantity), 0)
          from public.product_stock as stock
          where stock.product_id = p_product_id
        ),
        unit_cost = new_cost,
        updated_at = now(),
        updated_by = auth.uid()
    where products.id = p_product_id;
  else
    if not public.has_permission('vehicles.update') then
      raise exception 'forbidden' using errcode = '42501';
    end if;

    select * into target_vehicle
    from public.vehicles
    where vehicles.id = p_vehicle_id;

    if not found then
      raise exception 'vehicle_missing' using errcode = 'P0001';
    end if;

    if target_vehicle.branch_id <> target_branch then
      raise exception 'vehicle_branch_mismatch' using errcode = 'P0001';
    end if;

    if clean_quantity not in (-1, 1) then
      raise exception 'invalid_movement_quantity' using errcode = '22023';
    end if;
  end if;

  insert into public.stock_movements (
    branch_id, product_id, vehicle_id, movement_type, quantity, unit_cost,
    reference_type, reference_id, notes, created_by
  )
  values (
    target_branch, p_product_id, p_vehicle_id, clean_type, clean_quantity, clean_cost,
    nullif(btrim(coalesce(p_reference_type, '')), ''),
    p_reference_id,
    nullif(btrim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning * into new_row;

  return new_row;
end;
$$;

revoke all on function public.record_stock_movement(text, numeric, uuid, uuid, numeric, uuid, text, uuid, text)
  from public, anon;
grant execute on function public.record_stock_movement(text, numeric, uuid, uuid, numeric, uuid, text, uuid, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. list_stock_movements.
-- ---------------------------------------------------------------------------

create or replace function public.list_stock_movements(
  p_product_id uuid default null,
  p_vehicle_id uuid default null,
  p_movement_type text default null,
  p_from date default null,
  p_to date default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  branch_id uuid,
  branch_name text,
  product_id uuid,
  product_code text,
  product_name text,
  vehicle_id uuid,
  vehicle_code text,
  movement_type text,
  quantity numeric,
  unit_cost numeric,
  reference_type text,
  reference_id uuid,
  notes text,
  created_at timestamptz,
  created_by_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('products.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    movement.id,
    movement.branch_id,
    branch.name,
    movement.product_id,
    product.code,
    product.name,
    movement.vehicle_id,
    vehicle.code,
    movement.movement_type,
    movement.quantity,
    movement.unit_cost,
    movement.reference_type,
    movement.reference_id,
    movement.notes,
    movement.created_at,
    profile.full_name
  from public.stock_movements as movement
  join public.branches as branch on branch.id = movement.branch_id
  left join public.products as product on product.id = movement.product_id
  left join public.vehicles as vehicle on vehicle.id = movement.vehicle_id
  left join public.profiles as profile on profile.id = movement.created_by
  where public.is_branch_member(movement.branch_id)
    and (p_product_id is null or movement.product_id = p_product_id)
    and (p_vehicle_id is null or movement.vehicle_id = p_vehicle_id)
    and (
      p_movement_type is null
      or lower(btrim(p_movement_type)) = 'all'
      or movement.movement_type = lower(btrim(p_movement_type))
    )
    and (p_from is null or movement.created_at >= p_from::timestamptz)
    and (p_to is null or movement.created_at < (p_to::date + 1)::timestamptz)
  order by movement.created_at desc, movement.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_stock_movements(uuid, uuid, text, date, date, integer, integer)
  from public, anon;
grant execute on function public.list_stock_movements(uuid, uuid, text, date, date, integer, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Branch stock snapshot (feeds the inventory report in M3.8).
-- ---------------------------------------------------------------------------

create or replace function public.list_product_stock(
  p_branch_id uuid default null,
  p_search text default null
)
returns table (
  branch_id uuid,
  branch_name text,
  product_id uuid,
  product_code text,
  product_name text,
  unit_name text,
  quantity numeric,
  reorder_level numeric,
  unit_cost numeric,
  stock_value numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('products.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    stock.branch_id,
    branch.name,
    product.id,
    product.code,
    product.name,
    product.unit_name,
    stock.quantity,
    product.reorder_level,
    product.unit_cost,
    round(stock.quantity * product.unit_cost, 2)
  from public.product_stock as stock
  join public.products as product on product.id = stock.product_id
  join public.branches as branch on branch.id = stock.branch_id
  where public.is_branch_member(stock.branch_id)
    and (p_branch_id is null or stock.branch_id = p_branch_id)
    and product.status <> 'archived'
    and (
      p_search is null
      or product.name ilike '%' || btrim(p_search) || '%'
      or product.code ilike '%' || btrim(p_search) || '%'
    )
  order by branch.name, product.code;
end;
$$;

revoke all on function public.list_product_stock(uuid, text) from public, anon;
grant execute on function public.list_product_stock(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Audit integration.
-- ---------------------------------------------------------------------------

drop trigger if exists audit_stock_movements_change on public.stock_movements;
create trigger audit_stock_movements_change
after insert or update or delete on public.stock_movements
for each row execute function public.audit_row_change();
