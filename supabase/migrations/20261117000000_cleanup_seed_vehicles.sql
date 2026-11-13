-- 20261117 — One-off cleanup of seed/test vehicles.
--
-- The showroom was seeded with test vehicles. This deletes the 10 seed units
-- and keeps the three real ones (VEH-0004, VEH-0007, VEH-0013):
--
--   * 9 orphaned stock_movement rows (their sale/return documents were
--     already force-deleted earlier — the movements pointed at nothing).
--   * 5 draft invoices (SINV-00001..SINV-00005, customer محمد صلاح عثمان محمد —
--     kept) + their 5 items on VEH-0003.
--   * 5 draft contracts (CON-00001..CON-00005) + the one draft schedule and
--     its 30 pending installments.
--   * The 10 vehicles themselves.
--
-- Safety rails: every guard below aborts the whole transaction (nothing is
-- deleted) if anything is no longer in the expected draft/available state,
-- so this migration can never eat real business data by accident.

-- ---------------------------------------------------------------------------
-- 1. Guards.
-- ---------------------------------------------------------------------------

do $$
declare
  v_vehicle_ids uuid[];
  v_invoice_ids uuid[];
  v_contract_ids uuid[];
  v_installment_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_vehicle_ids
  from public.vehicles
  where code in ('VEH-0001','VEH-0002','VEH-0003','VEH-0005','VEH-0006',
                 'VEH-0008','VEH-0009','VEH-0010','VEH-0011','VEH-0012');

  if cardinality(v_vehicle_ids) = 0 then
    raise notice 'cleanup_seed_vehicles: nothing to delete (already cleaned up)';
    return;
  end if;

  -- All target vehicles must still be unsold & unreferenced by returns/warranty flows.
  if exists (
    select 1 from public.vehicles
    where id = any(v_vehicle_ids) and status not in ('available', 'returned', 'maintenance', 'damaged')
  ) then
    raise exception 'cleanup_aborted_vehicle_status' using errcode = 'P0001';
  end if;

  -- Invoices touching the target vehicles must all be draft.
  select coalesce(array_agg(distinct i.id), '{}') into v_invoice_ids
  from public.sales_invoices i
  where i.id in (select invoice_id from public.sales_invoice_items where vehicle_id = any(v_vehicle_ids));

  if exists (
    select 1 from public.sales_invoices where id = any(v_invoice_ids) and status <> 'draft'
  ) then
    raise exception 'cleanup_aborted_invoice_not_draft' using errcode = 'P0001';
  end if;

  -- Contracts for those invoices must all be draft.
  select coalesce(array_agg(c.id), '{}') into v_contract_ids
  from public.contracts c
  where c.sale_invoice_id = any(v_invoice_ids)
     or c.vehicle_id = any(v_vehicle_ids);

  if exists (
    select 1 from public.contracts where id = any(v_contract_ids) and status <> 'draft'
  ) then
    raise exception 'cleanup_aborted_contract_not_draft' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(i.id), '{}') into v_installment_ids
  from public.installments i
  join public.installment_schedules s on s.id = i.schedule_id
  where s.contract_id = any(v_contract_ids);

  -- No money must have moved anywhere in scope.
  if exists (
    select 1 from public.payments
    where sale_invoice_id = any(v_invoice_ids) or contract_id = any(v_contract_ids)
  ) then
    raise exception 'cleanup_aborted_payments_exist' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.journal_entries
    where (source_type = 'sales_invoice' and source_id = any(v_invoice_ids))
       or (source_type = 'contract' and source_id = any(v_contract_ids))
       or (source_type = 'installment' and source_id = any(v_installment_ids))
  ) then
    raise exception 'cleanup_aborted_journals_exist' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.customer_transactions
    where (reference_type = 'sales_invoice' and reference_id = any(v_invoice_ids))
       or (reference_type = 'contract' and reference_id = any(v_contract_ids))
       or (reference_type = 'installment' and reference_id = any(v_installment_ids))
  ) then
    raise exception 'cleanup_aborted_ledger_exists' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.sales_return_items
    where vehicle_id = any(v_vehicle_ids)
  ) then
    raise exception 'cleanup_aborted_returns_exist' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.sales_return_items r
    join public.sales_invoice_items ii on ii.id = r.sales_invoice_item_id
    where ii.invoice_id = any(v_invoice_ids)
  ) then
    raise exception 'cleanup_aborted_returns_exist' using errcode = 'P0001';
  end if;

  -- ------------------------------------------------------------------
  -- 2. Delete in dependency order.
  -- ------------------------------------------------------------------

  delete from public.installments
  where id = any(v_installment_ids);

  delete from public.installment_schedules
  where contract_id = any(v_contract_ids);

  delete from public.contract_guarantors
  where contract_id = any(v_contract_ids);

  delete from public.contracts
  where id = any(v_contract_ids);

  delete from public.sales_invoice_items
  where invoice_id = any(v_invoice_ids)
     or vehicle_id = any(v_vehicle_ids);

  delete from public.sales_invoices
  where id = any(v_invoice_ids);

  delete from public.stock_movements
  where vehicle_id = any(v_vehicle_ids);

  delete from public.vehicles
  where id = any(v_vehicle_ids);

  raise notice 'cleanup_seed_vehicles: deleted % vehicles, % invoices, % contracts',
    cardinality(v_vehicle_ids), cardinality(v_invoice_ids), cardinality(v_contract_ids);
end;
$$;
