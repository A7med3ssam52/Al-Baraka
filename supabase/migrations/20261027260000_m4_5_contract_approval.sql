-- M4.5 — Approve an installment sale (contract + schedule + down payment).
--
-- `approve_contract` posts every effect of an installment sale atomically:
--   * contract -> active, schedule -> active
--   * vehicle -> sold, stock movement 'sale'
--   * down payment -> payment + cashbox receipt + journal entry
--   * customer ledger (sale + down payment)
--   * sales invoice -> approved

create or replace function public.approve_contract(p_contract_id uuid)
returns public.contracts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  contract_row public.contracts;
  schedule_row public.installment_schedules;
  invoice_row public.sales_invoices;
  v_down numeric;
  v_total numeric;
  v_balance numeric;
  revenue_account uuid;
  receivable_account uuid;
  payment_account uuid;
  payment_cashbox_id uuid;
  journal_id uuid;
  journal_number text;
  item record;
begin
  if not public.has_permission('contracts.approve') then
    -- fallback: contracts.update allows approval in M4.5 scope
    if not public.has_permission('contracts.update') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  select * into contract_row
  from public.contracts
  where id = p_contract_id
  for update;

  if not found then
    raise exception 'contract_missing' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(contract_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if contract_row.status <> 'draft' then
    raise exception 'contract_not_draft' using errcode = 'P0001';
  end if;

  select * into invoice_row
  from public.sales_invoices
  where id = contract_row.sale_invoice_id
  for update;

  if invoice_row.status <> 'draft' then
    raise exception 'invoice_not_draft' using errcode = 'P0001';
  end if;

  if invoice_row.sale_type <> 'installment' then
    raise exception 'invalid_sale_type' using errcode = '22023';
  end if;

  -- active schedule required
  select * into schedule_row
  from public.installment_schedules
  where contract_id = p_contract_id and status in ('draft', 'active')
  order by version desc
  limit 1;

  if not found then
    raise exception 'schedule_missing' using errcode = 'P0001';
  end if;

  if schedule_row.status = 'draft' then
    perform public.activate_installment_schedule(schedule_row.id);
    select * into schedule_row from public.installment_schedules where id = schedule_row.id;
  end if;

  -- vehicle availability
  if contract_row.vehicle_id is not null then
    if not exists (
      select 1 from public.vehicles
      where id = contract_row.vehicle_id and status = 'available'
    ) then
      raise exception 'vehicle_unavailable' using errcode = 'P0001';
    end if;
  end if;

  select id into revenue_account from public.accounts where code = '4100';
  select id into receivable_account from public.accounts where code = '1201';

  if revenue_account is null or receivable_account is null then
    raise exception 'journal_account_missing' using errcode = 'P0001';
  end if;

  v_down := coalesce(contract_row.down_payment, 0);
  v_total := coalesce(contract_row.total_amount, 0);

  payment_account := null;
  v_balance := null;

  if v_down > 0 then
    select id, account_id, current_balance into payment_cashbox_id, payment_account, v_balance
    from public.cashboxes
    where branch_id = contract_row.branch_id and is_default and is_active
    limit 1
    for update;

    if payment_account is null then
      raise exception 'payment_source_missing' using errcode = 'P0001';
    end if;

    if coalesce(v_balance, 0) < v_down then
      raise exception 'insufficient_cashbox_balance' using errcode = 'P0001';
    end if;
  end if;

  -- 1: stock movements + vehicle sold
  for item in
    select * from public.sales_invoice_items
    where invoice_id = contract_row.sale_invoice_id
    order by line_no
  loop
    if item.product_id is not null then
      perform public.record_stock_movement(
        'sale', -item.quantity, item.product_id, null,
        item.unit_price, contract_row.branch_id,
        'sales_invoice', invoice_row.id, invoice_row.number
      );
    else
      perform public.record_stock_movement(
        'sale', -1, null, item.vehicle_id,
        item.unit_price, contract_row.branch_id,
        'sales_invoice', invoice_row.id, invoice_row.number
      );

      update public.vehicles
      set status = 'sold', updated_at = now(), updated_by = auth.uid()
      where id = item.vehicle_id;
    end if;
  end loop;

  -- 2: customer ledger
  insert into public.customer_transactions (
    customer_id, branch_id, transaction_type, transaction_date, amount,
    reference_type, reference_id, notes, created_by
  )
  values (
    contract_row.customer_id, contract_row.branch_id, 'sale',
    contract_row.contract_date, v_total,
    'contract', contract_row.id, contract_row.number, auth.uid()
  );

  if v_down > 0 then
    insert into public.customer_transactions (
      customer_id, branch_id, transaction_type, transaction_date, amount,
      reference_type, reference_id, notes, created_by
    )
    values (
      contract_row.customer_id, contract_row.branch_id, 'payment',
      contract_row.contract_date, -v_down,
      'contract', contract_row.id, contract_row.number, auth.uid()
    );
  end if;

  -- 3: down payment payment record + cashbox
  if v_down > 0 then
    insert into public.payments (
      contract_id, sale_invoice_id, customer_id, branch_id, payment_type,
      payment_date, amount, payment_method, cashbox_id, notes, created_by, updated_by
    )
    values (
      contract_row.id, invoice_row.id, contract_row.customer_id, contract_row.branch_id,
      'down_payment', contract_row.contract_date, v_down, 'cash',
      payment_cashbox_id, 'مقدم عقد ' || contract_row.number, auth.uid(), auth.uid()
    );

    update public.cashboxes
    set current_balance = current_balance + v_down,
        updated_at = now(), updated_by = auth.uid()
    where id = payment_cashbox_id;
  end if;

  -- 4: journal entry
  journal_number := public.next_entity_code('journal_entry');

  insert into public.journal_entries (
    branch_id, entry_number, entry_date, description, source_type, source_id,
    status, posted_at, posted_by, total_debit, total_credit, created_by, updated_by
  )
  values (
    contract_row.branch_id, journal_number, contract_row.contract_date,
    'اعتماد عقد تقسيط ' || contract_row.number,
    'contract', contract_row.id, 'posted', now(), auth.uid(),
    v_total, v_total, auth.uid(), auth.uid()
  )
  returning id into journal_id;

  if v_down > 0 then
    insert into public.journal_entry_lines (
      journal_entry_id, line_number, account_id, description, debit, credit, created_by
    )
    values (journal_id, 1, payment_account,
            'مقدم عقد ' || contract_row.number, v_down, 0, auth.uid());
  end if;

  if v_total - v_down > 0 then
    insert into public.journal_entry_lines (
      journal_entry_id, line_number, account_id, description, debit, credit, created_by
    )
    values (journal_id, case when v_down > 0 then 2 else 1 end, receivable_account,
            'ذمم عقد ' || contract_row.number, v_total - v_down, 0, auth.uid());
  end if;

  insert into public.journal_entry_lines (
    journal_entry_id, line_number, account_id, description, debit, credit, created_by
  )
  values (
    journal_id,
    case when v_down > 0 and v_total - v_down > 0 then 3
         when v_down > 0 or v_total - v_down > 0 then 2
         else 1 end,
    revenue_account,
    'إيراد عقد ' || contract_row.number, 0, v_total, auth.uid()
  );

  -- 5: mark contract active, invoice approved
  update public.contracts
  set status = 'active',
      approved_at = now(),
      approved_by = auth.uid(),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_contract_id
  returning * into contract_row;

  update public.sales_invoices
  set status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      remaining_amount = v_total - v_down,
      updated_at = now(),
      updated_by = auth.uid()
  where id = invoice_row.id;

  return contract_row;
end;
$$;

revoke all on function public.approve_contract(uuid) from public, anon;
grant execute on function public.approve_contract(uuid) to authenticated, service_role;
