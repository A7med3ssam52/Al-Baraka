-- M3.5 — Atomic purchase approval.
--
-- Approving a draft purchase invoice applies every effect in one transaction:
--   1. stock movements for product lines and vehicle serial entries,
--   2. vehicle purchase price / approved cost / supplier,
--   3. supplier ledger (invoice + any upfront payment),
--   4. cashbox or bank movement for the paid amount,
--   5. a balanced posted journal entry.
-- Any failure rolls the whole approval back and the invoice stays a draft.

insert into public.code_sequences (entity, prefix, padding)
values ('journal_entry', 'JE', 6)
on conflict (entity) do nothing;

create or replace function public.approve_purchase_invoice(p_invoice_id uuid)
returns public.purchase_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.purchase_invoices;
  item record;
  v_paid numeric;
  v_total numeric;
  v_balance numeric;
  inventory_account uuid;
  supplier_account uuid;
  payment_account uuid;
  journal_id uuid;
  journal_number text;
  cash_transaction_id uuid;
begin
  if not public.has_permission('purchases.approve') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into current_row
  from public.purchase_invoices
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
    select 1 from public.suppliers
    where id = current_row.supplier_id and status = 'active'
  ) then
    raise exception 'supplier_inactive' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.purchase_invoice_items where invoice_id = p_invoice_id
  ) then
    raise exception 'invalid_invoice_items' using errcode = '22023';
  end if;

  select id into inventory_account from public.accounts where code = '1300';
  select id into supplier_account from public.accounts where code = '2101';

  if inventory_account is null or supplier_account is null then
    raise exception 'journal_account_missing' using errcode = 'P0001';
  end if;

  payment_account := null;

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

  v_paid := coalesce(current_row.paid_amount, 0);
  v_total := coalesce(current_row.total, 0);

  if v_paid > 0 and payment_account is null then
    raise exception 'payment_source_missing' using errcode = 'P0001';
  end if;

  if v_paid > 0 and current_row.payment_method = 'cash' and coalesce(v_balance, 0) < v_paid then
    raise exception 'insufficient_cashbox_balance' using errcode = 'P0001';
  end if;

  -- 1 + 2: stock, vehicle costs, and serial movements.
  for item in
    select * from public.purchase_invoice_items
    where invoice_id = p_invoice_id
    order by line_no
  loop
    if item.product_id is not null then
      perform public.record_stock_movement(
        'purchase', item.quantity, item.product_id, null,
        item.landed_unit_cost, current_row.branch_id,
        'purchase_invoice', current_row.id, current_row.number
      );
    else
      if not exists (
        select 1 from public.vehicles
        where id = item.vehicle_id and status = 'available'
      ) then
        raise exception 'vehicle_unavailable' using errcode = 'P0001';
      end if;

      perform public.record_stock_movement(
        'purchase', 1, null, item.vehicle_id,
        item.landed_unit_cost, current_row.branch_id,
        'purchase_invoice', current_row.id, current_row.number
      );

      update public.vehicles
      set purchase_price = item.unit_price,
          approved_cost = item.landed_unit_cost,
          supplier_id = current_row.supplier_id,
          purchase_date = current_row.invoice_date,
          updated_at = now(),
          updated_by = auth.uid()
      where id = item.vehicle_id;
    end if;
  end loop;

  -- 3: supplier ledger.
  insert into public.supplier_transactions (
    supplier_id, branch_id, transaction_type, transaction_date, amount,
    reference_type, reference_id, notes, created_by
  )
  values (
    current_row.supplier_id, current_row.branch_id, 'invoice',
    current_row.invoice_date, v_total,
    'purchase_invoice', current_row.id, current_row.number, auth.uid()
  );

  if v_paid > 0 then
    insert into public.supplier_transactions (
      supplier_id, branch_id, transaction_type, transaction_date, amount,
      reference_type, reference_id, notes, created_by
    )
    values (
      current_row.supplier_id, current_row.branch_id, 'payment',
      current_row.invoice_date, -v_paid,
      'purchase_invoice', current_row.id, current_row.number, auth.uid()
    );
  end if;

  -- 5: journal entry (inventory + supplier, plus the upfront payment).
  journal_number := public.next_entity_code('journal_entry');

  insert into public.journal_entries (
    branch_id, entry_number, entry_date, description, source_type, source_id,
    status, posted_at, posted_by, total_debit, total_credit, created_by, updated_by
  )
  values (
    current_row.branch_id, journal_number, current_row.invoice_date,
    'اعتماد فاتورة شراء ' || current_row.number,
    'purchase_invoice', current_row.id, 'posted', now(), auth.uid(),
    v_total + v_paid, v_total + v_paid, auth.uid(), auth.uid()
  )
  returning id into journal_id;

  insert into public.journal_entry_lines (
    journal_entry_id, line_number, account_id, description, debit, credit, created_by
  )
  values
    (journal_id, 1, inventory_account,
      'مخزون مشتريات ' || current_row.number, v_total, 0, auth.uid()),
    (journal_id, 2, supplier_account,
      'موردون ' || current_row.number, 0, v_total, auth.uid());

  if v_paid > 0 then
    insert into public.journal_entry_lines (
      journal_entry_id, line_number, account_id, description, debit, credit, created_by
    )
    values
      (journal_id, 3, supplier_account,
        'سداد مقدم ' || current_row.number, v_paid, 0, auth.uid()),
      (journal_id, 4, payment_account,
        'دفعة نقدية ' || current_row.number, 0, v_paid, auth.uid());
  end if;

  -- 4: cashbox / bank movement.
  if v_paid > 0 then
    if current_row.payment_method = 'cash' then
      update public.cashboxes
      set current_balance = current_balance - v_paid,
          updated_at = now(),
          updated_by = auth.uid()
      where id = current_row.cashbox_id;

      insert into public.cash_transactions (
        branch_id, cashbox_id, journal_entry_id, transaction_type,
        transaction_date, amount, reference_type, reference_id, description, created_by
      )
      values (
        current_row.branch_id, current_row.cashbox_id, journal_id, 'payment',
        current_row.invoice_date, v_paid, 'purchase_invoice', current_row.id,
        'سداد فاتورة شراء ' || current_row.number, auth.uid()
      )
      returning id into cash_transaction_id;
    else
      update public.bank_accounts
      set current_balance = current_balance - v_paid,
          updated_at = now(),
          updated_by = auth.uid()
      where id = current_row.bank_account_id;

      insert into public.cash_transactions (
        branch_id, bank_account_id, journal_entry_id, transaction_type,
        transaction_date, amount, reference_type, reference_id, description, created_by
      )
      values (
        current_row.branch_id, current_row.bank_account_id, journal_id, 'payment',
        current_row.invoice_date, v_paid, 'purchase_invoice', current_row.id,
        'سداد فاتورة شراء ' || current_row.number, auth.uid()
      )
      returning id into cash_transaction_id;
    end if;
  end if;

  update public.purchase_invoices
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

revoke all on function public.approve_purchase_invoice(uuid) from public, anon;
grant execute on function public.approve_purchase_invoice(uuid) to authenticated, service_role;
