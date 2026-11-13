-- 20261117 — list_vehicles returns the current vehicle owner (if any).
-- Dropped first: the row type gains three new OUT columns.

drop function if exists public.list_vehicles(text, text, integer, integer);

create function public.list_vehicles(
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
  created_at timestamptz,
  current_customer_id uuid,
  current_customer_name text,
  current_customer_code text
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
    vehicle.branch_id, vehicle.status, vehicle.created_at,
    customer.id, customer.full_name, customer.code
  from public.vehicles as vehicle
  left join public.product_brands as brand on brand.id = vehicle.brand_id
  left join public.product_models as model on model.id = vehicle.model_id
  left join public.suppliers as supplier on supplier.id = vehicle.supplier_id
  left join public.customers as customer on customer.id = vehicle.current_customer_id
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
      or customer.full_name ilike '%' || btrim(p_search) || '%'
    )
  order by vehicle.code
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_vehicles(text, text, integer, integer) from public, anon;
grant execute on function public.list_vehicles(text, text, integer, integer) to authenticated, service_role;
