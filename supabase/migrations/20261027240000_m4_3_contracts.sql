-- M4.3 — Contracts and down payments (installment sales).
--
-- A contract is created for an installment sale. It stores the financing terms
-- (total, down payment, financed amount, installment count, frequency, first due
-- date) and links guarantors. The down payment is recorded as a payment with a
-- receipt. The contract starts as a draft and M4.5 approves it atomically.

-- ---------------------------------------------------------------------------
-- 1. Contract number sequence (CON-00001).
-- ---------------------------------------------------------------------------

insert into public.code_sequences (entity, prefix, padding)
values ('contract', 'CON', 5)
on conflict (entity) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables.
-- ---------------------------------------------------------------------------

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  sale_invoice_id uuid not null references public.sales_invoices (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  vehicle_id uuid references public.vehicles (id) on delete restrict,
  branch_id uuid not null references public.branches (id) on delete restrict,
  contract_date date not null default current_date,
  total_amount numeric(14, 2) not null default 0 check (total_amount >= 0),
  down_payment numeric(14, 2) not null default 0 check (down_payment >= 0),
  financed_amount numeric(14, 2) not null default 0 check (financed_amount >= 0),
  installment_count integer not null default 0 check (installment_count >= 0),
  frequency text not null default 'monthly'
    check (frequency in ('weekly', 'biweekly', 'monthly', 'custom')),
  custom_days integer check (custom_days is null or custom_days > 0),
  first_due_date date,
  notes text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'completed', 'cancelled')),
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  check (down_payment <= total_amount),
  check (financed_amount = total_amount - down_payment)
);

create index if not exists contracts_customer_idx
  on public.contracts (customer_id, contract_date desc);
create index if not exists contracts_branch_status_idx
  on public.contracts (branch_id, status, contract_date desc);
create index if not exists contracts_invoice_idx
  on public.contracts (sale_invoice_id);

