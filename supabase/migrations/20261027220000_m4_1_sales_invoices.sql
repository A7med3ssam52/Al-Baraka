-- M4.1 — Sales invoices (draft side).
--
-- A sales invoice is the customer-facing document: one or more vehicle lines
-- (quantity 1) and/or product lines (quantity >= 0.01), an invoice-level
-- discount, and the payment split. It starts as a draft and only M4.2's
-- approval posts the stock movement, vehicle status, cashbox receipt, customer
-- ledger and journal entry atomically.
--
-- Discounts are governed by role: users with `sales.discount_approve` may
-- discount freely, everyone else is capped by system_settings.default_discount_limit.
-- A draft never touches stock, vehicle status, or balances.

-- ---------------------------------------------------------------------------
-- 1. Invoice number sequence (SINV-00001).
-- ---------------------------------------------------------------------------

insert into public.code_sequences (entity, prefix, padding)
values ('sales_invoice', 'SINV', 5)
on conflict (entity) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables.
-- ---------------------------------------------------------------------------

create table if not exists public.sales_invoices (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  customer_id uuid not null references public.customers (id) on delete restrict,
  branch_id uuid not null references public.branches (id) on delete restrict,
  invoice_date date not null default current_date,
  sale_type text not null default 'cash' check (sale_type in ('cash', 'installment')),
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  discount numeric(14, 2) not null default 0 check (discount >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  remaining_amount numeric(14, 2) not null default 0 check (remaining_amount >= 0),
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'bank', 'credit')),
  cashbox_id uuid references public.cashboxes (id) on delete restrict,
  bank_account_id uuid references public.bank_accounts (id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'cancelled')),
  discount_approved_by uuid references public.profiles (id),
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

create index if not exists sales_invoices_customer_idx
  on public.sales_invoices (customer_id, invoice_date desc);
create index if not exists sales_invoices_branch_status_idx
  on public.sales_invoices (branch_id, status, invoice_date desc);

create table if not exists public.sales_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.sales_invoices (id) on delete cascade,
  line_no smallint not null check (line_no > 0),
  product_id uuid references public.products (id) on delete restrict,
  vehicle_id uuid references public.vehicles (id) on delete restrict,
  description text,
  quantity numeric(14, 2) not null default 1 check (quantity > 0),
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0),
  discount numeric(14, 2) not null default 0 check (discount >= 0),
  line_total numeric(14, 2) not null default 0 check (line_total >= 0),
  unit_cost numeric(14, 2) not null default 0 check (unit_cost >= 0),
  unique (invoice_id, line_no),
  check (num_nonnulls(product_id, vehicle_id) = 1)
);

create index if not exists sales_invoice_items_invoice_idx
  on public.sales_invoice_items (invoice_id, line_no);
create index if not exists sales_invoice_items_product_idx
  on public.sales_invoice_items (product_id);
create index if not exists sales_invoice_items_vehicle_idx
  on public.sales_invoice_items (vehicle_id);

-- ---------------------------------------------------------------------------
-- 3. RLS.
-- ---------------------------------------------------------------------------

alter table public.sales_invoices enable row level security;

drop policy if exists sales_invoices_select_authorized on public.sales_invoices;
create policy sales_invoices_select_authorized
on public.sales_invoices
for select
to authenticated
using (
  public.has_permission('sales.view')
  and public.is_branch_member(branch_id)
);

revoke all on public.sales_invoices from authenticated, anon;
grant select on public.sales_invoices to authenticated;

alter table public.sales_invoice_items enable row level security;

drop policy if exists sales_invoice_items_select_authorized on public.sales_invoice_items;
create policy sales_invoice_items_select_authorized
on public.sales_invoice_items
for select
to authenticated
using (
  public.has_permission('sales.view')
  and exists (
    select 1
    from public.sales_invoices as invoice
    where invoice.id = sales_invoice_items.invoice_id
      and public.is_branch_member(invoice.branch_id)
  )
);

revoke all on public.sales_invoice_items from authenticated, anon;
grant select on public.sales_invoice_items to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Discount policy (per role, from settings).
-- ---------------------------------------------------------------------------

