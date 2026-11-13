-- 20261117 — list_customer_vehicles: vehicles currently registered to a customer.

create or replace function public.list_customer_vehicles(p_customer_id uuid)
returns table (
  id uuid,
  code text,
  vehicle_type text,
  brand_name text,
  model_name text,
  manufacture_year integer,
  color text,
  chassis_no text,
  engine_no text,
  status text,
  purchase_date date
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
    vehicle.id, vehicle.code, vehicle.vehicle_type,
    brand.name, model.name,
    vehicle.manufacture_year, vehicle.color,
    vehicle.chassis_no, vehicle.engine_no,
    vehicle.status, vehicle.purchase_date
  from public.vehicles as vehicle
  left join public.product_brands as brand on brand.id = vehicle.brand_id
  left join public.product_models as model on model.id = vehicle.model_id
  where vehicle.current_customer_id = p_customer_id
    and public.is_branch_member(vehicle.branch_id)
  order by vehicle.code;
end;
$$;

revoke all on function public.list_customer_vehicles(uuid) from public, anon;
grant execute on function public.list_customer_vehicles(uuid) to authenticated, service_role;
