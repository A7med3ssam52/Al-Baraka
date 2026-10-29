-- M3.2 — Vehicles and serial data.
--
-- Serial vehicle registry: chassis/engine numbers are unique (BR acceptance),
-- vehicle status follows a strict transition map so a sold vehicle can never
-- be reserved or sold again, and the stock code continues the VEH sequence.
-- The approved cost defaults to purchase + direct costs (transport/prep) and
-- stays editable for manual approval until M3.5 locking.

-- ---------------------------------------------------------------------------
-- 1. Vehicle code sequence (VEH-0001).
-- ---------------------------------------------------------------------------

insert into public.code_sequences (entity, prefix, padding)
values ('vehicle', 'VEH', 4)
on conflict (entity) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Vehicles table.
-- ---------------------------------------------------------------------------

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  vehicle_type text not null default 'motorcycle' check (vehicle_type in ('motorcycle', 'vehicle', 'spare_part')),
  vehicle_class text,
  brand_id uuid references public.product_brands (id),
  model_id uuid references public.product_models (id),
  manufacture_year integer check (manufacture_year between 1950 and 2100),
  color text,
  chassis_no text unique not null,
  engine_no text unique not null,
  supplier_id uuid references public.suppliers (id),
  purchase_date date,
  purchase_price numeric(14, 2) not null default 0 check (purchase_price >= 0),
  transport_cost numeric(14, 2) not null default 0 check (transport_cost >= 0),
  prep_cost numeric(14, 2) not null default 0 check (prep_cost >= 0),
  approved_cost numeric(14, 2) not null default 0 check (approved_cost >= 0),
  suggested_price numeric(14, 2) not null default 0 check (suggested_price >= 0),
  branch_id uuid not null references public.branches (id),
  status text not null default 'available'
    check (status in ('available', 'reserved', 'sold', 'returned', 'maintenance', 'damaged', 'archived')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create index if not exists vehicles_branch_status_idx on public.vehicles (branch_id, status);
create index if not exists vehicles_brand_idx on public.vehicles (brand_id);
create index if not exists vehicles_chassis_idx on public.vehicles (chassis_no);

alter table public.vehicles enable row level security;

drop policy if exists vehicles_select_authorized on public.vehicles;
create policy vehicles_select_authorized
on public.vehicles
for select
to authenticated
using (
  public.has_permission('vehicles.view')
  and public.is_branch_member(branch_id)
);

revoke all on public.vehicles from authenticated, anon;
grant select on public.vehicles to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.create_vehicle(
  p_chassis_no text,
  p_engine_no text,
  p_vehicle_type text default 'motorcycle',
  p_vehicle_class text default null,
  p_brand_id uuid default null,
  p_model_id uuid default null,
  p_manufacture_year integer default null,
  p_color text default null,
  p_supplier_id uuid default null,
  p_purchase_date date default null,
  p_purchase_price numeric default null,
  p_transport_cost numeric default null,
  p_prep_cost numeric default null,
  p_approved_cost numeric default null,
  p_suggested_price numeric default null,
  p_branch_id uuid default null
)
returns public.vehicles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_chassis text := regexp_replace(btrim(coalesce(p_chassis_no, '')), '\s', '', 'g');
  clean_engine text := regexp_replace(btrim(coalesce(p_engine_no, '')), '\s', '', 'g');
  clean_type text := lower(btrim(coalesce(p_vehicle_type, 'motorcycle')));
  purchase numeric := coalesce(p_purchase_price, 0);
  transport numeric := coalesce(p_transport_cost, 0);
  prep numeric := coalesce(p_prep_cost, 0);
  approved numeric := coalesce(p_approved_cost, purchase + transport + prep);
  target_branch uuid := coalesce(p_branch_id, public.current_branch());
  new_row public.vehicles;
begin
  if not public.has_permission('vehicles.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if clean_type not in ('motorcycle', 'vehicle', 'spare_part') then
    raise exception 'invalid_vehicle_type' using errcode = '22023';
  end if;

  if char_length(clean_chassis) < 3 or char_length(clean_chassis) > 60 then
    raise exception 'invalid_serial_number' using errcode = '22023';
  end if;

  if char_length(clean_engine) < 3 or char_length(clean_engine) > 60 then
    raise exception 'invalid_serial_number' using errcode = '22023';
  end if;

  if exists (select 1 from public.vehicles where chassis_no = clean_chassis) then
    raise exception 'duplicate_chassis' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.vehicles where engine_no = clean_engine) then
    raise exception 'duplicate_engine' using errcode = 'P0001';
  end if;

  if target_branch is null or not exists (
    select 1 from public.branches where id = target_branch and is_active
  ) then
    raise exception 'invalid_branch' using errcode = '22023';
  end if;

  if not public.is_branch_member(target_branch) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if purchase < 0 or transport < 0 or prep < 0 or approved < 0 or coalesce(p_suggested_price, 0) < 0 then
    raise exception 'invalid_vehicle_numbers' using errcode = '22023';
  end if;

  insert into public.vehicles (
    code, vehicle_type, vehicle_class, brand_id, model_id,
    manufacture_year, color, chassis_no, engine_no, supplier_id,
    purchase_date, purchase_price, transport_cost, prep_cost,
    approved_cost, suggested_price, branch_id,
    created_by, updated_by
  )
  values (
    public.next_entity_code('vehicle'), clean_type, p_vehicle_class, p_brand_id, p_model_id,
    p_manufacture_year, p_color, clean_chassis, clean_engine,
    p_supplier_id, p_purchase_date, purchase, transport, prep,
    approved, coalesce(p_suggested_price, 0), target_branch,
    auth.uid(), auth.uid()
  )
  returning * into new_row;

  return new_row;
end;
$$;

revoke all on function public.create_vehicle(text, text, text, text, uuid, uuid, integer, text, uuid, date, numeric, numeric, numeric, numeric, numeric, uuid) from public, anon;
grant execute on function public.create_vehicle(text, text, text, text, uuid, uuid, integer, text, uuid, date, numeric, numeric, numeric, numeric, numeric, uuid) to authenticated, service_role;

create or replace function public.update_vehicle(
  p_vehicle_id uuid,
  p_vehicle_type text default null,
  p_vehicle_class text default null,
  p_brand_id uuid default null,
  p_model_id uuid default null,
  p_manufacture_year integer default null,
  p_color text default null,
  p_supplier_id uuid default null,
  p_purchase_date date default null,
  p_suggested_price numeric default null,
  p_notes text default null
)
returns public.vehicles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_type text;
  new_row public.vehicles;
begin
  if not public.has_permission('vehicles.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select lower(btrim(vehicle_type)) into target_type
  from public.vehicles where vehicles.id = p_vehicle_id;

  if not found then
    raise exception 'vehicle_missing' using errcode = 'P0001';
  end if;

  update public.vehicles
  set vehicle_type = coalesce(lower(btrim(p_vehicle_type)), vehicle_type),
      vehicle_class = p_vehicle_class,
      brand_id = p_brand_id,
      model_id = p_model_id,
      manufacture_year = p_manufacture_year,
      color = p_color,
      supplier_id = p_supplier_id,
      purchase_date = p_purchase_date,
      suggested_price = coalesce(p_suggested_price, suggested_price),
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      updated_by = auth.uid()
  where vehicles.id = p_vehicle_id
    and status <> 'archived'
    and status <> 'sold'
  returning * into new_row;

  if new_row is null then
    raise exception 'vehicle_locked' using errcode = 'P0001';
  end if;

  return new_row;
end;
$$;

revoke all on function public.update_vehicle(uuid, text, text, uuid, uuid, integer, text, uuid, date, numeric, text) from public, anon;
grant execute on function public.update_vehicle(uuid, text, text, uuid, uuid, integer, text, uuid, date, numeric, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Status transitions (BR acceptance M3.2):
--   available  -> reserved, sold, maintenance, damaged, archived
--   reserved   -> available, sold
--   sold       -> returned (only)
--   returned   -> available, damaged
--   maintenance-> available, damaged
--   damaged    -> available, maintenance
-- archived is terminal.
-- ---------------------------------------------------------------------------

create or replace function public.set_vehicle_status(
  p_vehicle_id uuid,
  p_status text
)
returns public.vehicles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_status text := lower(btrim(coalesce(p_status, '')));
  current_status text;
  new_row public.vehicles;
begin
  if target_status = 'archived' then
    if not public.has_permission('vehicles.archive') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  else
    if not public.has_permission('vehicles.update') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  if target_status not in ('available', 'reserved', 'sold', 'returned', 'maintenance', 'damaged', 'archived') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select lower(status) into current_status
  from public.vehicles
  where vehicles.id = p_vehicle_id
    and public.is_branch_member(branch_id);

  if current_status is null then
    raise exception 'vehicle_missing' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    where (current_status, target_status) in (
      ('available', 'reserved'), ('available', 'sold'), ('available', 'maintenance'),
      ('available', 'damaged'), ('available', 'archived'), ('available', 'available'),
      ('reserved', 'available'), ('reserved', 'sold'),
      ('sold', 'returned'),
      ('returned', 'available'), ('returned', 'damaged'),
      ('maintenance', 'available'), ('maintenance', 'damaged'),
      ('damaged', 'available'), ('damaged', 'maintenance')
    )
  ) then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;

  update public.vehicles
  set status = target_status,
      updated_by = auth.uid()
  where vehicles.id = p_vehicle_id
  returning * into new_row;

  return new_row;
end;
$$;

revoke all on function public.set_vehicle_status(uuid, text) from public, anon;
grant execute on function public.set_vehicle_status(uuid, text) to authenticated, service_role;

create or replace function public.list_vehicles(
  p_status text default 'active',
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  code text,
  vehicle_type text,
  vehicle_class text,
  brand_name text,
  model_name text,
  manufacture_year integer,
  color text,
  chassis_no text,
  engine_no text,
  supplier_name text,
  purchase_date date,
  purchase_price numeric,
  transport_cost numeric,
  prep_cost numeric,
  approved_cost numeric,
  suggested_price numeric,
  branch_id uuid,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('vehicles.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    vehicle.id, vehicle.code, vehicle.vehicle_type, vehicle.vehicle_class,
    brand.name, model.name,
    vehicle.manufacture_year, vehicle.color, vehicle.chassis_no, vehicle.engine_no,
    supplier.full_name,
    vehicle.purchase_date, vehicle.purchase_price, vehicle.transport_cost, vehicle.prep_cost,
    vehicle.approved_cost, vehicle.suggested_price,
    vehicle.branch_id, vehicle.status, vehicle.created_at
  from public.vehicles as vehicle
  left join public.product_brands as brand on brand.id = vehicle.brand_id
  left join public.product_models as model on model.id = vehicle.model_id
  left join public.suppliers as supplier on supplier.id = vehicle.supplier_id
  where public.is_branch_member(vehicle.branch_id)
    and (
      p_status = 'all'
      or (p_status = 'active' and vehicle.status in ('available', 'reserved', 'maintenance', 'damaged'))
      or vehicle.status = lower(btrim(coalesce(p_status, '')))
    )
    and (
      p_search is null
      or vehicle.code ilike '%' || btrim(p_search) || '%'
      or vehicle.chassis_no ilike '%' || btrim(p_search) || '%'
      or vehicle.engine_no ilike '%' || btrim(p_search) || '%'
      or brand.name ilike '%' || btrim(p_search) || '%'
      or supplier.full_name ilike '%' || btrim(p_search) || '%'
    )
  order by vehicle.code
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_vehicles(text, text, integer, integer) from public, anon;
grant execute on function public.list_vehicles(text, text, integer, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Audit integration.
-- ---------------------------------------------------------------------------

drop trigger if exists audit_vehicles_change on public.vehicles;
create trigger audit_vehicles_change
after insert or update or delete on public.vehicles
for each row execute function public.audit_row_change();
