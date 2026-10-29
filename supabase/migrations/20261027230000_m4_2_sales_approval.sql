-- M4.2 — Approve a cash sale atomically.
--
-- `approve_sales_invoice` posts every effect of a draft sale in one transaction:
--   * vehicle -> sold, stock movement 'sale'
--   * cashbox/bank receipt when paid > 0
--   * journal entry (cash/receivable vs. sales revenue)
--   * customer ledger (sale + payment)
--   * invoice -> approved
-- A second approval is rejected (invoice_not_draft).

-- ---------------------------------------------------------------------------
-- 1. Customer ledger (mirrors supplier_transactions).
-- ---------------------------------------------------------------------------

create table if not exists public.customer_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  branch_id uuid not null references public.branches (id) on delete restrict,
  transaction_type text not null
    check (transaction_type in ('sale', 'payment', 'return', 'adjustment')),
  transaction_date date not null default current_date,
  amount numeric(14, 2) not null check (amount <> 0),
  reference_type text,
  reference_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create index if not exists customer_transactions_customer_idx
  on public.customer_transactions (customer_id, transaction_date desc);
create index if not exists customer_transactions_reference_idx
  on public.customer_transactions (reference_type, reference_id);

alter table public.customer_transactions enable row level security;

drop policy if exists customer_transactions_select_authorized on public.customer_transactions;
create policy customer_transactions_select_authorized
on public.customer_transactions
for select
to authenticated
using (
  public.has_permission('customers.view')
  and public.is_branch_member(branch_id)
);

revoke all on public.customer_transactions from authenticated, anon;
grant select on public.customer_transactions to authenticated;

-- ---------------------------------------------------------------------------
-- 2. approve_sales_invoice.
-- ---------------------------------------------------------------------------

create or replace function public.approve_sales_invoice(p_invoice_id uuid)
returns public.sales_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.sales_invoices;
  item record;
  v_paid numeric;
  v_total numeric;
  v_balance numeric;
  revenue_account uuid;
  receivable_account uuid;
  payment_account uuid;
  journal_id uuid;
  journal_number text;
  cash_transaction_id uuid;
