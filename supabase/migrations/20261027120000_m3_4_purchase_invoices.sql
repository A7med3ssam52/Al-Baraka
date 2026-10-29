-- M3.4 — Purchase invoices (draft side).
--
-- A purchase invoice is a supplier document with product/vehicle lines, an
-- invoice-level discount, and direct transport/prep costs that are allocated
-- across the lines proportionally to their value. The invoice stays a draft
-- until M3.5 approves it atomically (stock, vehicle cost, supplier ledger,
-- cashbox/bank and journal entry).
--
-- The supplier ledger is introduced here so the balance always has a single
-- source of truth: positive amounts increase what we owe the supplier.

-- ---------------------------------------------------------------------------
-- 1. Invoice number sequence (PINV-00001).
-- ---------------------------------------------------------------------------

insert into public.code_sequences (entity, prefix, padding)
values ('purchase_invoice', 'PINV', 5)
on conflict (entity) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables.
-- ---------------------------------------------------------------------------

create table if not exists public.purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  branch_id uuid not null references public.branches (id) on delete restrict,
  invoice_date date not null default current_date,
  supplier_reference text,
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  discount numeric(14, 2) not null default 0 check (discount >= 0),
  transport_cost numeric(14, 2) not null default 0 check (transport_cost >= 0),
  prep_cost numeric(14, 2) not null default 0 check (prep_cost >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  remaining_amount numeric(14, 2) not null default 0 check (remaining_amount >= 0),
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'bank', 'credit')),
  cashbox_id uuid references public.cashboxes (id) on delete restrict,
  bank_account_id uuid references public.bank_accounts (id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'cancelled')),
  document_id uuid references public.documents (id) on delete set null,
  notes text,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  check (paid_amount <= total),
  check (num_nonnulls(cashbox_id, bank_account_id) <= 1),
  check (payment_method <> 'cash' or bank_account_id is null),
  check (payment_method <> 'bank' or cashbox_id is null)
);

create index if not exists purchase_invoices_supplier_idx
  on public.purchase_invoices (supplier_id, invoice_date desc);
create index if not exists purchase_invoices_branch_status_idx
  on public.purchase_invoices (branch_id, status, invoice_date desc);

create table if not exists public.purchase_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.purchase_invoices (id) on delete cascade,
  line_no smallint not null check (line_no > 0),
  product_id uuid references public.products (id) on delete restrict,
  vehicle_id uuid references public.vehicles (id) on delete restrict,
  description text,
  quantity numeric(14, 2) not null check (quantity > 0),
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0),
  discount numeric(14, 2) not null default 0 check (discount >= 0),
  line_total numeric(14, 2) not null default 0 check (line_total >= 0),
  allocated_transport numeric(14, 2) not null default 0 check (allocated_transport >= 0),
  allocated_prep numeric(14, 2) not null default 0 check (allocated_prep >= 0),
  landed_unit_cost numeric(14, 2) not null default 0 check (landed_unit_cost >= 0),
  unique (invoice_id, line_no),
  check (num_nonnulls(product_id, vehicle_id) = 1)
);

create index if not exists purchase_invoice_items_invoice_idx
  on public.purchase_invoice_items (invoice_id, line_no);
create index if not exists purchase_invoice_items_product_idx
  on public.purchase_invoice_items (product_id);
create index if not exists purchase_invoice_items_vehicle_idx
  on public.purchase_invoice_items (vehicle_id);

