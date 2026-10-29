-- M3.7 — Branch transfers and physical stock counts.
--
-- Transfers are a two-step, receipt-confirmed flow:
--   draft -> (send) in_transit -> (receive) received
-- Sending posts transfer_out on the source branch, receiving posts transfer_in
-- on the destination branch. Nothing moves before send and nothing moves twice
-- because every transition is status-guarded and quantity-locked after sending.
--
-- Counts snapshot the system quantity, then keep the counted quantity in the
-- draft. Stock is only adjusted on approval, one adjustment movement per line
-- whose counted quantity differs.

insert into public.code_sequences (entity, prefix, padding)
values
  ('stock_transfer', 'TRF', 4),
  ('stock_count', 'CNT', 4)
on conflict (entity) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Tables.
-- ---------------------------------------------------------------------------

create table if not exists public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  number text unique not null check (number ~ '^TRF-[0-9]{4,}$'),
  from_branch_id uuid not null references public.branches (id) on delete restrict,
  to_branch_id uuid not null references public.branches (id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'in_transit', 'received', 'cancelled')),
  transfer_date date not null default current_date,
  notes text,
  sent_at timestamptz,
  sent_by uuid references public.profiles (id),
  received_at timestamptz,
  received_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  check (from_branch_id <> to_branch_id)
);

create index if not exists stock_transfers_source_idx
  on public.stock_transfers (from_branch_id, transfer_date desc);
create index if not exists stock_transfers_destination_idx
  on public.stock_transfers (to_branch_id, transfer_date desc);
create index if not exists stock_transfers_status_idx
  on public.stock_transfers (status, transfer_date desc);

create table if not exists public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.stock_transfers (id) on delete cascade,
  line_no smallint not null check (line_no > 0),
  product_id uuid references public.products (id) on delete restrict,
  vehicle_id uuid references public.vehicles (id) on delete restrict,
  quantity numeric(14, 2) not null check (quantity > 0),
  unit_cost numeric(14, 2) not null default 0 check (unit_cost >= 0),
  unique (transfer_id, line_no),
  check (num_nonnulls(product_id, vehicle_id) = 1)
);

create index if not exists stock_transfer_items_transfer_idx
  on public.stock_transfer_items (transfer_id, line_no);
create index if not exists stock_transfer_items_product_idx
  on public.stock_transfer_items (product_id);
create index if not exists stock_transfer_items_vehicle_idx
  on public.stock_transfer_items (vehicle_id);

create table if not exists public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  number text unique not null check (number ~ '^CNT-[0-9]{4,}$'),
  branch_id uuid not null references public.branches (id) on delete restrict,
  count_date date not null default current_date,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'cancelled')),
  notes text,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create index if not exists stock_counts_branch_idx
  on public.stock_counts (branch_id, count_date desc);
create index if not exists stock_counts_status_idx
  on public.stock_counts (status, count_date desc);

create table if not exists public.stock_count_items (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.stock_counts (id) on delete cascade,
  line_no smallint not null check (line_no > 0),
  product_id uuid not null references public.products (id) on delete restrict,
  system_qty numeric(14, 2) not null check (system_qty >= 0),
  counted_qty numeric(14, 2) not null check (counted_qty >= 0),
  difference numeric(14, 2) not null default 0,
  unit_cost numeric(14, 2) not null default 0 check (unit_cost >= 0),
  notes text,
  unique (count_id, product_id)
);

create index if not exists stock_count_items_count_idx
  on public.stock_count_items (count_id, line_no);
create index if not exists stock_count_items_product_idx
  on public.stock_count_items (product_id);

-- ---------------------------------------------------------------------------
-- 2. RLS (read-only; every write goes through the functions below).
-- ---------------------------------------------------------------------------

alter table public.stock_transfers enable row level security;

drop policy if exists stock_transfers_select_authorized on public.stock_transfers;
create policy stock_transfers_select_authorized
on public.stock_transfers
for select
to authenticated
using (
  public.has_permission('products.view')
  and (
    public.is_branch_member(from_branch_id)
    or public.is_branch_member(to_branch_id)
  )
);

revoke all on public.stock_transfers from authenticated, anon;
grant select on public.stock_transfers to authenticated;

alter table public.stock_transfer_items enable row level security;

