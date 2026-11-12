-- 20261116 — Legacy (paper-ledger) installments: onboard contracts whose
-- installments were already collected before the system, with zero cash or
-- payment effects, and keep tracking the outstanding ones.
--
-- approve_contract gains two optional parameters:
--   * p_legacy_installment_nos integer[] — installment numbers (of the freshly
--     generated schedule) that were already paid in the old ledger. They are
--     marked paid (paid_amount = amount, status = 'paid') with
--     legacy_paid = true. NO payment row, NO cashbox movement, NO ledger
--     entry against the cash accounts — a customer_transactions "payment" row
--     is still written (dated on the due date, note 'دفتر قديم — قسط رقم N')
--     so customer statements reflect the old receipts.
--   * p_legacy_down_payment boolean — the down payment was also collected in
--     the old ledger. Same treatment: customer_transactions row with note
--     'دفتر قديم — مقدم'; no payment row / cashbox / journal line.
--
-- The sale journal is replaced by a single opening entry:
--   Dr cash (down received now, only when down is NOT legacy)
--   Dr receivable (remaining, when > 0)
--   Cr revenue (when > 0)   — revenue for legacy-collected portions stays in
--                             the old books and is not re-posted.
-- If nothing would be posted (everything legacy + legacy down + zero
-- remainder) the entry is skipped entirely.
-- The down-payment ledger/payment rows are skipped too, and the vehicle is
-- still marked sold + stock movement posted, exactly as before.
--
-- Normal calls (both parameters omitted / empty) behave byte-for-byte like
-- the previous version.

-- ---------------------------------------------------------------------------
-- 1. installments.legacy_paid + v_installment_status exposes it.
-- ---------------------------------------------------------------------------

alter table public.installments
  add column if not exists legacy_paid boolean not null default false;

comment on column public.installments.legacy_paid is
  'True when the installment was marked as paid in the paper ledger before the system (no cash/journal movement).';

create or replace view public.v_installment_status as
select
  i.id,
  i.schedule_id,
  i.installment_no,
  i.due_date,
  i.amount,
  i.paid_amount,
  i.status as stored_status,
  public.installment_status(i.due_date, i.amount, i.paid_amount) as computed_status,
  (i.amount - i.paid_amount) as remaining_amount,
  s.contract_id,
  c.customer_id,
  c.branch_id,
  i.legacy_paid
from public.installments as i
join public.installment_schedules as s on s.id = i.schedule_id
join public.contracts as c on c.id = s.contract_id;

-- ---------------------------------------------------------------------------
-- 2. approve_contract — optional legacy parameters.
-- ---------------------------------------------------------------------------

drop function if exists public.approve_contract(uuid);

