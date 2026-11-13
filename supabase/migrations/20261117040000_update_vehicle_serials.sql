-- 20261113 — update_vehicle: allow editing chassis & engine numbers.
--
-- Serial numbers used to be set once at creation and never changed. They can
-- now be corrected (typo fixes for pre-existing units) by anyone with
-- vehicles.update, in ANY status including sold/archived. Uniqueness and
-- format rules mirror create_vehicle exactly (strip whitespace, 3–60 chars,
-- unique per vehicles table).
--
-- Sold/archived vehicles still cannot have any OTHER field changed. A locked
-- row is only rejected when a non-serial field is actually changed (so the
-- edit dialog can keep sending untouched current values).

drop function if exists public.update_vehicle(uuid, text, text, uuid, uuid, integer, text, uuid, date, numeric, text);

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
  p_notes text default null,
  p_chassis_no text default null,
  p_engine_no text default null
)
returns public.vehicles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur public.vehicles;
  target_type text;
  new_row public.vehicles;
  clean_chassis text;
  clean_engine text;
  clean_notes text;
  other_changed boolean := false;
begin
  if not public.has_permission('vehicles.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into cur from public.vehicles where vehicles.id = p_vehicle_id for update;

  if not found then
    raise exception 'vehicle_missing' using errcode = 'P0001';
  end if;

  -- normalize serials like create_vehicle does
  clean_chassis := case when p_chassis_no is null then null
                        else regexp_replace(btrim(p_chassis_no), '\s', '', 'g') end;
  clean_engine := case when p_engine_no is null then null
                       else regexp_replace(btrim(p_engine_no), '\s', '', 'g') end;
  clean_notes := nullif(btrim(coalesce(p_notes, '')), '');

  if clean_chassis is not null then
    if char_length(clean_chassis) < 3 or char_length(clean_chassis) > 60 then
      raise exception 'invalid_serial_number' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.vehicles
      where chassis_no = clean_chassis and id <> p_vehicle_id
    ) then
      raise exception 'duplicate_chassis' using errcode = 'P0001';
    end if;
  end if;

  if clean_engine is not null then
    if char_length(clean_engine) < 3 or char_length(clean_engine) > 60 then
      raise exception 'invalid_serial_number' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.vehicles
      where engine_no = clean_engine and id <> p_vehicle_id
    ) then
      raise exception 'duplicate_engine' using errcode = 'P0001';
    end if;
  end if;

  -- did any non-serial field actually change? (mirrors original semantics)
  other_changed :=
    (p_vehicle_type is not null and lower(btrim(p_vehicle_type)) <> lower(btrim(cur.vehicle_type)))
    or (p_vehicle_class is distinct from cur.vehicle_class)
    or (p_brand_id is distinct from cur.brand_id)
    or (p_model_id is distinct from cur.model_id)
    or (p_manufacture_year is distinct from cur.manufacture_year)
    or (p_color is distinct from cur.color)
    or (p_supplier_id is distinct from cur.supplier_id)
    or (p_purchase_date is distinct from cur.purchase_date)
    or (p_suggested_price is not null and p_suggested_price <> cur.suggested_price)
    or (p_notes is not null and clean_notes is distinct from cur.notes);

  -- sold/archived: everything except serials stays locked, exactly as before
  if other_changed and cur.status in ('sold', 'archived') then
    raise exception 'vehicle_locked' using errcode = 'P0001';
  end if;

  -- serials: allowed in every status
  if (clean_chassis is not null and clean_chassis <> cur.chassis_no)
     or (clean_engine is not null and clean_engine <> cur.engine_no) then
    update public.vehicles
    set chassis_no = coalesce(clean_chassis, chassis_no),
        engine_no = coalesce(clean_engine, engine_no),
        updated_by = auth.uid()
    where id = p_vehicle_id;
  end if;

  if cur.status in ('sold', 'archived') then
    -- serial-only change on a locked vehicle: nothing else to do
    select * into new_row from public.vehicles where id = p_vehicle_id;
    return new_row;
  end if;

  target_type := lower(btrim(coalesce(p_vehicle_type, cur.vehicle_type)));

  update public.vehicles
  set vehicle_type = target_type,
      vehicle_class = p_vehicle_class,
      brand_id = p_brand_id,
      model_id = p_model_id,
      manufacture_year = p_manufacture_year,
      color = p_color,
      supplier_id = p_supplier_id,
      purchase_date = p_purchase_date,
      suggested_price = coalesce(p_suggested_price, suggested_price),
      notes = clean_notes,
      updated_by = auth.uid()
  where vehicles.id = p_vehicle_id
  returning * into new_row;

  return new_row;
end;
$$;

revoke all on function public.update_vehicle(uuid, text, text, uuid, uuid, integer, text, uuid, date, numeric, text, text, text) from public, anon;
grant execute on function public.update_vehicle(uuid, text, text, uuid, uuid, integer, text, uuid, date, numeric, text, text, text) to authenticated, service_role;