create or replace function public.sales_discount_policy()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  allowed_discount numeric;
begin
  if not public.has_permission('sales.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if public.has_permission('sales.discount_approve') then
    return jsonb_build_object('limit', null, 'can_approve', true);
  end if;

  select coalesce(default_discount_limit, 0) into allowed_discount
  from public.system_settings
  where id;

  return jsonb_build_object(
    'limit', coalesce(allowed_discount, 0),
    'can_approve', false
  );
end;
$$;

revoke all on function public.sales_discount_policy() from public, anon;
grant execute on function public.sales_discount_policy() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. save_sales_invoice (create or replace a draft).
-- ---------------------------------------------------------------------------

create or replace function public.save_sales_invoice(
  p_customer_id uuid,
  p_items jsonb,
  p_invoice_id uuid default null,
  p_invoice_date date default current_date,
  p_sale_type text default 'cash',
  p_discount numeric default 0,
  p_paid_amount numeric default 0,
  p_notes text default null
)
returns public.sales_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_branch uuid := public.current_branch();
  clean_type text := lower(btrim(coalesce(p_sale_type, 'cash')));
  clean_discount numeric := coalesce(p_discount, 0);
  clean_paid numeric := coalesce(p_paid_amount, 0);
  allowed_discount numeric;
  target_cashbox uuid;
  item_count integer;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_line_discounts numeric := 0;
  line record;
  line_index integer := 0;
  line_qty numeric;
  line_price numeric;
  line_discount numeric;
  line_total numeric;
  line_cost numeric;
  product_id_value uuid;
  vehicle_id_value uuid;
  seen_products uuid[] := '{}';
  seen_vehicles uuid[] := '{}';
  existing public.sales_invoices;
  new_row public.sales_invoices;
begin
  -- default cashbox for cash sales
  if clean_type = 'cash' then
    select id into target_cashbox
    from public.cashboxes
    where branch_id = target_branch and is_default and is_active
    limit 1;
  end if;

  if p_invoice_id is null then
    if not public.has_permission('sales.create') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  else
    if not public.has_permission('sales.update') then
      raise exception 'forbidden' using errcode = '42501';
    end if;

    select * into existing from public.sales_invoices where id = p_invoice_id;

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

  if p_customer_id is null or not exists (
    select 1
    from public.customers
    where id = p_customer_id
      and status = 'active'
      and branch_id = target_branch
  ) then
    raise exception 'customer_missing' using errcode = 'P0001';
  end if;

  if clean_type not in ('cash', 'installment') then
    raise exception 'invalid_sale_type' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_sale_items' using errcode = '22023';
  end if;

  item_count := jsonb_array_length(p_items);

  if item_count < 1 or item_count > 50 then
    raise exception 'invalid_sale_items' using errcode = '22023';
  end if;

  if clean_discount < 0 or clean_paid < 0 then
    raise exception 'invalid_sale_numbers' using errcode = '22023';
  end if;

  -- First pass: validate the lines, reject duplicates, and compute totals.
  for line in select value from jsonb_array_elements(p_items) loop
    line_index := line_index + 1;

    product_id_value := nullif(btrim(coalesce(line.value ->> 'product_id', '')), '')::uuid;
    vehicle_id_value := nullif(btrim(coalesce(line.value ->> 'vehicle_id', '')), '')::uuid;

    if num_nonnulls(product_id_value, vehicle_id_value) <> 1 then
      raise exception 'invalid_sale_item_target' using errcode = '22023';
    end if;

    line_qty := coalesce((line.value ->> 'quantity')::numeric, 0);
    line_price := coalesce((line.value ->> 'unit_price')::numeric, 0);
    line_discount := coalesce((line.value ->> 'discount')::numeric, 0);
    line_total := round(line_qty * line_price, 2) - line_discount;

    if line_qty <= 0 or line_price < 0 or line_discount < 0 or line_total < 0 then
      raise exception 'invalid_sale_item_numbers' using errcode = '22023';
    end if;

    if product_id_value is not null then
      if product_id_value = any(seen_products) then
        raise exception 'duplicate_sale_item' using errcode = '22023';
      end if;

      select unit_cost into line_cost
      from public.products
      where id = product_id_value and status <> 'archived';

      if not found then
        raise exception 'product_missing' using errcode = 'P0001';
      end if;

      seen_products := array_append(seen_products, product_id_value);
    else
      if vehicle_id_value = any(seen_vehicles) then
        raise exception 'duplicate_sale_item' using errcode = '22023';
      end if;

      if line_qty <> 1 then
        raise exception 'invalid_sale_item_numbers' using errcode = '22023';
      end if;

      select approved_cost into line_cost
      from public.vehicles
      where id = vehicle_id_value
        and branch_id = target_branch
        and status = 'available';

      if not found then
        raise exception 'vehicle_unavailable' using errcode = 'P0001';
      end if;

      seen_vehicles := array_append(seen_vehicles, vehicle_id_value);
    end if;

    v_subtotal := v_subtotal + line_total;
    v_line_discounts := v_line_discounts + line_discount;
  end loop;

  v_subtotal := round(v_subtotal, 2);

  if clean_discount > v_subtotal then
    raise exception 'invalid_sale_discount' using errcode = '22023';
  end if;

  v_total := round(v_subtotal - clean_discount, 2);

  if clean_paid > v_total then
    raise exception 'invalid_sale_numbers' using errcode = '22023';
  end if;

  -- Role-based discount ceiling. Approvers are exempt and are recorded.
  if not public.has_permission('sales.discount_approve') then
    select coalesce(default_discount_limit, 0) into allowed_discount
    from public.system_settings
    where id;

    if coalesce(clean_discount, 0) + coalesce(v_line_discounts, 0) > coalesce(allowed_discount, 0) then
      raise exception 'discount_limit_exceeded' using errcode = 'P0001';
    end if;
  end if;

  -- default cashbox for cash sales
  if clean_type = 'cash' then
    select id into target_cashbox
    from public.cashboxes
    where branch_id = target_branch and is_default and is_active
    limit 1;
  end if;

  if p_invoice_id is null then
    insert into public.sales_invoices (
      number, customer_id, branch_id, invoice_date, sale_type,
      subtotal, discount, total, paid_amount, remaining_amount,
      payment_method, cashbox_id, discount_approved_by, status, notes, created_by, updated_by
    )
    values (
      public.next_entity_code('sales_invoice'), p_customer_id, target_branch,
      coalesce(p_invoice_date, current_date), clean_type,
      v_subtotal, clean_discount, v_total, clean_paid, v_total - clean_paid,
      case when clean_type = 'installment' then 'credit' else 'cash' end,
      target_cashbox,
      case
        when clean_discount + v_line_discounts > 0
          and public.has_permission('sales.discount_approve')
        then auth.uid()
        else null
      end,
      'draft', nullif(btrim(coalesce(p_notes, '')), ''), auth.uid(), auth.uid()
    )
    returning * into new_row;
  else
    update public.sales_invoices
    set customer_id = p_customer_id,
        invoice_date = coalesce(p_invoice_date, invoice_date),
        sale_type = clean_type,
        subtotal = v_subtotal,
        discount = clean_discount,
        total = v_total,
        paid_amount = clean_paid,
        remaining_amount = v_total - clean_paid,
        payment_method = case when clean_type = 'installment' then 'credit' else 'cash' end,
        cashbox_id = target_cashbox,
        discount_approved_by = case
          when clean_discount + v_line_discounts > 0
            and public.has_permission('sales.discount_approve')
          then auth.uid()
          else null
        end,
        notes = nullif(btrim(coalesce(p_notes, '')), ''),
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_invoice_id
    returning * into new_row;

    delete from public.sales_invoice_items where invoice_id = p_invoice_id;
  end if;

  -- Second pass: insert the lines with the cost snapshot.
  line_index := 0;

  for line in select value from jsonb_array_elements(p_items) loop
    line_index := line_index + 1;

    product_id_value := nullif(btrim(coalesce(line.value ->> 'product_id', '')), '')::uuid;
    vehicle_id_value := nullif(btrim(coalesce(line.value ->> 'vehicle_id', '')), '')::uuid;
    line_qty := coalesce((line.value ->> 'quantity')::numeric, 0);
    line_price := coalesce((line.value ->> 'unit_price')::numeric, 0);
    line_discount := coalesce((line.value ->> 'discount')::numeric, 0);
    line_total := round(line_qty * line_price, 2) - line_discount;

    if product_id_value is not null then
      select unit_cost into line_cost from public.products where id = product_id_value;
    else
      select approved_cost into line_cost from public.vehicles where id = vehicle_id_value;
    end if;

    insert into public.sales_invoice_items (
      invoice_id, line_no, product_id, vehicle_id, description,
      quantity, unit_price, discount, line_total, unit_cost
    )
    values (
      new_row.id, line_index, product_id_value, vehicle_id_value,
      nullif(btrim(coalesce(line.value ->> 'description', '')), ''),
      line_qty, line_price, line_discount, line_total, coalesce(line_cost, 0)
    );
  end loop;

  return new_row;
end;
$$;

revoke all on function public.save_sales_invoice(uuid, jsonb, uuid, date, text, numeric, numeric, text)
  from public, anon;
grant execute on function public.save_sales_invoice(uuid, jsonb, uuid, date, text, numeric, numeric, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. cancel_sales_invoice (drafts only; approved reversals land in M4.6).
-- ---------------------------------------------------------------------------

create or replace function public.cancel_sales_invoice(
  p_invoice_id uuid,
  p_reason text default null
)
returns public.sales_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.sales_invoices;
begin
  if not public.has_permission('sales.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into current_row from public.sales_invoices where id = p_invoice_id;

  if not found then
    raise exception 'invoice_missing' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(current_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if current_row.status <> 'draft' then
    raise exception 'invoice_not_draft' using errcode = 'P0001';
  end if;

  update public.sales_invoices
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

revoke all on function public.cancel_sales_invoice(uuid, text) from public, anon;
grant execute on function public.cancel_sales_invoice(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. list_sales_invoices + get_sales_invoice.
-- ---------------------------------------------------------------------------

create or replace function public.list_sales_invoices(
  p_status text default 'all',
  p_customer_id uuid default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  number text,
  customer_id uuid,
  customer_name text,
  customer_code text,
  branch_id uuid,
  branch_name text,
  invoice_date date,
  sale_type text,
  subtotal numeric,
  discount numeric,
  total numeric,
  paid_amount numeric,
  remaining_amount numeric,
  payment_method text,
  status text,
  item_count integer,
  vehicle_count integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('sales.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    invoice.id, invoice.number, invoice.customer_id, customer.full_name,
    customer.code, invoice.branch_id, branch.name,
    invoice.invoice_date, invoice.sale_type, invoice.subtotal, invoice.discount,
    invoice.total, invoice.paid_amount, invoice.remaining_amount,
    invoice.payment_method, invoice.status,
    (select count(*)::integer from public.sales_invoice_items as item where item.invoice_id = invoice.id),
    (select count(*)::integer from public.sales_invoice_items as item
      where item.invoice_id = invoice.id and item.vehicle_id is not null),
    invoice.created_at
  from public.sales_invoices as invoice
  join public.customers as customer on customer.id = invoice.customer_id
  join public.branches as branch on branch.id = invoice.branch_id
  where public.is_branch_member(invoice.branch_id)
    and (p_customer_id is null or invoice.customer_id = p_customer_id)
    and (
      p_status is null
      or lower(btrim(p_status)) = 'all'
      or invoice.status = lower(btrim(p_status))
    )
    and (
      p_search is null
      or invoice.number ilike '%' || btrim(p_search) || '%'
      or customer.full_name ilike '%' || btrim(p_search) || '%'
      or customer.code ilike '%' || btrim(p_search) || '%'
    )
  order by invoice.invoice_date desc, invoice.number desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_sales_invoices(text, uuid, text, integer, integer)
  from public, anon;
grant execute on function public.list_sales_invoices(text, uuid, text, integer, integer)
  to authenticated, service_role;

create or replace function public.get_sales_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  header jsonb;
begin
  if not public.has_permission('sales.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select to_jsonb(invoice) into header
  from public.sales_invoices as invoice
  where invoice.id = p_invoice_id
    and public.is_branch_member(invoice.branch_id);

  if header is null then
    raise exception 'invoice_missing' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'invoice', header || jsonb_build_object(
      'customer_name', (select full_name from public.customers where id = (header ->> 'customer_id')::uuid),
      'customer_code', (select code from public.customers where id = (header ->> 'customer_id')::uuid),
      'branch_name', (select name from public.branches where id = (header ->> 'branch_id')::uuid)
    ),
    'items', coalesce(
      (
        select jsonb_agg(
          to_jsonb(item) || jsonb_build_object(
            'product_code', product.code,
            'product_name', product.name,
            'unit_name', product.unit_name,
            'vehicle_code', vehicle.code,
            'chassis_no', vehicle.chassis_no
          )
          order by item.line_no
        )
        from public.sales_invoice_items as item
        left join public.products as product on product.id = item.product_id
        left join public.vehicles as vehicle on vehicle.id = item.vehicle_id
        where item.invoice_id = p_invoice_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_sales_invoice(uuid) from public, anon;
grant execute on function public.get_sales_invoice(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Audit integration.
-- ---------------------------------------------------------------------------

drop trigger if exists audit_sales_invoices_change on public.sales_invoices;
create trigger audit_sales_invoices_change
after insert or update or delete on public.sales_invoices
for each row execute function public.audit_row_change();

drop trigger if exists audit_sales_invoice_items_change on public.sales_invoice_items;
create trigger audit_sales_invoice_items_change
after insert or update or delete on public.sales_invoice_items
for each row execute function public.audit_row_change();