begin
  if not public.has_permission('sales.approve') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into current_row
  from public.sales_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_missing' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(current_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if current_row.status <> 'draft' then
    raise exception 'invoice_not_draft' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.customers
    where id = current_row.customer_id and status = 'active'
  ) then
    raise exception 'customer_inactive' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.sales_invoice_items where invoice_id = p_invoice_id
  ) then
    raise exception 'invalid_sale_items' using errcode = '22023';
  end if;

  select id into revenue_account from public.accounts where code = '4100';
  select id into receivable_account from public.accounts where code = '1201';

  if revenue_account is null or receivable_account is null then
    raise exception 'journal_account_missing' using errcode = 'P0001';
  end if;

  payment_account := null;
  v_balance := null;

  if current_row.paid_amount > 0 then
    if current_row.payment_method = 'cash' and current_row.cashbox_id is not null then
      select account_id, current_balance into payment_account, v_balance
      from public.cashboxes
      where id = current_row.cashbox_id
      for update;
    elsif current_row.payment_method = 'bank' and current_row.bank_account_id is not null then
      select account_id, current_balance into payment_account, v_balance
      from public.bank_accounts
      where id = current_row.bank_account_id
      for update;
    end if;
  end if;

  v_paid := coalesce(current_row.paid_amount, 0);
  v_total := coalesce(current_row.total, 0);

  if v_paid > 0 and payment_account is null then
    raise exception 'payment_source_missing' using errcode = 'P0001';
  end if;

  -- 1: stock movements + vehicle status.
  for item in
    select * from public.sales_invoice_items
    where invoice_id = p_invoice_id
    order by line_no
  loop
    if item.product_id is not null then
      perform public.record_stock_movement(
        'sale', -item.quantity, item.product_id, null,
        item.unit_price, current_row.branch_id,
        'sales_invoice', current_row.id, current_row.number
      );
    else
      if not exists (
        select 1 from public.vehicles
        where id = item.vehicle_id and status = 'available'
      ) then
        raise exception 'vehicle_unavailable' using errcode = 'P0001';
      end if;

      perform public.record_stock_movement(
        'sale', -1, null, item.vehicle_id,
        item.unit_price, current_row.branch_id,
        'sales_invoice', current_row.id, current_row.number
      );

      update public.vehicles
      set status = 'sold',
          updated_at = now(),
          updated_by = auth.uid()
      where id = item.vehicle_id;
    end if;
  end loop;

  -- 2: customer ledger (sale + payment).
  insert into public.customer_transactions (
    customer_id, branch_id, transaction_type, transaction_date, amount,
    reference_type, reference_id, notes, created_by
  )
  values (
    current_row.customer_id, current_row.branch_id, 'sale',
    current_row.invoice_date, v_total,
    'sales_invoice', current_row.id, current_row.number, auth.uid()
  );

  if v_paid > 0 then
    insert into public.customer_transactions (
      customer_id, branch_id, transaction_type, transaction_date, amount,
      reference_type, reference_id, notes, created_by
    )
    values (
      current_row.customer_id, current_row.branch_id, 'payment',
      current_row.invoice_date, -v_paid,
      'sales_invoice', current_row.id, current_row.number, auth.uid()
    );
  end if;

  -- 3: journal entry.
  journal_number := public.next_entity_code('journal_entry');

  insert into public.journal_entries (
    branch_id, entry_number, entry_date, description, source_type, source_id,
    status, posted_at, posted_by, total_debit, total_credit, created_by, updated_by
  )
  values (
    current_row.branch_id, journal_number, current_row.invoice_date,
    'اعتماد فاتورة بيع ' || current_row.number,
    'sales_invoice', current_row.id, 'posted', now(), auth.uid(),
    v_total, v_total, auth.uid(), auth.uid()
  )
  returning id into journal_id;

  -- debit lines
  if v_paid > 0 then
    insert into public.journal_entry_lines (
      journal_entry_id, line_number, account_id, description, debit, credit, created_by
    )
    values
      (journal_id, 1, payment_account,
        'دفعة نقدية ' || current_row.number, v_paid, 0, auth.uid());
  end if;

  if v_total - v_paid > 0 then
    insert into public.journal_entry_lines (
      journal_entry_id, line_number, account_id, description, debit, credit, created_by
    )
    values
      (journal_id, case when v_paid > 0 then 2 else 1 end, receivable_account,
        'ذمم عملاء ' || current_row.number, v_total - v_paid, 0, auth.uid());
  end if;

  -- credit line: sales revenue
  insert into public.journal_entry_lines (
    journal_entry_id, line_number, account_id, description, debit, credit, created_by
  )
  values
    (journal_id, case when v_paid > 0 and v_total - v_paid > 0 then 3
                     when v_paid > 0 or v_total - v_paid > 0 then 2
                     else 1 end,
     revenue_account,
     'إيراد بيع ' || current_row.number, 0, v_total, auth.uid());

  -- 4: cashbox / bank receipt.
  if v_paid > 0 then
    if current_row.payment_method = 'cash' then
      update public.cashboxes
      set current_balance = current_balance + v_paid,
          updated_at = now(),
          updated_by = auth.uid()
      where id = current_row.cashbox_id;

      insert into public.cash_transactions (
        branch_id, cashbox_id, journal_entry_id, transaction_type,
        transaction_date, amount, reference_type, reference_id, description, created_by
      )
      values (
        current_row.branch_id, current_row.cashbox_id, journal_id, 'receipt',
        current_row.invoice_date, v_paid, 'sales_invoice', current_row.id,
        'تحصيل فاتورة بيع ' || current_row.number, auth.uid()
      )
      returning id into cash_transaction_id;
    else
      update public.bank_accounts
      set current_balance = current_balance + v_paid,
          updated_at = now(),
          updated_by = auth.uid()
      where id = current_row.bank_account_id;

      insert into public.cash_transactions (
        branch_id, bank_account_id, journal_entry_id, transaction_type,
        transaction_date, amount, reference_type, reference_id, description, created_by
      )
      values (
        current_row.branch_id, current_row.bank_account_id, journal_id, 'receipt',
        current_row.invoice_date, v_paid, 'sales_invoice', current_row.id,
        'تحصيل فاتورة بيع ' || current_row.number, auth.uid()
      )
      returning id into cash_transaction_id;
    end if;
  end if;

  -- 5: mark approved.
  update public.sales_invoices
  set status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      remaining_amount = v_total - v_paid,
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_invoice_id
  returning * into current_row;

  return current_row;
end;
$$;

revoke all on function public.approve_sales_invoice(uuid) from public, anon;
grant execute on function public.approve_sales_invoice(uuid) to authenticated, service_role;

-- RLS for customer_transactions already added above.
-- Audit
drop trigger if exists audit_customer_transactions_change on public.customer_transactions;
create trigger audit_customer_transactions_change
after insert or update or delete on public.customer_transactions
for each row execute function public.audit_row_change();
