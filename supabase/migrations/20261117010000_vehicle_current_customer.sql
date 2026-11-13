-- 20261117 — Link vehicles to their current customer («المالك الحالي»).
--
-- vehicles.current_customer_id is maintained automatically, with no changes
-- to the approval/void/return functions:
--
--   * A trigger on sales_invoices sets the owner when an invoice transitions
--     draft -> approved. Both cash sales (approve_sales_invoice) and installment
--     contracts (approve_contract, which approves its invoice in the same
--     transaction) go through this path.
--   * A trigger on vehicles clears the owner whenever the vehicle leaves the
--     'sold' status (void sale, cancel contract, manual status change back to
--     available/returned/damaged/...).
--
-- One-off backfill for vehicles that are 'sold' at migration time.

alter table public.vehicles
  add column if not exists current_customer_id uuid references public.customers (id) on delete set null;

create index if not exists vehicles_current_customer_idx
  on public.vehicles (current_customer_id)
  where current_customer_id is not null;

create or replace function public.sync_vehicle_current_customer_on_sale()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'draft' and new.status = 'approved' then
    update public.vehicles v
    set current_customer_id = new.customer_id,
        updated_at = now()
    where v.id in (
      select vehicle_id
      from public.sales_invoice_items
      where invoice_id = new.id
        and vehicle_id is not null
    );
  end if;
  return new;
end;
$$;

drop trigger if exists sync_vehicle_current_customer_on_sale on public.sales_invoices;
create trigger sync_vehicle_current_customer_on_sale
after update of status on public.sales_invoices
for each row execute function public.sync_vehicle_current_customer_on_sale();

create or replace function public.clear_vehicle_customer_on_restock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from 'sold' then
    new.current_customer_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_vehicle_customer_on_restock on public.vehicles;
create trigger clear_vehicle_customer_on_restock
before update of status on public.vehicles
for each row execute function public.clear_vehicle_customer_on_restock();

-- Backfill: current owner = the customer of the vehicle's most recent approved sale.
update public.vehicles v
set current_customer_id = owner.customer_id
from (
  select distinct on (item.vehicle_id)
    item.vehicle_id,
    inv.customer_id
  from public.sales_invoice_items item
  join public.sales_invoices inv on inv.id = item.invoice_id
  where item.vehicle_id is not null
    and inv.status = 'approved'
  order by item.vehicle_id, inv.invoice_date desc, inv.approved_at desc nulls last, inv.number desc
) as owner
where v.id = owner.vehicle_id
  and v.status = 'sold';
