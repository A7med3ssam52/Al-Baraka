-- M5.3 — Collect an installment payment.

create or replace function public.collect_installment(
  p_installment_id uuid,
  p_amount numeric,
  p_payment_method text default 'cash',
  p_payment_date date default current_date,
  p_notes text default null
)
returns public.installments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inst_row public.installments;
  schedule_row public.installment_schedules;
  contract_row public.contracts;
  invoice_row public.sales_invoices;
  v_paid numeric := coalesce(p_amount, 0);
  v_remaining numeric;
  v_payment_account uuid;
  v_balance numeric;
  v_cashbox_id uuid;
  v_bank_id uuid;
  revenue_account uuid;
  receivable_account uuid;
  journal_id uuid;
  journal_number text;
begin
  if not public.has_permission('installments.collect') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into inst_row
  from public.installments
  where id = p_installment_id
  for update;

  if not found then
    raise exception 'installment_missing' using errcode = 'P0001';
  end if;

  select * into schedule_row from public.installment_schedules where id = inst_row.schedule_id;
  select * into contract_row from public.contracts where id = schedule_row.contract_id;

  if not public.is_branch_member(contract_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_paid <= 0 then
    raise exception 'invalid_payment_amount' using errcode = '22023';
  end if;

  v_remaining := inst_row.amount - inst_row.paid_amount;

  if v_paid > v_remaining then
    raise exception 'overpayment' using errcode = '22023';
  end if;

  -- payment source
  v_cashbox_id := null;
  v_bank_id := null;
  v_balance := null;

  if p_payment_method = 'cash' then
    select id, account_id, current_balance into v_cashbox_id, v_payment_account, v_balance
    from public.cashboxes
    where branch_id = contract_row.branch_id and is_default and is_active
    limit 1
    for update;
  elsif p_payment_method = 'bank' then
    select id, account_id, current_balance into v_bank_id, v_payment_account, v_balance
    from public.bank_accounts
    where branch_id = contract_row.branch_id and is_default and is_active
    limit 1
    for update;
  else
    raise exception 'invalid_payment_method' using errcode = '22023';
  end if;

  if v_payment_account is null then
    raise exception 'payment_source_missing' using errcode = 'P0001';
  end if;

  select id into revenue_account from public.accounts where code = '4100';
  select id into receivable_account from public.accounts where code = '1201';

  -- update installment
  update public.installments
  set paid_amount = paid_amount + v_paid,
      status = case when paid_amount + v_paid >= amount then 'paid' else 'partial' end,
      paid_at = case when paid_amount + v_paid >= amount then now() else paid_at end
  where id = p_installment_id
  returning * into inst_row;

  -- payment record
  insert into public.payments (
    contract_id, sale_invoice_id, customer_id, branch_id, payment_type,
    payment_date, amount, payment_method, cashbox_id, bank_account_id,
    notes, created_by, updated_by
  )
  values (
    contract_row.id, contract_row.sale_invoice_id, contract_row.customer_id,
    contract_row.branch_id, 'installment', coalesce(p_payment_date, current_date),
    v_paid, p_payment_method, v_cashbox_id, v_bank_id,
    coalesce(nullif(btrim(coalesce(p_notes, '')), ''), 'تحصيل قسط'), auth.uid(), auth.uid()
  );

  -- customer ledger
  insert into public.customer_transactions (
    customer_id, branch_id, transaction_type, transaction_date, amount,
    reference_type, reference_id, notes, created_by
  )
  values (
    contract_row.customer_id, contract_row.branch_id, 'payment',
    coalesce(p_payment_date, current_date), -v_paid,
    'installment', p_installment_id, 'تحصيل قسط', auth.uid()
  );

  -- cashbox/bank update
  if p_payment_method = 'cash' then
    update public.cashboxes
    set current_balance = current_balance + v_paid,
        updated_at = now(), updated_by = auth.uid()
    where id = v_cashbox_id;
  else
    update public.bank_accounts
    set current_balance = current_balance + v_paid,
        updated_at = now(), updated_by = auth.uid()
    where id = v_bank_id;
  end if;

  -- journal entry
  journal_number := public.next_entity_code('journal_entry');

  insert into public.journal_entries (
    branch_id, entry_number, entry_date, description, source_type, source_id,
    status, posted_at, posted_by, total_debit, total_credit, created_by, updated_by
  )
  values (
    contract_row.branch_id, journal_number, coalesce(p_payment_date, current_date),
    'تحصيل قسط ' || contract_row.number,
    'installment', p_installment_id, 'posted', now(), auth.uid(),
    v_paid, v_paid, auth.uid(), auth.uid()
  )
  returning id into journal_id;

  insert into public.journal_entry_lines (
    journal_entry_id, line_number, account_id, description, debit, credit, created_by
  )
  values
    (journal_id, 1, v_payment_account, 'تحصيل قسط ' || contract_row.number, v_paid, 0, auth.uid()),
    (journal_id, 2, receivable_account, 'ذمم قسط ' || contract_row.number, 0, v_paid, auth.uid());

  return inst_row;
end;
$$;

revoke all on function public.collect_installment(uuid, numeric, text, date, text) from public, anon;
grant execute on function public.collect_installment(uuid, numeric, text, date, text) to authenticated, service_role;
