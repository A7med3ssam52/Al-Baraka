-- M3.9 — Replace vehicle types with tuktuk / motorcycle / tricycle.
--
-- Existing rows are migrated to the closest new type before the old check
-- constraint is replaced. New defaults and RPC validation follow.

alter table public.vehicles
  drop constraint if exists vehicles_vehicle_type_check;

update public.vehicles
set vehicle_type = case vehicle_type
  when 'vehicle' then 'tuktuk'
  when 'spare_part' then 'tricycle'
  else 'motorcycle'
end
where vehicle_type in ('vehicle', 'spare_part', 'motorcycle');

alter table public.vehicles
  alter column vehicle_type set default 'motorcycle';

alter table public.vehicles
  add constraint vehicles_vehicle_type_check
  check (vehicle_type in ('tuktuk', 'motorcycle', 'tricycle'));

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

  if clean_type not in ('tuktuk', 'motorcycle', 'tricycle') then
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
