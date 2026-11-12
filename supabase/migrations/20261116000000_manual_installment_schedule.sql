-- 20261116 — Installment schedules with manual (explicit) dates & amounts.
--
-- Adds a new frequency 'manual': instead of deriving due dates from a fixed
-- interval, the caller supplies one row {due_date, amount} per installment.
-- The sum of amounts must equal the financed amount exactly and the dates
-- must be strictly ascending. Everything else (approval, collection,
-- rescheduling, reporting) is unchanged — the generated rows are ordinary
-- installments.
--
-- Affected functions (recreated here):
--   * validate_manual_installment_items (new internal helper)
--   * generate_installment_schedule(p_contract_id, p_preview, p_items jsonb)
--   * save_contract — accepts 'manual'
--   * update_contract_terms(..., p_items jsonb) — rebuilds a manual schedule
--
-- Contract/schedule frequency check constraints are widened to allow
-- 'manual'.

-- ---------------------------------------------------------------------------
-- 1. Widen frequency check constraints on contracts & installment_schedules.
--    Drop any existing check constraint mentioning 'frequency' on those tables
--    (name-agnostic, in case PG named it differently).
-- ---------------------------------------------------------------------------

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.contracts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%frequency%'
  loop
    execute format('alter table public.contracts drop constraint %I', r.conname);
  end loop;

  for r in
    select conname from pg_constraint
    where conrelid = 'public.installment_schedules'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%frequency%'
  loop
    execute format('alter table public.installment_schedules drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.contracts
  add constraint contracts_frequency_check
  check (frequency in ('weekly', 'biweekly', 'monthly', 'custom', 'manual'));

alter table public.installment_schedules
  add constraint installment_schedules_frequency_check
  check (frequency in ('weekly', 'biweekly', 'monthly', 'custom', 'manual'));

-- ---------------------------------------------------------------------------
-- 2. validate_manual_installment_items — shared validator/normalizer.
-- ---------------------------------------------------------------------------

create or replace function public.validate_manual_installment_items(
  p_items jsonb,
  p_expected_total numeric,
  p_expected_count integer default null
)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_date date;
  v_amount numeric;
  v_prev_date date;
  v_sum numeric := 0;
  v_count integer := 0;
  v_no integer := 0;
  v_norm jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'manual_items_required' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_items);

  if v_count < 1 or v_count > 360 then
    raise exception 'invalid_installment_count' using errcode = '22023';
  end if;

  if p_expected_count is not null and v_count <> p_expected_count then
    raise exception 'installment_items_count_mismatch' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_no := v_no + 1;

    begin
      v_date := (v_item ->> 'due_date')::date;
    exception when others then
      raise exception 'invalid_installment_date' using errcode = '22023';
    end;

    begin
      v_amount := round((v_item ->> 'amount')::numeric, 2);
    exception when others then
      raise exception 'invalid_installment_amount' using errcode = '22023';
    end;

    if v_date is null then
      raise exception 'invalid_installment_date' using errcode = '22023';
    end if;

    if v_amount is null or v_amount <= 0 then
      raise exception 'invalid_installment_amount' using errcode = '22023';
    end if;

    if v_prev_date is not null and v_date <= v_prev_date then
      raise exception 'manual_items_date_order' using errcode = '22023';
    end if;

    v_prev_date := v_date;
    v_sum := v_sum + v_amount;

    v_norm := v_norm || jsonb_build_object(
      'installment_no', v_no,
      'due_date', v_date,
      'amount', v_amount
    );
  end loop;

  if round(v_sum, 2) <> round(coalesce(p_expected_total, 0), 2) then
    raise exception 'installment_sum_mismatch' using errcode = '22023';
  end if;

  return v_norm;
end;
$$;