drop policy if exists stock_transfer_items_select_authorized on public.stock_transfer_items;
create policy stock_transfer_items_select_authorized
on public.stock_transfer_items
for select
to authenticated
using (
  public.has_permission('products.view')
  and exists (
    select 1
    from public.stock_transfers as transfer
    where transfer.id = stock_transfer_items.transfer_id
      and (
        public.is_branch_member(transfer.from_branch_id)
        or public.is_branch_member(transfer.to_branch_id)
      )
  )
);

revoke all on public.stock_transfer_items from authenticated, anon;
grant select on public.stock_transfer_items to authenticated;

alter table public.stock_counts enable row level security;

drop policy if exists stock_counts_select_authorized on public.stock_counts;
create policy stock_counts_select_authorized
on public.stock_counts
for select
to authenticated
using (
  public.has_permission('inventory_counts.view')
  and public.is_branch_member(branch_id)
);

revoke all on public.stock_counts from authenticated, anon;
grant select on public.stock_counts to authenticated;

alter table public.stock_count_items enable row level security;

drop policy if exists stock_count_items_select_authorized on public.stock_count_items;
create policy stock_count_items_select_authorized
on public.stock_count_items
for select
to authenticated
using (
  public.has_permission('inventory_counts.view')
  and exists (
    select 1
    from public.stock_counts as count_row
    where count_row.id = stock_count_items.count_id
      and public.is_branch_member(count_row.branch_id)
  )
);

revoke all on public.stock_count_items from authenticated, anon;
grant select on public.stock_count_items to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Transfer lifecycle.
-- ---------------------------------------------------------------------------

create or replace function public.create_stock_transfer(
  p_from_branch_id uuid,
  p_to_branch_id uuid,
  p_items jsonb,
  p_transfer_date date default current_date,
  p_notes text default null
)
returns public.stock_transfers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  line record;
  line_index integer := 0;
  item_count integer;
  product_value uuid;
  vehicle_value uuid;
  item_quantity numeric;
  target_vehicle public.vehicles;
  new_row public.stock_transfers;