create or replace function public.approve_contract(
  p_contract_id uuid,
  p_legacy_installment_nos integer[] default null,
  p_legacy_down_payment boolean default false
)
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
  v_legacy_nos integer[];
  v_legacy_count integer := 0;
  v_legacy_sum numeric := 0;
  v_legacy_any boolean := false;
  v_legacy_down boolean := coalesce(p_legacy_down_payment, false);
  v_remaining numeric;
  v_revenue numeric;
  v_cash_leg numeric := 0;
  v_line integer;
  v_inst public.installments;
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

  -- ------------------------------------------------------------------
  -- Validate the legacy selection against this schedule.
  -- ------------------------------------------------------------------
  select coalesce(array_agg(distinct n), '{}') into v_legacy_nos
  from unnest(coalesce(p_legacy_installment_nos, '{}')) as n;

  if array_length(v_legacy_nos, 1) > 0 then
    select count(*), coalesce(sum(i.amount), 0)
    into v_legacy_count, v_legacy_sum
    from public.installments i
    where i.schedule_id = schedule_row.id
      and i.installment_no = any(v_legacy_nos);

    if v_legacy_count <> array_length(v_legacy_nos, 1) then
      raise exception 'legacy_installment_invalid' using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from public.installments i
      where i.schedule_id = schedule_row.id
        and i.installment_no = any(v_legacy_nos)
        and (i.status <> 'pending' or i.paid_amount <> 0)
    ) then
      raise exception 'legacy_installment_invalid' using errcode = 'P0001';
    end if;
  end if;

  v_legacy_any := v_legacy_count > 0 or v_legacy_down;

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
  payment_cashbox_id := null;
  v_balance := null;

  -- Down payment source — needed only when cash actually moves now.
  if v_down > 0 and not v_legacy_down then
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

  -- 2: customer ledger — sale row is always recorded
  insert into public.customer_transactions (
    customer_id, branch_id, transaction_type, transaction_date, amount,
    reference_type, reference_id, notes, created_by
  )
  values (
    contract_row.customer_id, contract_row.branch_id, 'sale',
    contract_row.contract_date, v_total,
    'contract', contract_row.id, contract_row.number, auth.uid()
  );

  if v_legacy_any then
    -- ================================================================
    -- LEGACY PATH — no cash movement for old-ledger portions
    -- ================================================================

    -- down payment
    if v_down > 0 then
      if v_legacy_down then
        insert into public.customer_transactions (
          customer_id, branch_id, transaction_type, transaction_date, amount,
          reference_type, reference_id, notes, created_by
        )
        values (
          contract_row.customer_id, contract_row.branch_id, 'payment',
          contract_row.contract_date, -v_down,
          'contract', contract_row.id, 'دفتر قديم — مقدم', auth.uid()
        );
      else
        insert into public.customer_transactions (
          customer_id, branch_id, transaction_type, transaction_date, amount,
          reference_type, reference_id, notes, created_by
        )
        values (
          contract_row.customer_id, contract_row.branch_id, 'payment',
          contract_row.contract_date, -v_down,
          'contract', contract_row.id, contract_row.number, auth.uid()
        );

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

        v_cash_leg := v_down;
      end if;
    end if;

    -- legacy installments: mark paid, ledger-only
    if v_legacy_count > 0 then
      update public.installments i
      set paid_amount = i.amount,
          status = 'paid',
          paid_at = now(),
          legacy_paid = true
      where i.schedule_id = schedule_row.id
        and i.installment_no = any(v_legacy_nos);

      for v_inst in
        select * from public.installments i
        where i.schedule_id = schedule_row.id
          and i.installment_no = any(v_legacy_nos)
      loop
        insert into public.customer_transactions (
          customer_id, branch_id, transaction_type, transaction_date, amount,
          reference_type, reference_id, notes, created_by
        )
        values (
          contract_row.customer_id, contract_row.branch_id, 'payment',
          v_inst.due_date, -v_inst.amount,
          'installment', v_inst.id,
          'دفتر قديم — قسط رقم ' || v_inst.installment_no, auth.uid()
        );
      end loop;
    end if;

    v_remaining := v_total - v_down - v_legacy_sum;
    v_revenue := v_total - v_legacy_sum - (case when v_legacy_down then v_down else 0 end);

    -- 4: one opening journal entry (no revenue/receivable split beyond what
    --    the system will actually collect)
    if v_cash_leg > 0 or v_remaining > 0 or v_revenue > 0 then
      journal_number := public.next_entity_code('journal_entry');

      insert into public.journal_entries (
        branch_id, entry_number, entry_date, description, source_type, source_id,
        status, posted_at, posted_by, total_debit, total_credit, created_by, updated_by
      )
      values (
        contract_row.branch_id, journal_number, contract_row.contract_date,
        'اعتماد عقد تقسيط ' || contract_row.number || ' (افتتاحي)',
        'contract', contract_row.id, 'posted', now(), auth.uid(),
        v_cash_leg + greatest(v_remaining, 0), greatest(v_revenue, 0), auth.uid(), auth.uid()
      )
      returning id into journal_id;

      v_line := 0;

      if v_cash_leg > 0 then
        v_line := v_line + 1;
        insert into public.journal_entry_lines (
          journal_entry_id, line_number, account_id, description, debit, credit, created_by
        )
        values (journal_id, v_line, payment_account,
                'مقدم عقد ' || contract_row.number || ' (افتتاحي)',
                v_cash_leg, 0, auth.uid());
      end if;

      if v_remaining > 0 then
        v_line := v_line + 1;
        insert into public.journal_entry_lines (
          journal_entry_id, line_number, account_id, description, debit, credit, created_by
        )
        values (journal_id, v_line, receivable_account,
                'ذمم عقد ' || contract_row.number || ' (افتتاحي)',
                v_remaining, 0, auth.uid());
      end if;

      if v_revenue > 0 then
        v_line := v_line + 1;
        insert into public.journal_entry_lines (
          journal_entry_id, line_number, account_id, description, debit, credit, created_by
        )
        values (journal_id, v_line, revenue_account,
                'إيراد عقد ' || contract_row.number || ' (افتتاحي)',
                0, v_revenue, auth.uid());
      end if;
    end if;

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
        remaining_amount = greatest(v_remaining, 0),
        updated_at = now(),
        updated_by = auth.uid()
    where id = invoice_row.id;

    return contract_row;
  end if;

  -- ================================================================
  -- ORIGINAL PATH (unchanged behaviour for normal onboarding)
  -- ================================================================

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

revoke all on function public.approve_contract(uuid, integer[], boolean) from public, anon;
grant execute on function public.approve_contract(uuid, integer[], boolean) to authenticated, service_role;
