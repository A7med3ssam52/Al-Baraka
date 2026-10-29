-- M4.6 — Sale void and sales returns.

-- ---------------------------------------------------------------------------
-- 1. sales_returns tables.
-- ---------------------------------------------------------------------------

create table if not exists public.sales_returns (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  sales_invoice_id uuid not null references public.sales_invoices (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  branch_id uuid not null references public.branches (id) on delete restrict,
  return_date date not null default current_date,
  reason text,
  total_amount numeric(14, 2) not null default 0 check (total_amount >= 0),
  refund_amount numeric(14, 2) not null default 0 check (refund_amount >= 0),
  credit_amount numeric(14, 2) not null default 0 check (credit_amount >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'cancelled')),
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create table if not exists public.sales_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.sales_returns (id) on delete cascade,
  sales_invoice_item_id uuid references public.sales_invoice_items (id) on delete restrict,
  product_id uuid references public.products (id) on delete restrict,
  vehicle_id uuid references public.vehicles (id) on delete restrict,
  quantity numeric(14, 2) not null check (quantity > 0),
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0),
  line_total numeric(14, 2) not null default 0 check (line_total >= 0),
  unique (return_id, sales_invoice_item_id),
  check (num_nonnulls(product_id, vehicle_id) = 1)
);

create index if not exists sales_returns_invoice_idx on public.sales_returns (sales_invoice_id);
create index if not exists sales_returns_branch_status_idx on public.sales_returns (branch_id, status);

-- number sequence
insert into public.code_sequences (entity, prefix, padding)
values ('sales_return', 'SRT', 5)
on conflict (entity) do nothing;

-- RLS
alter table public.sales_returns enable row level security;
drop policy if exists sales_returns_select_authorized on public.sales_returns;
create policy sales_returns_select_authorized
on public.sales_returns
for select
to authenticated
using (
  public.has_permission('sales.view')
  and public.is_branch_member(branch_id)
);
revoke all on public.sales_returns from authenticated, anon;
grant select on public.sales_returns to authenticated;

alter table public.sales_return_items enable row level security;
drop policy if exists sales_return_items_select_authorized on public.sales_return_items;
create policy sales_return_items_select_authorized
on public.sales_return_items
for select
to authenticated
using (
  public.has_permission('sales.view')
  and exists (
    select 1 from public.sales_returns as r
    where r.id = sales_return_items.return_id
      and public.is_branch_member(r.branch_id)
  )
);
revoke all on public.sales_return_items from authenticated, anon;
grant select on public.sales_return_items to authenticated;

-- ---------------------------------------------------------------------------
-- 2. void_sale (cancel an approved sale with reversal).
-- ---------------------------------------------------------------------------

create or replace function public.void_sale(p_invoice_id uuid, p_reason text default null)
returns public.sales_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invoice_row public.sales_invoices;
begin
  if not public.has_permission('sales.cancel') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into invoice_row
  from public.sales_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_missing' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(invoice_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if invoice_row.status = 'cancelled' then
    raise exception 'invoice_already_cancelled' using errcode = 'P0001';
  end if;

  if invoice_row.status = 'draft' then
    -- just cancel the draft
    update public.sales_invoices
    set status = 'cancelled',
        notes = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), notes),
        cancelled_at = now(),
        cancelled_by = auth.uid(),
        updated_at = now(),
        updated_by = auth.uid()
    where id = p_invoice_id
    returning * into invoice_row;
    return invoice_row;
  end if;

  -- approved sale: reverse stock + vehicle + journal
  -- mark invoice cancelled (reversal journal entry would be added in M8)
  update public.sales_invoices
  set status = 'cancelled',
      notes = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), notes),
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_invoice_id
  returning * into invoice_row;

  -- return vehicles to available
  update public.vehicles
  set status = 'available', updated_at = now(), updated_by = auth.uid()
  where id in (
    select vehicle_id from public.sales_invoice_items
    where invoice_id = p_invoice_id and vehicle_id is not null
  );

  return invoice_row;
end;
$$;

revoke all on function public.void_sale(uuid, text) from public, anon;
grant execute on function public.void_sale(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Audit.
-- ---------------------------------------------------------------------------

drop trigger if exists audit_sales_returns_change on public.sales_returns;
create trigger audit_sales_returns_change
after insert or update or delete on public.sales_returns
for each row execute function public.audit_row_change();

drop trigger if exists audit_sales_return_items_change on public.sales_return_items;
create trigger audit_sales_return_items_change
after insert or update or delete on public.sales_return_items
for each row execute function public.audit_row_change();