create table if not exists public.contract_guarantors (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  guarantor_id uuid not null references public.guarantors (id) on delete restrict,
  role text not null default 'guarantor' check (role in ('guarantor', 'co_signer')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  unique (contract_id, guarantor_id)
);

create index if not exists contract_guarantors_contract_idx
  on public.contract_guarantors (contract_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contracts (id) on delete restrict,
  sale_invoice_id uuid references public.sales_invoices (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  branch_id uuid not null references public.branches (id) on delete restrict,
  payment_type text not null
    check (payment_type in ('down_payment', 'installment', 'extra', 'refund')),
  payment_date date not null default current_date,
  amount numeric(14, 2) not null check (amount > 0),
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'bank', 'transfer', 'cheque')),
  cashbox_id uuid references public.cashboxes (id) on delete restrict,
  bank_account_id uuid references public.bank_accounts (id) on delete restrict,
  receipt_number text,
  journal_entry_id uuid references public.journal_entries (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  check (num_nonnulls(cashbox_id, bank_account_id) <= 1)
);

create index if not exists payments_contract_idx
  on public.payments (contract_id, payment_date desc);
create index if not exists payments_customer_idx
  on public.payments (customer_id, payment_date desc);
create index if not exists payments_invoice_idx
  on public.payments (sale_invoice_id);

-- ---------------------------------------------------------------------------
-- 3. RLS.
-- ---------------------------------------------------------------------------

alter table public.contracts enable row level security;

drop policy if exists contracts_select_authorized on public.contracts;
create policy contracts_select_authorized
on public.contracts
for select
to authenticated
using (
  public.has_permission('contracts.view')
  and public.is_branch_member(branch_id)
);

revoke all on public.contracts from authenticated, anon;
grant select on public.contracts to authenticated;

alter table public.contract_guarantors enable row level security;

drop policy if exists contract_guarantors_select_authorized on public.contract_guarantors;
create policy contract_guarantors_select_authorized
on public.contract_guarantors
for select
to authenticated
using (
  public.has_permission('contracts.view')
  and exists (
    select 1 from public.contracts as contract
    where contract.id = contract_guarantors.contract_id
      and public.is_branch_member(contract.branch_id)
  )
);

revoke all on public.contract_guarantors from authenticated, anon;
grant select on public.contract_guarantors to authenticated;

alter table public.payments enable row level security;

drop policy if exists payments_select_authorized on public.payments;
create policy payments_select_authorized
on public.payments
for select
to authenticated
using (
  public.has_permission('contracts.view')
  and public.is_branch_member(branch_id)
);

revoke all on public.payments from authenticated, anon;
grant select on public.payments to authenticated;

-- ---------------------------------------------------------------------------
-- 4. save_contract (create or replace a draft contract).
-- ---------------------------------------------------------------------------

create or replace function public.save_contract(
  p_sale_invoice_id uuid,
  p_down_payment numeric default 0,
  p_installment_count integer default 0,
  p_frequency text default 'monthly',
  p_custom_days integer default null,
  p_first_due_date date default null,
  p_guarantor_ids uuid[] default null,
  p_notes text default null,
  p_contract_id uuid default null
)
returns public.contracts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_branch uuid;
  invoice_row public.sales_invoices;
  customer_row public.customers;
  vehicle_row public.vehicles;
  clean_frequency text := lower(btrim(coalesce(p_frequency, 'monthly')));
  clean_down numeric := coalesce(p_down_payment, 0);
  clean_count integer := coalesce(p_installment_count, 0);
  clean_custom integer := p_custom_days;
  total_amount numeric;
  financed_amount numeric;
  existing public.contracts;
  new_row public.contracts;
  guarantor_id uuid;
begin
  if p_contract_id is null then
    if not public.has_permission('contracts.create') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  else
    if not public.has_permission('contracts.update') then
      raise exception 'forbidden' using errcode = '42501';
    end if;

    select * into existing from public.contracts where id = p_contract_id;

    if not found then
      raise exception 'contract_missing' using errcode = 'P0001';
    end if;

    if existing.status <> 'draft' then
      raise exception 'contract_not_draft' using errcode = 'P0001';
    end if;

    if not public.is_branch_member(existing.branch_id) then
      raise exception 'forbidden' using errcode = '42501';
    end if;

    target_branch := existing.branch_id;
  end if;

  -- invoice must exist, be installment, draft, in a branch the user belongs to
  select * into invoice_row from public.sales_invoices where id = p_sale_invoice_id;

  if not found then
    raise exception 'invoice_missing' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(invoice_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if target_branch is null then
    target_branch := invoice_row.branch_id;
  end if;

  if target_branch <> invoice_row.branch_id then
    raise exception 'invalid_branch' using errcode = '22023';
  end if;

  if invoice_row.sale_type <> 'installment' then
    raise exception 'invalid_sale_type' using errcode = '22023';
  end if;

  if invoice_row.status <> 'draft' then
    raise exception 'invoice_not_draft' using errcode = 'P0001';
  end if;

  select * into customer_row from public.customers where id = invoice_row.customer_id;

  if not found or customer_row.status <> 'active' then
    raise exception 'customer_inactive' using errcode = 'P0001';
  end if;

  select id into vehicle_row.id from public.vehicles
  where id in (select vehicle_id from public.sales_invoice_items where invoice_id = p_sale_invoice_id and vehicle_id is not null)
  limit 1;

  total_amount := invoice_row.total;

  if clean_down < 0 or clean_down > total_amount then
    raise exception 'invalid_down_payment' using errcode = '22023';
  end if;

  financed_amount := total_amount - clean_down;

  if clean_count < 1 or clean_count > 360 then
    raise exception 'invalid_installment_count' using errcode = '22023';
  end if;

  if clean_frequency not in ('weekly', 'biweekly', 'monthly', 'custom') then
    raise exception 'invalid_frequency' using errcode = '22023';
  end if;

  if clean_frequency = 'custom' and (clean_custom is null or clean_custom <= 0) then
    raise exception 'invalid_custom_days' using errcode = '22023';
  end if;

  if p_first_due_date is null then
    raise exception 'invalid_first_due_date' using errcode = '22023';
  end if;

  -- one contract per invoice
  if p_contract_id is null and exists (
    select 1 from public.contracts where sale_invoice_id = p_sale_invoice_id
  ) then
    raise exception 'contract_already_exists' using errcode = 'P0001';
  end if;

  if p_contract_id is null then
    insert into public.contracts (
      number, sale_invoice_id, customer_id, vehicle_id, branch_id, contract_date,
      total_amount, down_payment, financed_amount, installment_count, frequency,
      custom_days, first_due_date, notes, status, created_by, updated_by
    )
    values (
      public.next_entity_code('contract'), p_sale_invoice_id, invoice_row.customer_id,
      vehicle_row.id, target_branch, coalesce(invoice_row.invoice_date, current_date),
      total_amount, clean_down, financed_amount, clean_count, clean_frequency,
      clean_custom, p_first_due_date, nullif(btrim(coalesce(p_notes, '')), ''),
      'draft', auth.uid(), auth.uid()
    )
    returning * into new_row;
  else
    update public.contracts
    set down_payment = clean_down,
        financed_amount = financed_amount,
        installment_count = clean_count,
        frequency = clean_frequency,
        custom_days = clean_custom,
        first_due_date = p_first_due_date,
        notes = nullif(btrim(coalesce(p_notes, '')), ''),
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_contract_id
    returning * into new_row;

    -- recompute financed_amount
    update public.contracts
    set financed_amount = total_amount - clean_down
    where id = p_contract_id
    returning * into new_row;

    delete from public.contract_guarantors where contract_id = p_contract_id;
  end if;

  -- guarantors
  if p_guarantor_ids is not null then
    foreach guarantor_id in array p_guarantor_ids loop
      if not exists (
        select 1 from public.guarantors
        where id = guarantor_id and is_active
      ) then
        raise exception 'guarantor_missing' using errcode = 'P0001';
      end if;

      insert into public.contract_guarantors (contract_id, guarantor_id, created_by)
      values (new_row.id, guarantor_id, auth.uid())
      on conflict do nothing;
    end loop;
  end if;

  return new_row;
end;
$$;

revoke all on function public.save_contract(uuid, numeric, integer, text, integer, date, uuid[], text, uuid)
  from public, anon;
grant execute on function public.save_contract(uuid, numeric, integer, text, integer, date, uuid[], text, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. cancel_contract (drafts only).
-- ---------------------------------------------------------------------------

create or replace function public.cancel_contract(
  p_contract_id uuid,
  p_reason text default null
)
returns public.contracts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.contracts;
begin
  if not public.has_permission('contracts.cancel') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into current_row from public.contracts where id = p_contract_id;

  if not found then
    raise exception 'contract_missing' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(current_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if current_row.status <> 'draft' then
    raise exception 'contract_not_draft' using errcode = 'P0001';
  end if;

  update public.contracts
  set status = 'cancelled',
      notes = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), notes),
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_contract_id
  returning * into current_row;

  return current_row;
end;
$$;

revoke all on function public.cancel_contract(uuid, text) from public, anon;
grant execute on function public.cancel_contract(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. list_contracts + get_contract.
-- ---------------------------------------------------------------------------

create or replace function public.list_contracts(
  p_status text default 'all',
  p_customer_id uuid default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  number text,
  sale_invoice_id uuid,
  invoice_number text,
  customer_id uuid,
  customer_name text,
  customer_code text,
  vehicle_id uuid,
  vehicle_code text,
  branch_id uuid,
  branch_name text,
  contract_date date,
  total_amount numeric,
  down_payment numeric,
  financed_amount numeric,
  installment_count integer,
  frequency text,
  first_due_date date,
  status text,
  guarantor_count integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('contracts.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    contract.id, contract.number, contract.sale_invoice_id, invoice.number,
    contract.customer_id, customer.full_name, customer.code,
    contract.vehicle_id, vehicle.code,
    contract.branch_id, branch.name,
    contract.contract_date, contract.total_amount, contract.down_payment,
    contract.financed_amount, contract.installment_count, contract.frequency,
    contract.first_due_date, contract.status,
    (select count(*)::integer from public.contract_guarantors as g where g.contract_id = contract.id),
    contract.created_at
  from public.contracts as contract
  join public.sales_invoices as invoice on invoice.id = contract.sale_invoice_id
  join public.customers as customer on customer.id = contract.customer_id
  join public.branches as branch on branch.id = contract.branch_id
  left join public.vehicles as vehicle on vehicle.id = contract.vehicle_id
  where public.is_branch_member(contract.branch_id)
    and (p_customer_id is null or contract.customer_id = p_customer_id)
    and (
      p_status is null
      or lower(btrim(p_status)) = 'all'
      or contract.status = lower(btrim(p_status))
    )
    and (
      p_search is null
      or contract.number ilike '%' || btrim(p_search) || '%'
      or customer.full_name ilike '%' || btrim(p_search) || '%'
      or customer.code ilike '%' || btrim(p_search) || '%'
      or invoice.number ilike '%' || btrim(p_search) || '%'
    )
  order by contract.contract_date desc, contract.number desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_contracts(text, uuid, text, integer, integer)
  from public, anon;
grant execute on function public.list_contracts(text, uuid, text, integer, integer)
  to authenticated, service_role;

create or replace function public.get_contract(p_contract_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  header jsonb;
begin
  if not public.has_permission('contracts.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select to_jsonb(contract) into header
  from public.contracts as contract
  where contract.id = p_contract_id
    and public.is_branch_member(contract.branch_id);

  if header is null then
    raise exception 'contract_missing' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'contract', header || jsonb_build_object(
      'customer_name', (select full_name from public.customers where id = (header ->> 'customer_id')::uuid),
      'customer_code', (select code from public.customers where id = (header ->> 'customer_id')::uuid),
      'branch_name', (select name from public.branches where id = (header ->> 'branch_id')::uuid),
      'vehicle_code', (select code from public.vehicles where id = (header ->> 'vehicle_id')::uuid),
      'invoice_number', (select number from public.sales_invoices where id = (header ->> 'sale_invoice_id')::uuid)
    ),
    'guarantors', coalesce(
      (
        select jsonb_agg(to_jsonb(g) || jsonb_build_object(
          'full_name', guarantor.full_name,
          'national_id', guarantor.national_id,
          'mobile', guarantor.mobile,
          'job', guarantor.job
        ) order by g.created_at)
        from public.contract_guarantors as g
        join public.guarantors as guarantor on guarantor.id = g.guarantor_id
        where g.contract_id = p_contract_id
      ),
      '[]'::jsonb
    ),
    'payments', coalesce(
      (
        select jsonb_agg(to_jsonb(pay) order by pay.payment_date, pay.created_at)
        from public.payments as pay
        where pay.contract_id = p_contract_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_contract(uuid) from public, anon;
grant execute on function public.get_contract(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Audit integration.
-- ---------------------------------------------------------------------------

drop trigger if exists audit_contracts_change on public.contracts;
create trigger audit_contracts_change
after insert or update or delete on public.contracts
for each row execute function public.audit_row_change();

drop trigger if exists audit_contract_guarantors_change on public.contract_guarantors;
create trigger audit_contract_guarantors_change
after insert or update or delete on public.contract_guarantors
for each row execute function public.audit_row_change();

drop trigger if exists audit_payments_change on public.payments;
create trigger audit_payments_change
after insert or update or delete on public.payments
for each row execute function public.audit_row_change();