revoke all on function public.validate_manual_installment_items(jsonb, numeric, integer) from public, anon;
grant execute on function public.validate_manual_installment_items(jsonb, numeric, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. generate_installment_schedule — new p_items parameter.
-- ---------------------------------------------------------------------------

drop function if exists public.generate_installment_schedule(uuid, boolean);

create or replace function public.generate_installment_schedule(
  p_contract_id uuid,
  p_preview boolean default false,
  p_items jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  contract_row public.contracts;
  v_frequency text;
  v_custom_days integer;
  v_first_due date;
  v_count integer;
  v_total numeric;
  v_base_amount numeric;
  v_remainder numeric;
  v_interval_days integer;
  v_current_date date;
  v_version integer;
  v_schedule_id uuid;
  i integer;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  if not public.has_permission('contracts.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into contract_row from public.contracts where id = p_contract_id;

  if not found then
    raise exception 'contract_missing' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(contract_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if contract_row.status not in ('draft', 'active') then
    raise exception 'contract_not_active' using errcode = 'P0001';
  end if;

  v_frequency := contract_row.frequency;
  v_custom_days := contract_row.custom_days;
  v_first_due := contract_row.first_due_date;
  v_count := contract_row.installment_count;
  v_total := contract_row.financed_amount;

  if v_count < 1 then
    raise exception 'invalid_installment_count' using errcode = '22023';
  end if;

  -- ------------------------------------------------------------------
  -- Manual mode: the caller supplies one row per installment.
  -- ------------------------------------------------------------------
  if v_frequency = 'manual' then
    v_items := public.validate_manual_installment_items(p_items, v_total, v_count);
    v_first_due := (v_items -> 0 ->> 'due_date')::date;
  end if;

  if v_first_due is null then
    raise exception 'invalid_first_due_date' using errcode = '22023';
  end if;

  if v_frequency = 'weekly' then
    v_interval_days := 7;
  elsif v_frequency = 'biweekly' then
    v_interval_days := 14;
  elsif v_frequency = 'monthly' then
    v_interval_days := 0; -- handled specially (add months)
  elsif v_frequency = 'custom' then
    v_interval_days := v_custom_days;
    if v_interval_days is null or v_interval_days <= 0 then
      raise exception 'invalid_custom_days' using errcode = '22023';
    end if;
  elsif v_frequency = 'manual' then
    v_interval_days := null; -- not used
  else
    raise exception 'invalid_frequency' using errcode = '22023';
  end if;

  if v_frequency <> 'manual' then
    v_base_amount := trunc(v_total / v_count, 2);
    v_remainder := v_total - (v_base_amount * v_count);
  end if;

  -- preview mode: return items without persisting
  if p_preview then
    if v_frequency = 'manual' then
      return jsonb_build_object(
        'contract_id', p_contract_id,
        'total', v_total,
        'count', v_count,
        'frequency', v_frequency,
        'items', v_items
      );
    end if;

    v_current_date := v_first_due;
    v_items := '[]'::jsonb;
    for i in 1..v_count loop
      declare
        v_amt numeric := v_base_amount;
      begin
        if i = v_count then
          v_amt := v_base_amount + v_remainder;
        end if;

        v_items := v_items || jsonb_build_object(
          'installment_no', i,
          'due_date', v_current_date,
          'amount', v_amt
        );

        if v_frequency = 'monthly' then
          v_current_date := v_current_date + interval '1 month';
        else
          v_current_date := v_current_date + (v_interval_days || ' days')::interval;
        end if;
      end;
    end loop;

    return jsonb_build_object(
      'contract_id', p_contract_id,
      'total', v_total,
      'count', v_count,
      'frequency', v_frequency,
      'items', v_items
    );
  end if;

  -- persist: supersede any existing active schedule
  update public.installment_schedules
  set status = 'superseded'
  where contract_id = p_contract_id and status = 'active';

  -- next version
  select coalesce(max(version), 0) + 1 into v_version
  from public.installment_schedules
  where contract_id = p_contract_id;

  insert into public.installment_schedules (
    contract_id, version, total_amount, installment_count, frequency,
    custom_days, first_due_date, status, generated_by, created_by
  )
  values (
    p_contract_id, v_version, v_total, v_count, v_frequency,
    v_custom_days, v_first_due, 'draft', auth.uid(), auth.uid()
  )
  returning id into v_schedule_id;

  if v_frequency = 'manual' then
    i := 0;
    for v_item in select * from jsonb_array_elements(p_items) loop
      i := i + 1;
      insert into public.installments (
        schedule_id, installment_no, due_date, amount
      )
      values (
        v_schedule_id, i,
        (v_item ->> 'due_date')::date,
        round((v_item ->> 'amount')::numeric, 2)
      );
    end loop;
  else
    v_current_date := v_first_due;
    for i in 1..v_count loop
      declare
        v_amt numeric := v_base_amount;
      begin
        if i = v_count then
          v_amt := v_base_amount + v_remainder;
        end if;

        insert into public.installments (
          schedule_id, installment_no, due_date, amount
        )
        values (v_schedule_id, i, v_current_date, v_amt);

        if v_frequency = 'monthly' then
          v_current_date := v_current_date + interval '1 month';
        else
          v_current_date := v_current_date + (v_interval_days || ' days')::interval;
        end if;
      end;
    end loop;
  end if;

  return jsonb_build_object(
    'schedule_id', v_schedule_id,
    'contract_id', p_contract_id,
    'version', v_version,
    'total', v_total,
    'count', v_count
  );
end;
$$;

revoke all on function public.generate_installment_schedule(uuid, boolean, jsonb) from public, anon;
grant execute on function public.generate_installment_schedule(uuid, boolean, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. save_contract — accept 'manual' frequency.
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

  if clean_frequency not in ('weekly', 'biweekly', 'monthly', 'custom', 'manual') then
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
-- 5. update_contract_terms — new p_items parameter for manual schedules.
-- ---------------------------------------------------------------------------

drop function if exists public.update_contract_terms(uuid, numeric, integer, text, integer, date, text);

create or replace function public.update_contract_terms(
  p_contract_id uuid,
  p_total_amount numeric default null,
  p_installment_count integer default null,
  p_frequency text default null,
  p_custom_days integer default null,
  p_first_due_date date default null,
  p_notes text default null,
  p_items jsonb default null
)
returns public.contracts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur public.contracts;
  inv public.sales_invoices;
  paid_now numeric := 0;
  clean_freq text;
  new_total numeric;
  new_financed numeric;
  diff numeric;
  target_item record;
  v_norm jsonb;
  v_manual boolean;
  v_first_due date;
  v_item_count integer;
begin
  if not public.has_permission('contracts.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into cur from public.contracts where id = p_contract_id for update;
  if not found then raise exception 'contract_missing' using errcode = 'P0001'; end if;
  if not public.is_branch_member(cur.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if cur.status not in ('draft', 'active') then
    raise exception 'contract_locked' using errcode = '42501';
  end if;

  select coalesce(sum(paid_amount), 0) into paid_now
  from public.installments i
  join public.installment_schedules s on s.id = i.schedule_id
  where s.contract_id = p_contract_id;

  if paid_now > 0 or exists (
    select 1 from public.payments where contract_id = p_contract_id and payment_type = 'installment'
  ) then
    raise exception 'contract_has_payments' using errcode = '42501';
  end if;

  select * into inv from public.sales_invoices where id = cur.sale_invoice_id for update;
  if not found then raise exception 'invoice_missing' using errcode = 'P0001'; end if;

  clean_freq := lower(btrim(coalesce(p_frequency, cur.frequency)));
  if clean_freq not in ('weekly', 'biweekly', 'monthly', 'custom', 'manual') then
    raise exception 'invalid_frequency' using errcode = '22023';
  end if;
  if clean_freq = 'custom' and coalesce(p_custom_days, cur.custom_days, 0) <= 0 then
    raise exception 'invalid_custom_days' using errcode = '22023';
  end if;
  if clean_freq <> 'manual' and coalesce(p_installment_count, cur.installment_count) < 1 then
    raise exception 'invalid_installment_count' using errcode = '22023';
  end if;

  new_total := coalesce(p_total_amount, cur.total_amount);
  if new_total < cur.down_payment then
    raise exception 'invalid_down_payment' using errcode = '22023';
  end if;
  new_financed := new_total - cur.down_payment;

  v_manual := clean_freq = 'manual';

  if v_manual then
    -- validate + normalize items against the *new* financed amount
    v_norm := public.validate_manual_installment_items(p_items, new_financed, null);
    v_item_count := jsonb_array_length(v_norm);
    v_first_due := (v_norm -> 0 ->> 'due_date')::date;
  end if;

  if new_total <> cur.total_amount then
    diff := new_total - cur.total_amount;
    -- Put the whole price difference on the largest line.
    select * into target_item from public.sales_invoice_items
    where invoice_id = inv.id order by line_total desc limit 1;
    if not found then raise exception 'invoice_missing' using errcode = 'P0001'; end if;
    if target_item.line_total + diff < 0 then
      raise exception 'invalid_down_payment' using errcode = '22023';
    end if;
    update public.sales_invoice_items
    set unit_price = unit_price + (diff / nullif(quantity, 0)),
        line_total = line_total + diff
    where id = target_item.id;

    update public.sales_invoices
    set subtotal = subtotal + diff, total = new_total,
        remaining_amount = new_total - paid_amount,
        updated_at = now(), updated_by = auth.uid()
    where id = inv.id;
  end if;

  update public.contracts
  set total_amount = new_total,
      financed_amount = new_financed,
      installment_count = case when v_manual then v_item_count
                               else coalesce(p_installment_count, installment_count) end,
      frequency = clean_freq,
      custom_days = case when clean_freq = 'custom' then coalesce(p_custom_days, custom_days) else null end,
      first_due_date = case when v_manual then v_first_due
                            else coalesce(p_first_due_date, first_due_date) end,
      notes = nullif(btrim(coalesce(p_notes, notes, '')), ''),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_contract_id
  returning * into cur;

  -- Rebuild the schedule from the new terms.
  perform public.generate_installment_schedule(
    p_contract_id,
    false,
    case when v_manual then p_items else null end
  );

  return cur;
end;
$$;

revoke all on function public.update_contract_terms(uuid, numeric, integer, text, integer, date, text, jsonb) from public, anon;
grant execute on function public.update_contract_terms(uuid, numeric, integer, text, integer, date, text, jsonb)
  to authenticated, service_role;