create table if not exists public.supplier_transactions (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  branch_id uuid not null references public.branches (id) on delete restrict,
  transaction_type text not null
    check (transaction_type in ('invoice', 'payment', 'return', 'adjustment')),
  transaction_date date not null default current_date,
  amount numeric(14, 2) not null check (amount <> 0),
  reference_type text,
  reference_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create index if not exists supplier_transactions_supplier_idx
  on public.supplier_transactions (supplier_id, transaction_date desc);
create index if not exists supplier_transactions_reference_idx
  on public.supplier_transactions (reference_type, reference_id);

-- ---------------------------------------------------------------------------
-- 3. RLS.
-- ---------------------------------------------------------------------------

alter table public.purchase_invoices enable row level security;

drop policy if exists purchase_invoices_select_authorized on public.purchase_invoices;
create policy purchase_invoices_select_authorized
on public.purchase_invoices
for select
to authenticated
using (
  public.has_permission('purchases.view')
  and public.is_branch_member(branch_id)
);

revoke all on public.purchase_invoices from authenticated, anon;
grant select on public.purchase_invoices to authenticated;

alter table public.purchase_invoice_items enable row level security;

drop policy if exists purchase_invoice_items_select_authorized on public.purchase_invoice_items;
create policy purchase_invoice_items_select_authorized
on public.purchase_invoice_items
for select
to authenticated
using (
  public.has_permission('purchases.view')
  and exists (
    select 1
    from public.purchase_invoices as invoice
    where invoice.id = purchase_invoice_items.invoice_id
      and public.is_branch_member(invoice.branch_id)
  )
);

revoke all on public.purchase_invoice_items from authenticated, anon;
grant select on public.purchase_invoice_items to authenticated;

alter table public.supplier_transactions enable row level security;

drop policy if exists supplier_transactions_select_authorized on public.supplier_transactions;
create policy supplier_transactions_select_authorized
on public.supplier_transactions
for select
to authenticated
using (
  public.has_permission('suppliers.view')
  and public.is_branch_member(branch_id)
);

revoke all on public.supplier_transactions from authenticated, anon;
grant select on public.supplier_transactions to authenticated;

-- ---------------------------------------------------------------------------
-- 4. save_purchase_invoice (create or replace a draft).
-- ---------------------------------------------------------------------------

create or replace function public.save_purchase_invoice(
  p_supplier_id uuid,
  p_items jsonb,
  p_invoice_id uuid default null,
  p_invoice_date date default current_date,
  p_discount numeric default 0,
  p_transport_cost numeric default 0,
  p_prep_cost numeric default 0,
  p_payment_method text default 'cash',
  p_paid_amount numeric default 0,
  p_notes text default null,
  p_supplier_reference text default null,
  p_cashbox_id uuid default null,
  p_bank_account_id uuid default null
)
returns public.purchase_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_branch uuid := public.current_branch();
  method text := lower(btrim(coalesce(p_payment_method, 'cash')));
  clean_discount numeric := coalesce(p_discount, 0);
  clean_transport numeric := coalesce(p_transport_cost, 0);
  clean_prep numeric := coalesce(p_prep_cost, 0);
  clean_paid numeric := coalesce(p_paid_amount, 0);
  item_count integer;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  line record;
  line_index integer := 0;
  running_transport numeric := 0;
  running_prep numeric := 0;
  line_transport numeric;
  line_prep numeric;
  line_qty numeric;
  line_price numeric;
  line_discount numeric;
  line_total numeric;
  product_id_value uuid;
  vehicle_id_value uuid;
  target_cashbox uuid;
  target_bank uuid;
  existing public.purchase_invoices;
  new_row public.purchase_invoices;
begin
  if p_invoice_id is null then
    if not public.has_permission('purchases.create') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  else
    if not public.has_permission('purchases.update') then
      raise exception 'forbidden' using errcode = '42501';
    end if;

    select * into existing from public.purchase_invoices where id = p_invoice_id;

    if not found then
      raise exception 'invoice_missing' using errcode = 'P0001';
    end if;

    if existing.status <> 'draft' then
      raise exception 'invoice_not_draft' using errcode = 'P0001';
    end if;

    if not public.is_branch_member(existing.branch_id) then
      raise exception 'forbidden' using errcode = '42501';
    end if;

    target_branch := existing.branch_id;
  end if;

  if target_branch is null then
    raise exception 'invalid_branch' using errcode = '22023';
  end if;

  if not public.is_branch_member(target_branch) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_supplier_id is null or not exists (
    select 1 from public.suppliers
    where id = p_supplier_id and status = 'active'
  ) then
    raise exception 'supplier_missing' using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_invoice_items' using errcode = '22023';
  end if;

  item_count := jsonb_array_length(p_items);

  if item_count < 1 or item_count > 50 then
    raise exception 'invalid_invoice_items' using errcode = '22023';
  end if;

  if method not in ('cash', 'bank', 'credit') then
    raise exception 'invalid_payment_method' using errcode = '22023';
  end if;

  if clean_discount < 0 or clean_transport < 0 or clean_prep < 0 or clean_paid < 0 then
    raise exception 'invalid_invoice_numbers' using errcode = '22023';
  end if;

  -- First pass: validate the lines and compute the subtotal.
  for line in select value from jsonb_array_elements(p_items) loop
    line_index := line_index + 1;

    product_id_value := nullif(btrim(coalesce(line.value ->> 'product_id', '')), '')::uuid;
    vehicle_id_value := nullif(btrim(coalesce(line.value ->> 'vehicle_id', '')), '')::uuid;

    if num_nonnulls(product_id_value, vehicle_id_value) <> 1 then
      raise exception 'invalid_invoice_item_target' using errcode = '22023';
    end if;

    line_qty := coalesce((line.value ->> 'quantity')::numeric, 0);
    line_price := coalesce((line.value ->> 'unit_price')::numeric, 0);
    line_discount := coalesce((line.value ->> 'discount')::numeric, 0);
    line_total := round(line_qty * line_price, 2) - line_discount;

    if line_qty <= 0 or line_price < 0 or line_discount < 0 or line_total < 0 then
      raise exception 'invalid_invoice_item_numbers' using errcode = '22023';
    end if;

    if product_id_value is not null and not exists (
      select 1 from public.products where id = product_id_value and status <> 'archived'
    ) then
      raise exception 'product_missing' using errcode = 'P0001';
    end if;

    if vehicle_id_value is not null then
      if not exists (
        select 1 from public.vehicles
        where id = vehicle_id_value
          and branch_id = target_branch
          and status in ('available', 'reserved', 'maintenance', 'damaged')
      ) then
        raise exception 'vehicle_unavailable' using errcode = 'P0001';
      end if;
    end if;

    v_subtotal := v_subtotal + line_total;
  end loop;

  v_subtotal := round(v_subtotal, 2);

  if clean_discount > v_subtotal then
    raise exception 'invalid_invoice_discount' using errcode = '22023';
  end if;

  v_total := round(v_subtotal - clean_discount + clean_transport + clean_prep, 2);

  if clean_paid > v_total then
    raise exception 'invalid_invoice_numbers' using errcode = '22023';
  end if;

  if method = 'credit' and clean_paid <> 0 then
    raise exception 'invalid_payment_method' using errcode = '22023';
  end if;

  target_cashbox := null;
  target_bank := null;

  if method = 'cash' then
    target_cashbox := p_cashbox_id;

    if target_cashbox is null then
      select id into target_cashbox
      from public.cashboxes
      where branch_id = target_branch and is_default and is_active
      limit 1;
    end if;

    if target_cashbox is null or not exists (
      select 1 from public.cashboxes
      where id = target_cashbox and branch_id = target_branch and is_active
    ) then
      raise exception 'cashbox_missing' using errcode = 'P0001';
    end if;
  elsif method = 'bank' then
    target_bank := p_bank_account_id;

    if target_bank is null or not exists (
      select 1 from public.bank_accounts
      where id = target_bank and branch_id = target_branch and is_active
    ) then
      raise exception 'bank_account_missing' using errcode = 'P0001';
    end if;
  end if;

  if p_invoice_id is null then
    insert into public.purchase_invoices (
      number, supplier_id, branch_id, invoice_date, supplier_reference,
      subtotal, discount, transport_cost, prep_cost, total, paid_amount,
      remaining_amount, payment_method, cashbox_id, bank_account_id,
      status, notes, created_by, updated_by
    )
    values (
      public.next_entity_code('purchase_invoice'), p_supplier_id, target_branch,
      coalesce(p_invoice_date, current_date),
      nullif(btrim(coalesce(p_supplier_reference, '')), ''),
      v_subtotal, clean_discount, clean_transport, clean_prep, v_total, clean_paid,
      v_total - clean_paid, method, target_cashbox, target_bank,
      'draft', nullif(btrim(coalesce(p_notes, '')), ''), auth.uid(), auth.uid()
    )
    returning * into new_row;
  else
    update public.purchase_invoices
    set supplier_id = p_supplier_id,
        invoice_date = coalesce(p_invoice_date, invoice_date),
        supplier_reference = nullif(btrim(coalesce(p_supplier_reference, '')), ''),
        subtotal = v_subtotal,
        discount = clean_discount,
        transport_cost = clean_transport,
        prep_cost = clean_prep,
        total = v_total,
        paid_amount = clean_paid,
        remaining_amount = v_total - clean_paid,
        payment_method = method,
        cashbox_id = target_cashbox,
        bank_account_id = target_bank,
        notes = nullif(btrim(coalesce(p_notes, '')), ''),
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_invoice_id
    returning * into new_row;

    delete from public.purchase_invoice_items where invoice_id = p_invoice_id;
  end if;

  -- Second pass: insert the lines with proportional direct-cost allocation.
  line_index := 0;
  running_transport := 0;
  running_prep := 0;

  for line in select value from jsonb_array_elements(p_items) loop
    line_index := line_index + 1;

    product_id_value := nullif(btrim(coalesce(line.value ->> 'product_id', '')), '')::uuid;
    vehicle_id_value := nullif(btrim(coalesce(line.value ->> 'vehicle_id', '')), '')::uuid;
    line_qty := coalesce((line.value ->> 'quantity')::numeric, 0);
    line_price := coalesce((line.value ->> 'unit_price')::numeric, 0);
    line_discount := coalesce((line.value ->> 'discount')::numeric, 0);
    line_total := round(line_qty * line_price, 2) - line_discount;

    if v_subtotal > 0 then
      line_transport := round(clean_transport * line_total / v_subtotal, 2);
      line_prep := round(clean_prep * line_total / v_subtotal, 2);
    else
      line_transport := 0;
      line_prep := 0;
    end if;

    running_transport := running_transport + line_transport;
    running_prep := running_prep + line_prep;

    -- The last line absorbs the rounding remainder.
    if line_index = item_count then
      line_transport := clean_transport - (running_transport - line_transport);
      line_prep := clean_prep - (running_prep - line_prep);
    end if;

    insert into public.purchase_invoice_items (
      invoice_id, line_no, product_id, vehicle_id, description,
      quantity, unit_price, discount, line_total,
      allocated_transport, allocated_prep, landed_unit_cost
    )
    values (
      new_row.id, line_index, product_id_value, vehicle_id_value,
      nullif(btrim(coalesce(line.value ->> 'description', '')), ''),
      line_qty, line_price, line_discount, line_total,
      line_transport, line_prep,
      round((line_total + line_transport + line_prep) / line_qty, 2)
    );
  end loop;

  return new_row;
end;
$$;

revoke all on function public.save_purchase_invoice(uuid, jsonb, uuid, date, numeric, numeric, numeric, text, numeric, text, text, uuid, uuid)
  from public, anon;
grant execute on function public.save_purchase_invoice(uuid, jsonb, uuid, date, numeric, numeric, numeric, text, numeric, text, text, uuid, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. cancel_purchase_invoice (drafts only; approved reversals land in M3.5).
-- ---------------------------------------------------------------------------

create or replace function public.cancel_purchase_invoice(
  p_invoice_id uuid,
  p_reason text default null
)
returns public.purchase_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.purchase_invoices;
begin
  if not public.has_permission('purchases.cancel') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into current_row from public.purchase_invoices where id = p_invoice_id;

  if not found then
    raise exception 'invoice_missing' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(current_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if current_row.status <> 'draft' then
    raise exception 'invoice_not_draft' using errcode = 'P0001';
  end if;

  update public.purchase_invoices
  set status = 'cancelled',
      notes = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), notes),
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_invoice_id
  returning * into current_row;

  return current_row;
end;
$$;

revoke all on function public.cancel_purchase_invoice(uuid, text) from public, anon;
grant execute on function public.cancel_purchase_invoice(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Attach the unified document component.
-- ---------------------------------------------------------------------------

create or replace function public.set_purchase_invoice_document(
  p_invoice_id uuid,
  p_document_id uuid
)
returns public.purchase_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.purchase_invoices;
begin
  if not public.has_permission('purchases.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into current_row from public.purchase_invoices where id = p_invoice_id;

  if not found then
    raise exception 'invoice_missing' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(current_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_document_id is not null and not exists (
    select 1 from public.documents
    where id = p_document_id
      and owner_type = 'supplier'
      and supplier_id = current_row.supplier_id
  ) then
    raise exception 'document_mismatch' using errcode = 'P0001';
  end if;

  update public.purchase_invoices
  set document_id = p_document_id,
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_invoice_id
  returning * into current_row;

  return current_row;
end;
$$;

revoke all on function public.set_purchase_invoice_document(uuid, uuid) from public, anon;
grant execute on function public.set_purchase_invoice_document(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. list_purchase_invoices + get_purchase_invoice.
-- ---------------------------------------------------------------------------

create or replace function public.list_purchase_invoices(
  p_status text default 'all',
  p_supplier_id uuid default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  number text,
  supplier_id uuid,
  supplier_name text,
  branch_id uuid,
  branch_name text,
  invoice_date date,
  subtotal numeric,
  discount numeric,
  transport_cost numeric,
  prep_cost numeric,
  total numeric,
  paid_amount numeric,
  remaining_amount numeric,
  payment_method text,
  status text,
  item_count integer,
  document_id uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('purchases.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    invoice.id, invoice.number, invoice.supplier_id, supplier.full_name,
    invoice.branch_id, branch.name,
    invoice.invoice_date, invoice.subtotal, invoice.discount,
    invoice.transport_cost, invoice.prep_cost, invoice.total,
    invoice.paid_amount, invoice.remaining_amount,
    invoice.payment_method, invoice.status,
    (select count(*)::integer from public.purchase_invoice_items as item where item.invoice_id = invoice.id),
    invoice.document_id,
    invoice.created_at
  from public.purchase_invoices as invoice
  join public.suppliers as supplier on supplier.id = invoice.supplier_id
  join public.branches as branch on branch.id = invoice.branch_id
  where public.is_branch_member(invoice.branch_id)
    and (p_supplier_id is null or invoice.supplier_id = p_supplier_id)
    and (
      p_status is null
      or lower(btrim(p_status)) = 'all'
      or invoice.status = lower(btrim(p_status))
    )
    and (
      p_search is null
      or invoice.number ilike '%' || btrim(p_search) || '%'
      or supplier.full_name ilike '%' || btrim(p_search) || '%'
      or invoice.supplier_reference ilike '%' || btrim(p_search) || '%'
    )
  order by invoice.invoice_date desc, invoice.number desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_purchase_invoices(text, uuid, text, integer, integer)
  from public, anon;
grant execute on function public.list_purchase_invoices(text, uuid, text, integer, integer)
  to authenticated, service_role;

create or replace function public.get_purchase_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  header jsonb;
begin
  if not public.has_permission('purchases.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select to_jsonb(invoice) into header
  from public.purchase_invoices as invoice
  where invoice.id = p_invoice_id
    and public.is_branch_member(invoice.branch_id);

  if header is null then
    raise exception 'invoice_missing' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'invoice', header,
    'items', coalesce(
      (
        select jsonb_agg(
          to_jsonb(item) || jsonb_build_object(
            'product_code', product.code,
            'product_name', product.name,
            'vehicle_code', vehicle.code
          )
          order by item.line_no
        )
        from public.purchase_invoice_items as item
        left join public.products as product on product.id = item.product_id
        left join public.vehicles as vehicle on vehicle.id = item.vehicle_id
        where item.invoice_id = p_invoice_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_purchase_invoice(uuid) from public, anon;
grant execute on function public.get_purchase_invoice(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Supplier balance.
-- ---------------------------------------------------------------------------

create or replace function public.supplier_balance(
  p_supplier_id uuid,
  p_branch_id uuid default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  balance numeric;
begin
  if not public.has_permission('suppliers.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(sum(entry.amount), 0) into balance
  from public.supplier_transactions as entry
  where entry.supplier_id = p_supplier_id
    and (p_branch_id is null or entry.branch_id = p_branch_id)
    and public.is_branch_member(entry.branch_id);

  return balance;
end;
$$;

revoke all on function public.supplier_balance(uuid, uuid) from public, anon;
grant execute on function public.supplier_balance(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Audit integration.
-- ---------------------------------------------------------------------------

drop trigger if exists audit_purchase_invoices_change on public.purchase_invoices;
create trigger audit_purchase_invoices_change
after insert or update or delete on public.purchase_invoices
for each row execute function public.audit_row_change();

drop trigger if exists audit_purchase_invoice_items_change on public.purchase_invoice_items;
create trigger audit_purchase_invoice_items_change
after insert or update or delete on public.purchase_invoice_items
for each row execute function public.audit_row_change();

drop trigger if exists audit_supplier_transactions_change on public.supplier_transactions;
create trigger audit_supplier_transactions_change
after insert or update or delete on public.supplier_transactions
for each row execute function public.audit_row_change();
