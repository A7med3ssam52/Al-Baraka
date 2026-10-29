-- M3.6 — Supplier profile, statement, and printable purchase invoice.
--
-- The supplier ledger built in M3.4/M3.5 is the single source of truth for the
-- balance shown on the supplier profile. This migration exposes it as:
--   get_supplier_profile  -> header + totals + invoice list for the profile tab
--   list_supplier_statement -> dated ledger with a running balance
--   get_purchase_invoice_print -> everything a printable sheet needs
-- All three are branch-scoped and permission-checked; nothing is written here.

-- ---------------------------------------------------------------------------
-- 1. Supplier profile (totals + invoices).
-- ---------------------------------------------------------------------------

create or replace function public.get_supplier_profile(p_supplier_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  supplier_row public.suppliers;
  invoice_total numeric;
  paid_total numeric;
  balance numeric;
  invoice_count integer;
  last_invoice_date date;
begin
  if not public.has_permission('suppliers.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into supplier_row from public.suppliers where id = p_supplier_id;

  if not found then
    raise exception 'supplier_missing' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(supplier_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select
    coalesce(sum(entry.amount) filter (where entry.transaction_type = 'invoice'), 0),
    coalesce(-sum(entry.amount) filter (where entry.transaction_type = 'payment'), 0),
    coalesce(sum(entry.amount), 0)
  into invoice_total, paid_total, balance
  from public.supplier_transactions as entry
  where entry.supplier_id = p_supplier_id
    and public.is_branch_member(entry.branch_id);

  select count(*)::integer, max(invoice.invoice_date)
  into invoice_count, last_invoice_date
  from public.purchase_invoices as invoice
  where invoice.supplier_id = p_supplier_id
    and public.is_branch_member(invoice.branch_id);

  return jsonb_build_object(
    'supplier', to_jsonb(supplier_row) || jsonb_build_object(
      'branch_name', (select name from public.branches where id = supplier_row.branch_id)
    ),
    'totals', jsonb_build_object(
      'invoice_count', invoice_count,
      'invoiced_total', invoice_total,
      'paid_total', paid_total,
      'balance', balance,
      'last_invoice_date', last_invoice_date
    ),
    'invoices', coalesce(
      (
        select jsonb_agg(to_jsonb(list_row) order by list_row.invoice_date desc, list_row.number desc)
        from (
          select
            invoice.id,
            invoice.number,
            invoice.invoice_date,
            invoice.status,
            invoice.payment_method,
            invoice.total,
            invoice.paid_amount,
            invoice.remaining_amount,
            invoice.document_id,
            (select count(*)::integer
             from public.purchase_invoice_items as item
             where item.invoice_id = invoice.id) as item_count
          from public.purchase_invoices as invoice
          where invoice.supplier_id = p_supplier_id
            and public.is_branch_member(invoice.branch_id)
        ) as list_row
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_supplier_profile(uuid) from public, anon;
grant execute on function public.get_supplier_profile(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Supplier statement with a running balance.
-- ---------------------------------------------------------------------------

create or replace function public.list_supplier_statement(
  p_supplier_id uuid,
  p_from date default null,
  p_to date default null
)
returns table (
  transaction_id uuid,
  transaction_date date,
  transaction_type text,
  reference_type text,
  reference_id uuid,
  reference_number text,
  description text,
  debit numeric,
  credit numeric,
  running_balance numeric,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('suppliers.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.suppliers
    where id = p_supplier_id and public.is_branch_member(branch_id)
  ) then
    raise exception 'supplier_missing' using errcode = 'P0001';
  end if;

  return query
  select
    entry.id,
    entry.transaction_date,
    entry.transaction_type,
    entry.reference_type,
    entry.reference_id,
    coalesce(invoice.number, document.doc_number),
    coalesce(
      entry.notes,
      case entry.transaction_type
        when 'invoice' then 'فاتورة شراء'
        when 'payment' then 'سداد مورد'
        when 'return' then 'مرتجع إلى المورد'
        else 'تسوية مورد'
      end
    ),
    greatest(-entry.amount, 0),
    greatest(entry.amount, 0),
    sum(entry.amount) over (
      order by entry.transaction_date, entry.created_at,
        case entry.transaction_type
          when 'invoice' then 0
          when 'return' then 1
          when 'adjustment' then 2
          else 3
        end,
        entry.id
      rows between unbounded preceding and current row
    ),
    entry.created_at
  from public.supplier_transactions as entry
  left join public.purchase_invoices as invoice
    on entry.reference_type = 'purchase_invoice' and invoice.id = entry.reference_id
  left join public.documents as document
    on entry.reference_type = 'document' and document.id = entry.reference_id
  where entry.supplier_id = p_supplier_id
    and public.is_branch_member(entry.branch_id)
    and (p_from is null or entry.transaction_date >= p_from)
    and (p_to is null or entry.transaction_date <= p_to)
  order by entry.transaction_date, entry.created_at,
    case entry.transaction_type
      when 'invoice' then 0
      when 'return' then 1
      when 'adjustment' then 2
      else 3
    end,
    entry.id;
end;
$$;

revoke all on function public.list_supplier_statement(uuid, date, date) from public, anon;
grant execute on function public.list_supplier_statement(uuid, date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Printable purchase invoice (header, supplier, branch, items, settings).
-- ---------------------------------------------------------------------------

create or replace function public.get_purchase_invoice_print(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  invoice_row public.purchase_invoices;
  supplier_row public.suppliers;
  branch_row public.branches;
  settings_row public.system_settings;
  items jsonb;
  document_row jsonb;
begin
  if not public.has_permission('purchases.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into invoice_row from public.purchase_invoices where id = p_invoice_id;

  if not found then
    raise exception 'invoice_missing' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(invoice_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into supplier_row from public.suppliers where id = invoice_row.supplier_id;
  select * into branch_row from public.branches where id = invoice_row.branch_id;
  select * into settings_row from public.system_settings where id;

  select to_jsonb(document) into document_row
  from public.documents as document
  where document.id = invoice_row.document_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'line_no', item.line_no,
        'product_id', item.product_id,
        'vehicle_id', item.vehicle_id,
        'description', coalesce(
          item.description,
          product.name,
          vehicle.code || ' — ' || vehicle.chassis_no
        ),
        'code', coalesce(product.code, vehicle.code),
        'quantity', item.quantity,
        'unit_price', item.unit_price,
        'discount', item.discount,
        'line_total', item.line_total,
        'allocated_transport', item.allocated_transport,
        'allocated_prep', item.allocated_prep,
        'landed_unit_cost', item.landed_unit_cost
      )
      order by item.line_no
    ),
    '[]'::jsonb
  )
  into items
  from public.purchase_invoice_items as item
  left join public.products as product on product.id = item.product_id
  left join public.vehicles as vehicle on vehicle.id = item.vehicle_id
  where item.invoice_id = p_invoice_id;

  return jsonb_build_object(
    'invoice', to_jsonb(invoice_row),
    'supplier', to_jsonb(supplier_row),
    'branch', to_jsonb(branch_row),
    'settings', to_jsonb(settings_row),
    'document', document_row,
    'items', items
  );
end;
$$;

revoke all on function public.get_purchase_invoice_print(uuid) from public, anon;
grant execute on function public.get_purchase_invoice_print(uuid) to authenticated, service_role;