begin
  if not public.has_permission('products.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_from_branch_id is null or p_to_branch_id is null
     or p_from_branch_id = p_to_branch_id then
    raise exception 'invalid_transfer_branch' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.branches
    where id in (p_from_branch_id, p_to_branch_id) and is_active
  ) or (
    select count(*) from public.branches
    where id in (p_from_branch_id, p_to_branch_id) and is_active
  ) <> 2 then
    raise exception 'invalid_branch' using errcode = '22023';
  end if;

  if not public.is_branch_member(p_from_branch_id)
     or not public.is_branch_member(p_to_branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_transfer_items' using errcode = '22023';
  end if;

  item_count := jsonb_array_length(p_items);

  if item_count < 1 or item_count > 100 then
    raise exception 'invalid_transfer_items' using errcode = '22023';
  end if;

  -- Validate before writing so a bad line leaves no draft behind.
  for line in select value from jsonb_array_elements(p_items) loop
    product_value := nullif(btrim(coalesce(line.value ->> 'product_id', '')), '')::uuid;
    vehicle_value := nullif(btrim(coalesce(line.value ->> 'vehicle_id', '')), '')::uuid;
    item_quantity := coalesce((line.value ->> 'quantity')::numeric, 0);

    if num_nonnulls(product_value, vehicle_value) <> 1 then
      raise exception 'invalid_transfer_item_target' using errcode = '22023';
    end if;

    if item_quantity <= 0 then
      raise exception 'invalid_transfer_item_numbers' using errcode = '22023';
    end if;

    if product_value is not null then
      if not exists (
        select 1 from public.products
        where id = product_value and status <> 'archived'
      ) then
        raise exception 'product_missing' using errcode = 'P0001';
      end if;
    else
      if item_quantity <> 1 then
        raise exception 'invalid_transfer_item_numbers' using errcode = '22023';
      end if;

      select * into target_vehicle from public.vehicles where id = vehicle_value;

      if not found then
        raise exception 'vehicle_missing' using errcode = 'P0001';
      end if;

      if target_vehicle.branch_id <> p_from_branch_id then
        raise exception 'vehicle_branch_mismatch' using errcode = 'P0001';
      end if;

      if target_vehicle.status in ('sold', 'archived') then
        raise exception 'vehicle_unavailable' using errcode = 'P0001';
      end if;
    end if;
  end loop;

  insert into public.stock_transfers (
    number, from_branch_id, to_branch_id, status, transfer_date, notes,
    created_by, updated_by
  )
  values (
    public.next_entity_code('stock_transfer'), p_from_branch_id, p_to_branch_id,
    'draft', coalesce(p_transfer_date, current_date),
    nullif(btrim(coalesce(p_notes, '')), ''), auth.uid(), auth.uid()
  )
  returning * into new_row;

  for line in select value from jsonb_array_elements(p_items) loop
    line_index := line_index + 1;
    product_value := nullif(btrim(coalesce(line.value ->> 'product_id', '')), '')::uuid;
    vehicle_value := nullif(btrim(coalesce(line.value ->> 'vehicle_id', '')), '')::uuid;
    item_quantity := coalesce((line.value ->> 'quantity')::numeric, 0);

    insert into public.stock_transfer_items (
      transfer_id, line_no, product_id, vehicle_id, quantity, unit_cost
    )
    values (
      new_row.id, line_index, product_value, vehicle_value, item_quantity,
      case
        when product_value is not null then
          coalesce((select unit_cost from public.products where id = product_value), 0)
        else
          coalesce((select approved_cost from public.vehicles where id = vehicle_value), 0)
      end
    );
  end loop;

  return new_row;
end;
$$;

revoke all on function public.create_stock_transfer(uuid, uuid, jsonb, date, text)
  from public, anon;
grant execute on function public.create_stock_transfer(uuid, uuid, jsonb, date, text)
  to authenticated, service_role;

create or replace function public.send_stock_transfer(p_transfer_id uuid)
returns public.stock_transfers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.stock_transfers;
  line record;
begin
  if not public.has_permission('products.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into current_row
  from public.stock_transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'transfer_missing' using errcode = 'P0001';
  end if;

  if current_row.status <> 'draft' then
    raise exception 'transfer_not_draft' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(current_row.from_branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.stock_transfer_items where transfer_id = p_transfer_id
  ) then
    raise exception 'invalid_transfer_items' using errcode = '22023';
  end if;

  for line in
    select * from public.stock_transfer_items
    where transfer_id = p_transfer_id
    order by line_no
  loop
    if line.product_id is not null then
      perform public.record_stock_movement(
        'transfer_out', -line.quantity, line.product_id, null,
        line.unit_cost, current_row.from_branch_id,
        'stock_transfer', current_row.id, current_row.number
      );
    else
      perform public.record_stock_movement(
        'transfer_out', -1, null, line.vehicle_id,
        line.unit_cost, current_row.from_branch_id,
        'stock_transfer', current_row.id, current_row.number
      );
    end if;
  end loop;

  update public.stock_transfers
  set status = 'in_transit',
      sent_at = now(),
      sent_by = auth.uid(),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_transfer_id
  returning * into current_row;

  return current_row;
end;
$$;

revoke all on function public.send_stock_transfer(uuid) from public, anon;
grant execute on function public.send_stock_transfer(uuid) to authenticated, service_role;

create or replace function public.receive_stock_transfer(p_transfer_id uuid)
returns public.stock_transfers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.stock_transfers;
  line record;
begin
  if not public.has_permission('products.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into current_row
  from public.stock_transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'transfer_missing' using errcode = 'P0001';
  end if;

  if current_row.status <> 'in_transit' then
    raise exception 'transfer_not_in_transit' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(current_row.to_branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  for line in
    select * from public.stock_transfer_items
    where transfer_id = p_transfer_id
    order by line_no
  loop
    if line.product_id is not null then
      perform public.record_stock_movement(
        'transfer_in', line.quantity, line.product_id, null,
        line.unit_cost, current_row.to_branch_id,
        'stock_transfer', current_row.id, current_row.number
      );
    else
      update public.vehicles
      set branch_id = current_row.to_branch_id,
          updated_at = now(),
          updated_by = auth.uid()
      where id = line.vehicle_id;

      perform public.record_stock_movement(
        'transfer_in', 1, null, line.vehicle_id,
        line.unit_cost, current_row.to_branch_id,
        'stock_transfer', current_row.id, current_row.number
      );
    end if;
  end loop;

  update public.stock_transfers
  set status = 'received',
      received_at = now(),
      received_by = auth.uid(),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_transfer_id
  returning * into current_row;

  return current_row;
end;
$$;

revoke all on function public.receive_stock_transfer(uuid) from public, anon;
grant execute on function public.receive_stock_transfer(uuid) to authenticated, service_role;

create or replace function public.cancel_stock_transfer(
  p_transfer_id uuid,
  p_reason text default null
)
returns public.stock_transfers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.stock_transfers;
begin
  if not public.has_permission('products.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into current_row
  from public.stock_transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'transfer_missing' using errcode = 'P0001';
  end if;

  if current_row.status <> 'draft' then
    raise exception 'transfer_not_draft' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(current_row.from_branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.stock_transfers
  set status = 'cancelled',
      notes = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), notes),
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_transfer_id
  returning * into current_row;

  return current_row;
end;
$$;

revoke all on function public.cancel_stock_transfer(uuid, text) from public, anon;
grant execute on function public.cancel_stock_transfer(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Transfer reads.
-- ---------------------------------------------------------------------------

create or replace function public.list_stock_transfers(
  p_status text default 'all',
  p_branch_id uuid default null
)
returns table (
  id uuid,
  number text,
  from_branch_id uuid,
  from_branch_name text,
  to_branch_id uuid,
  to_branch_name text,
  status text,
  transfer_date date,
  item_count integer,
  total_quantity numeric,
  total_value numeric,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz
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
    transfer.id,
    transfer.number,
    transfer.from_branch_id,
    source.name,
    transfer.to_branch_id,
    destination.name,
    transfer.status,
    transfer.transfer_date,
    (select count(*)::integer from public.stock_transfer_items as item
     where item.transfer_id = transfer.id),
    (select coalesce(sum(item.quantity), 0) from public.stock_transfer_items as item
     where item.transfer_id = transfer.id),
    (select coalesce(sum(item.quantity * item.unit_cost), 0) from public.stock_transfer_items as item
     where item.transfer_id = transfer.id),
    transfer.sent_at,
    transfer.received_at,
    transfer.created_at
  from public.stock_transfers as transfer
  join public.branches as source on source.id = transfer.from_branch_id
  join public.branches as destination on destination.id = transfer.to_branch_id
  where (
      public.is_branch_member(transfer.from_branch_id)
      or public.is_branch_member(transfer.to_branch_id)
    )
    and (p_branch_id is null
      or transfer.from_branch_id = p_branch_id
      or transfer.to_branch_id = p_branch_id)
    and (
      p_status is null
      or lower(btrim(p_status)) = 'all'
      or transfer.status = lower(btrim(p_status))
    )
  order by transfer.transfer_date desc, transfer.number desc;
end;
$$;

revoke all on function public.list_stock_transfers(text, uuid) from public, anon;
grant execute on function public.list_stock_transfers(text, uuid) to authenticated, service_role;

create or replace function public.get_stock_transfer(p_transfer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  transfer_row public.stock_transfers;
  item_rows jsonb;
begin
  if not public.has_permission('products.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into transfer_row from public.stock_transfers where id = p_transfer_id;

  if not found then
    raise exception 'transfer_missing' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(transfer_row.from_branch_id)
     and not public.is_branch_member(transfer_row.to_branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(item) || jsonb_build_object(
        'product_code', product.code,
        'product_name', product.name,
        'vehicle_code', vehicle.code,
        'vehicle_chassis', vehicle.chassis_no
      )
      order by item.line_no
    ),
    '[]'::jsonb
  )
  into item_rows
  from public.stock_transfer_items as item
  left join public.products as product on product.id = item.product_id
  left join public.vehicles as vehicle on vehicle.id = item.vehicle_id
  where item.transfer_id = p_transfer_id;

  return jsonb_build_object(
    'transfer', to_jsonb(transfer_row) || jsonb_build_object(
      'from_branch_name', (select name from public.branches where id = transfer_row.from_branch_id),
      'to_branch_name', (select name from public.branches where id = transfer_row.to_branch_id)
    ),
    'items', item_rows
  );
end;
$$;

revoke all on function public.get_stock_transfer(uuid) from public, anon;
grant execute on function public.get_stock_transfer(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Count lifecycle.
-- ---------------------------------------------------------------------------

create or replace function public.create_stock_count(
  p_product_ids uuid[] default null,
  p_count_date date default current_date,
  p_notes text default null,
  p_branch_id uuid default null
)
returns public.stock_counts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_branch uuid := coalesce(p_branch_id, public.current_branch());
  new_row public.stock_counts;
  line_index integer := 0;
  product_row record;
begin
  if not public.has_permission('inventory_counts.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if target_branch is null or not exists (
    select 1 from public.branches where id = target_branch and is_active
  ) then
    raise exception 'invalid_branch' using errcode = '22023';
  end if;

  if not public.is_branch_member(target_branch) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.stock_counts
    where branch_id = target_branch and status = 'draft'
  ) then
    raise exception 'count_already_open' using errcode = 'P0001';
  end if;

  insert into public.stock_counts (
    number, branch_id, count_date, status, notes, created_by, updated_by
  )
  values (
    public.next_entity_code('stock_count'), target_branch,
    coalesce(p_count_date, current_date), 'draft',
    nullif(btrim(coalesce(p_notes, '')), ''), auth.uid(), auth.uid()
  )
  returning * into new_row;

  for product_row in
    select
      product.id,
      coalesce(stock.quantity, 0) as system_qty,
      product.unit_cost
    from public.products as product
    left join public.product_stock as stock
      on stock.product_id = product.id and stock.branch_id = target_branch
    where product.status <> 'archived'
      and (p_product_ids is null or product.id = any (p_product_ids))
    order by product.code
  loop
    line_index := line_index + 1;

    insert into public.stock_count_items (
      count_id, line_no, product_id, system_qty, counted_qty, difference, unit_cost
    )
    values (
      new_row.id, line_index, product_row.id, product_row.system_qty,
      product_row.system_qty, 0, product_row.unit_cost
    );
  end loop;

  if line_index = 0 then
    delete from public.stock_counts where id = new_row.id;
    raise exception 'invalid_count_items' using errcode = '22023';
  end if;

  return new_row;
end;
$$;

revoke all on function public.create_stock_count(uuid[], date, text, uuid)
  from public, anon;
grant execute on function public.create_stock_count(uuid[], date, text, uuid)
  to authenticated, service_role;

create or replace function public.update_stock_count(
  p_count_id uuid,
  p_items jsonb
)
returns public.stock_counts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.stock_counts;
  line record;
  counted numeric;
  product_value uuid;
begin
  if not public.has_permission('inventory_counts.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into current_row
  from public.stock_counts
  where id = p_count_id
  for update;

  if not found then
    raise exception 'count_missing' using errcode = 'P0001';
  end if;

  if current_row.status <> 'draft' then
    raise exception 'count_not_draft' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(current_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_count_items' using errcode = '22023';
  end if;

  for line in select value from jsonb_array_elements(p_items) loop
    product_value := nullif(btrim(coalesce(line.value ->> 'product_id', '')), '')::uuid;
    counted := coalesce((line.value ->> 'counted_qty')::numeric, -1);

    if product_value is null then
      raise exception 'invalid_count_items' using errcode = '22023';
    end if;

    if counted < 0 then
      raise exception 'invalid_count_quantity' using errcode = '22023';
    end if;

    update public.stock_count_items
    set counted_qty = counted,
        difference = counted - system_qty,
        notes = nullif(btrim(coalesce(line.value ->> 'notes', '')), '')
    where count_id = p_count_id
      and product_id = product_value;

    if not found then
      raise exception 'count_item_missing' using errcode = 'P0001';
    end if;
  end loop;

  update public.stock_counts
  set updated_at = now(),
      updated_by = auth.uid()
  where id = p_count_id
  returning * into current_row;

  return current_row;
end;
$$;

revoke all on function public.update_stock_count(uuid, jsonb) from public, anon;
grant execute on function public.update_stock_count(uuid, jsonb) to authenticated, service_role;

create or replace function public.approve_stock_count(p_count_id uuid)
returns public.stock_counts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.stock_counts;
  line record;
begin
  if not public.has_permission('inventory_counts.approve') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into current_row
  from public.stock_counts
  where id = p_count_id
  for update;

  if not found then
    raise exception 'count_missing' using errcode = 'P0001';
  end if;

  if current_row.status <> 'draft' then
    raise exception 'count_not_draft' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(current_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Stock only changes here, after approval.
  for line in
    select * from public.stock_count_items
    where count_id = p_count_id and difference <> 0
    order by line_no
  loop
    perform public.record_stock_movement(
      'adjustment', line.difference, line.product_id, null,
      line.unit_cost, current_row.branch_id,
      'stock_count', current_row.id, current_row.number
    );
  end loop;

  update public.stock_counts
  set status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_count_id
  returning * into current_row;

  return current_row;
end;
$$;

revoke all on function public.approve_stock_count(uuid) from public, anon;
grant execute on function public.approve_stock_count(uuid) to authenticated, service_role;

create or replace function public.cancel_stock_count(
  p_count_id uuid,
  p_reason text default null
)
returns public.stock_counts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.stock_counts;
begin
  if not public.has_permission('inventory_counts.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into current_row
  from public.stock_counts
  where id = p_count_id
  for update;

  if not found then
    raise exception 'count_missing' using errcode = 'P0001';
  end if;

  if current_row.status <> 'draft' then
    raise exception 'count_not_draft' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(current_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.stock_counts
  set status = 'cancelled',
      notes = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), notes),
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_count_id
  returning * into current_row;

  return current_row;
end;
$$;

revoke all on function public.cancel_stock_count(uuid, text) from public, anon;
grant execute on function public.cancel_stock_count(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Count reads.
-- ---------------------------------------------------------------------------

create or replace function public.list_stock_counts(
  p_status text default 'all',
  p_branch_id uuid default null
)
returns table (
  id uuid,
  number text,
  branch_id uuid,
  branch_name text,
  count_date date,
  status text,
  item_count integer,
  difference_count integer,
  total_difference_value numeric,
  approved_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('inventory_counts.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    count_row.id,
    count_row.number,
    count_row.branch_id,
    branch.name,
    count_row.count_date,
    count_row.status,
    (select count(*)::integer from public.stock_count_items as item
     where item.count_id = count_row.id),
    (select count(*)::integer from public.stock_count_items as item
     where item.count_id = count_row.id and item.difference <> 0),
    (select coalesce(sum(item.difference * item.unit_cost), 0)
     from public.stock_count_items as item
     where item.count_id = count_row.id),
    count_row.approved_at,
    count_row.created_at
  from public.stock_counts as count_row
  join public.branches as branch on branch.id = count_row.branch_id
  where public.is_branch_member(count_row.branch_id)
    and (p_branch_id is null or count_row.branch_id = p_branch_id)
    and (
      p_status is null
      or lower(btrim(p_status)) = 'all'
      or count_row.status = lower(btrim(p_status))
    )
  order by count_row.count_date desc, count_row.number desc;
end;
$$;

revoke all on function public.list_stock_counts(text, uuid) from public, anon;
grant execute on function public.list_stock_counts(text, uuid) to authenticated, service_role;

create or replace function public.get_stock_count(p_count_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  count_row public.stock_counts;
  item_rows jsonb;
begin
  if not public.has_permission('inventory_counts.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into count_row from public.stock_counts where id = p_count_id;

  if not found then
    raise exception 'count_missing' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(count_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(item) || jsonb_build_object(
        'product_code', product.code,
        'product_name', product.name,
        'unit_name', product.unit_name
      )
      order by item.line_no
    ),
    '[]'::jsonb
  )
  into item_rows
  from public.stock_count_items as item
  join public.products as product on product.id = item.product_id
  where item.count_id = p_count_id;

  return jsonb_build_object(
    'count', to_jsonb(count_row) || jsonb_build_object(
      'branch_name', (select name from public.branches where id = count_row.branch_id)
    ),
    'items', item_rows
  );
end;
$$;

revoke all on function public.get_stock_count(uuid) from public, anon;
grant execute on function public.get_stock_count(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Audit integration.
-- ---------------------------------------------------------------------------

drop trigger if exists audit_stock_transfers_change on public.stock_transfers;
create trigger audit_stock_transfers_change
after insert or update or delete on public.stock_transfers
for each row execute function public.audit_row_change();

drop trigger if exists audit_stock_transfer_items_change on public.stock_transfer_items;
create trigger audit_stock_transfer_items_change
after insert or update or delete on public.stock_transfer_items
for each row execute function public.audit_row_change();

drop trigger if exists audit_stock_counts_change on public.stock_counts;
create trigger audit_stock_counts_change
after insert or update or delete on public.stock_counts
for each row execute function public.audit_row_change();

drop trigger if exists audit_stock_count_items_change on public.stock_count_items;
create trigger audit_stock_count_items_change
after insert or update or delete on public.stock_count_items
for each row execute function public.audit_row_change();
