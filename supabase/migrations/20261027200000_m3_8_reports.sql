-- M3.8 — Inventory, vehicle, and purchase reports.
--
-- Read-only reporting layer that closes phase 3. Every figure is derived from
-- the same ledgers the operational screens write to (product_stock,
-- stock_movements, purchase_invoices/purchase_invoice_items), so a report can
-- never disagree with the movements that produced it.
--
--   get_inventory_report        -> per-branch balances + valuation summary
--   get_vehicles_report         -> vehicle register by status/branch
--   list_vehicle_movements      -> vehicle movement ledger with references
--   get_purchases_report        -> purchases totals, by supplier, invoices
--   get_vehicle_cost_breakdown  -> purchase line -> allocated costs -> approved cost
--
-- All functions are branch-scoped and permission-checked; nothing is written.

-- ---------------------------------------------------------------------------
-- 1. Inventory valuation report.
-- ---------------------------------------------------------------------------

create or replace function public.get_inventory_report(
  p_branch_id uuid default null,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  search_term text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.has_permission('reports.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_branch_id is not null and not public.is_branch_member(p_branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'summary', jsonb_build_object(
      'branch_count', count(distinct report_row.branch_id)::integer,
      'product_count', count(distinct report_row.product_id)::integer,
      'total_quantity', coalesce(sum(report_row.quantity), 0),
      'total_value', coalesce(sum(report_row.stock_value), 0),
      'low_stock_count', count(*) filter (where report_row.is_low)::integer
    ),
    'rows', coalesce(
      jsonb_agg(
        to_jsonb(report_row)
        order by report_row.branch_name, report_row.product_code
      ),
      '[]'::jsonb
    )
  )
  into result
  from (
    select
      branch.id as branch_id,
      branch.name as branch_name,
      product.id as product_id,
      product.code as product_code,
      product.name as product_name,
      product.unit_name,
      coalesce(stock.quantity, 0) as quantity,
      product.reorder_level,
      product.unit_cost,
      coalesce(stock.quantity, 0) * product.unit_cost as stock_value,
      (
        product.reorder_level > 0
        and coalesce(stock.quantity, 0) <= product.reorder_level
      ) as is_low
    from public.products as product
    join public.branches as branch on branch.is_active
    left join public.product_stock as stock
      on stock.product_id = product.id
     and stock.branch_id = branch.id
    where product.status <> 'archived'
      and public.is_branch_member(branch.id)
      and (p_branch_id is null or branch.id = p_branch_id)
      and (
        search_term is null
        or product.code ilike '%' || search_term || '%'
        or product.name ilike '%' || search_term || '%'
      )
  ) as report_row;

  return coalesce(
    result,
    jsonb_build_object(
      'summary', jsonb_build_object(
        'branch_count', 0,
        'product_count', 0,
        'total_quantity', 0,
        'total_value', 0,
        'low_stock_count', 0
      ),
      'rows', '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_inventory_report(uuid, text) from public, anon;
grant execute on function public.get_inventory_report(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Vehicle register report.
-- ---------------------------------------------------------------------------

create or replace function public.get_vehicles_report(
  p_branch_id uuid default null,
  p_status text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  status_filter text := lower(btrim(coalesce(p_status, 'all')));
begin
  if not public.has_permission('reports.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_branch_id is not null and not public.is_branch_member(p_branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'summary', jsonb_build_object(
      'vehicle_count', count(*)::integer,
      'available_count', count(*) filter (where report_row.status = 'available')::integer,
      'reserved_count', count(*) filter (where report_row.status = 'reserved')::integer,
      'sold_count', count(*) filter (where report_row.status = 'sold')::integer,
      'returned_count', count(*) filter (where report_row.status = 'returned')::integer,
      'maintenance_count', count(*) filter (where report_row.status = 'maintenance')::integer,
      'damaged_count', count(*) filter (where report_row.status = 'damaged')::integer,
      'archived_count', count(*) filter (where report_row.status = 'archived')::integer,
      'total_purchase_price', coalesce(sum(report_row.purchase_price), 0),
      'total_approved_cost', coalesce(sum(report_row.approved_cost), 0),
      'total_suggested_price', coalesce(sum(report_row.suggested_price), 0),
      'expected_margin', coalesce(
        sum(report_row.suggested_price - report_row.approved_cost),
        0
      )
    ),
    'rows', coalesce(
      jsonb_agg(to_jsonb(report_row) order by report_row.vehicle_code),
      '[]'::jsonb
    )
  )
  into result
  from (
    select
      vehicle.id as vehicle_id,
      vehicle.code as vehicle_code,
      vehicle.chassis_no,
      vehicle.engine_no,
      vehicle.vehicle_type,
      vehicle.vehicle_class,
      brand.name as brand_name,
      model.name as model_name,
      vehicle.manufacture_year,
      vehicle.color,
      vehicle.status,
      vehicle.branch_id,
      branch.name as branch_name,
      supplier.full_name as supplier_name,
      vehicle.purchase_date,
      vehicle.purchase_price,
      vehicle.transport_cost,
      vehicle.prep_cost,
      vehicle.approved_cost,
      vehicle.suggested_price,
      vehicle.suggested_price - vehicle.approved_cost as expected_margin
    from public.vehicles as vehicle
    join public.branches as branch on branch.id = vehicle.branch_id
    left join public.product_brands as brand on brand.id = vehicle.brand_id
    left join public.product_models as model on model.id = vehicle.model_id
    left join public.suppliers as supplier on supplier.id = vehicle.supplier_id
    where public.is_branch_member(vehicle.branch_id)
      and (p_branch_id is null or vehicle.branch_id = p_branch_id)
      and (status_filter = 'all' or vehicle.status = status_filter)
  ) as report_row;

  return coalesce(
    result,
    jsonb_build_object(
      'summary', jsonb_build_object(
        'vehicle_count', 0,
        'available_count', 0,
        'reserved_count', 0,
        'sold_count', 0,
        'returned_count', 0,
        'maintenance_count', 0,
        'damaged_count', 0,
        'archived_count', 0,
        'total_purchase_price', 0,
        'total_approved_cost', 0,
        'total_suggested_price', 0,
        'expected_margin', 0
      ),
      'rows', '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_vehicles_report(uuid, text) from public, anon;
grant execute on function public.get_vehicles_report(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Vehicle movement ledger.
-- ---------------------------------------------------------------------------

create or replace function public.list_vehicle_movements(
  p_vehicle_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns table (
  movement_id uuid,
  vehicle_id uuid,
  vehicle_code text,
  chassis_no text,
  movement_type text,
  quantity numeric,
  unit_cost numeric,
  branch_id uuid,
  branch_name text,
  reference_type text,
  reference_id uuid,
  reference_number text,
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
  if not public.has_permission('reports.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    movement.id,
    vehicle.id,
    vehicle.code,
    vehicle.chassis_no,
    movement.movement_type,
    movement.quantity,
    movement.unit_cost,
    movement.branch_id,
    branch.name,
    movement.reference_type,
    movement.reference_id,
    coalesce(invoice.number, transfer.number, count_row.number),
    movement.notes,
    movement.created_at,
    profile.full_name
  from public.stock_movements as movement
  join public.vehicles as vehicle on vehicle.id = movement.vehicle_id
  join public.branches as branch on branch.id = movement.branch_id
  left join public.profiles as profile on profile.id = movement.created_by
  left join public.purchase_invoices as invoice
    on movement.reference_type = 'purchase_invoice'
   and invoice.id = movement.reference_id
  left join public.stock_transfers as transfer
    on movement.reference_type = 'stock_transfer'
   and transfer.id = movement.reference_id
  left join public.stock_counts as count_row
    on movement.reference_type = 'stock_count'
   and count_row.id = movement.reference_id
  where movement.vehicle_id is not null
    and public.is_branch_member(movement.branch_id)
    and (p_vehicle_id is null or movement.vehicle_id = p_vehicle_id)
    and (p_from is null or movement.created_at >= p_from::timestamptz)
    and (p_to is null or movement.created_at < (p_to + 1)::timestamptz)
  order by movement.created_at desc, movement.id;
end;
$$;

revoke all on function public.list_vehicle_movements(uuid, date, date) from public, anon;
grant execute on function public.list_vehicle_movements(uuid, date, date)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Purchases report.
-- ---------------------------------------------------------------------------

create or replace function public.get_purchases_report(
  p_from date default null,
  p_to date default null,
  p_supplier_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.has_permission('reports.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers
    where id = p_supplier_id and public.is_branch_member(branch_id)
  ) then
    raise exception 'supplier_missing' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'summary', jsonb_build_object(
      'invoice_count', count(*)::integer,
      'approved_count', count(*) filter (where report_row.status = 'approved')::integer,
      'draft_count', count(*) filter (where report_row.status = 'draft')::integer,
      'cancelled_count', count(*) filter (where report_row.status = 'cancelled')::integer,
      'supplier_count', count(distinct report_row.supplier_id)::integer,
      'approved_total', coalesce(
        sum(report_row.total) filter (where report_row.status = 'approved'),
        0
      ),
      'paid_total', coalesce(
        sum(report_row.paid_amount) filter (where report_row.status = 'approved'),
        0
      ),
      'remaining_total', coalesce(
        sum(report_row.total - report_row.paid_amount) filter (where report_row.status = 'approved'),
        0
      ),
      'draft_total', coalesce(
        sum(report_row.total) filter (where report_row.status = 'draft'),
        0
      )
    ),
    'by_supplier', coalesce(
      (
        select jsonb_agg(to_jsonb(supplier_row) order by supplier_row.total desc)
        from (
          select
            report_row.supplier_id,
            report_row.supplier_code,
            report_row.supplier_name,
            count(*)::integer as invoice_count,
            coalesce(sum(report_row.total), 0) as total,
            coalesce(sum(report_row.paid_amount), 0) as paid_amount,
            coalesce(sum(report_row.total - report_row.paid_amount), 0) as remaining_amount
          from (
            select
              invoice.supplier_id,
              supplier.code as supplier_code,
              supplier.full_name as supplier_name,
              invoice.total,
              invoice.paid_amount,
              invoice.status
            from public.purchase_invoices as invoice
            join public.suppliers as supplier on supplier.id = invoice.supplier_id
            where invoice.status = 'approved'
              and public.is_branch_member(invoice.branch_id)
              and (p_from is null or invoice.invoice_date >= p_from)
              and (p_to is null or invoice.invoice_date <= p_to)
              and (p_supplier_id is null or invoice.supplier_id = p_supplier_id)
          ) as report_row
          group by report_row.supplier_id, report_row.supplier_code, report_row.supplier_name
        ) as supplier_row
      ),
      '[]'::jsonb
    ),
    'invoices', coalesce(
      (
        select jsonb_agg(to_jsonb(invoice_row) order by invoice_row.invoice_date desc, invoice_row.number desc)
        from (
          select
            invoice.id,
            invoice.number,
            invoice.invoice_date,
            invoice.status,
            invoice.payment_method,
            invoice.supplier_id,
            supplier.code as supplier_code,
            supplier.full_name as supplier_name,
            branch.name as branch_name,
            invoice.total,
            invoice.paid_amount,
            invoice.remaining_amount,
            invoice.approved_at
          from public.purchase_invoices as invoice
          join public.suppliers as supplier on supplier.id = invoice.supplier_id
          join public.branches as branch on branch.id = invoice.branch_id
          where public.is_branch_member(invoice.branch_id)
            and (p_from is null or invoice.invoice_date >= p_from)
            and (p_to is null or invoice.invoice_date <= p_to)
            and (p_supplier_id is null or invoice.supplier_id = p_supplier_id)
        ) as invoice_row
      ),
      '[]'::jsonb
    )
  )
  into result
  from (
    select
      invoice.id,
      invoice.number,
      invoice.invoice_date,
      invoice.status,
      invoice.supplier_id,
      supplier.code as supplier_code,
      supplier.full_name as supplier_name,
      invoice.total,
      invoice.paid_amount
    from public.purchase_invoices as invoice
    join public.suppliers as supplier on supplier.id = invoice.supplier_id
    where public.is_branch_member(invoice.branch_id)
      and (p_from is null or invoice.invoice_date >= p_from)
      and (p_to is null or invoice.invoice_date <= p_to)
      and (p_supplier_id is null or invoice.supplier_id = p_supplier_id)
  ) as report_row;

  return coalesce(
    result,
    jsonb_build_object(
      'summary', jsonb_build_object(
        'invoice_count', 0,
        'approved_count', 0,
        'draft_count', 0,
        'cancelled_count', 0,
        'supplier_count', 0,
        'approved_total', 0,
        'paid_total', 0,
        'remaining_total', 0,
        'draft_total', 0
      ),
      'by_supplier', '[]'::jsonb,
      'invoices', '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_purchases_report(date, date, uuid) from public, anon;
grant execute on function public.get_purchases_report(date, date, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Vehicle cost breakdown (purchase -> approved cost).
-- ---------------------------------------------------------------------------

create or replace function public.get_vehicle_cost_breakdown(p_vehicle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  vehicle_row public.vehicles;
  branch_row public.branches;
  supplier_row public.suppliers;
  purchase_line record;
  has_purchase boolean := false;
  allocated_transport numeric := 0;
  allocated_prep numeric := 0;
  landed_cost numeric := 0;
  recomputed_cost numeric := 0;
begin
  if not public.has_permission('reports.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into vehicle_row from public.vehicles where id = p_vehicle_id;

  if not found then
    raise exception 'vehicle_missing' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(vehicle_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into branch_row from public.branches where id = vehicle_row.branch_id;
  select * into supplier_row from public.suppliers where id = vehicle_row.supplier_id;

  -- The latest approved purchase line for this vehicle is the cost source.
  select
    item.allocated_transport,
    item.allocated_prep,
    item.landed_unit_cost,
    invoice.id as invoice_id,
    invoice.number,
    invoice.invoice_date,
    invoice.status
  into purchase_line
  from public.purchase_invoice_items as item
  join public.purchase_invoices as invoice on invoice.id = item.invoice_id
  where item.vehicle_id = p_vehicle_id
    and invoice.status = 'approved'
  order by invoice.approved_at desc nulls last, invoice.number desc
  limit 1;

  has_purchase := found;

  if has_purchase then
    allocated_transport := coalesce(purchase_line.allocated_transport, 0);
    allocated_prep := coalesce(purchase_line.allocated_prep, 0);
    landed_cost := coalesce(purchase_line.landed_unit_cost, 0);
    recomputed_cost := vehicle_row.purchase_price + allocated_transport + allocated_prep;
  else
    recomputed_cost :=
      vehicle_row.purchase_price + vehicle_row.transport_cost + vehicle_row.prep_cost;
  end if;

  return jsonb_build_object(
    'vehicle', to_jsonb(vehicle_row) || jsonb_build_object(
      'branch_name', branch_row.name,
      'supplier_name', supplier_row.full_name
    ),
    'purchase', case
      when not has_purchase then null
      else jsonb_build_object(
        'invoice_id', purchase_line.invoice_id,
        'number', purchase_line.number,
        'invoice_date', purchase_line.invoice_date,
        'status', purchase_line.status,
        'supplier_name', supplier_row.full_name,
        'purchase_price', vehicle_row.purchase_price,
        'allocated_transport', allocated_transport,
        'allocated_prep', allocated_prep,
        'landed_unit_cost', landed_cost
      )
    end,
    'direct_costs', jsonb_build_object(
      'transport_cost', vehicle_row.transport_cost,
      'prep_cost', vehicle_row.prep_cost
    ),
    'recomputed_cost', recomputed_cost,
    'approved_cost', vehicle_row.approved_cost,
    'difference', vehicle_row.approved_cost - recomputed_cost
  );
end;
$$;

revoke all on function public.get_vehicle_cost_breakdown(uuid) from public, anon;
grant execute on function public.get_vehicle_cost_breakdown(uuid)
  to authenticated, service_role;
