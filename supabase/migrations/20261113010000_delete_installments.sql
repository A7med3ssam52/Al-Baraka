-- Delete installments (bulk, unpaid only) with automatic contract rebalancing.
--
-- Implements the product decision:
--   * Users may delete a SET of installments at once from the customer file /
--     the installments screen.
--   * Only UNPAID installments are eligible (paid_amount = 0 and status in
--     pending/overdue). Any paid, partially paid or waived row aborts the
--     whole operation (atomic).
--   * Deleting lowers the contract (and invoice) totals by the deleted sum:
--     financed_amount and total_amount are reduced by the same amount, so the
--     contract check `financed_amount = total_amount - down_payment` stays
--     valid. The difference is redistributed evenly across the remaining
--     UNPAID installments (the last one takes the rounding remainder).
--   * `installment_no` is renumbered sequentially (1..N) after every delete.
--   * Collections / journal entries already posted against OTHER installments
--     of the same contract are left untouched — only unpaid rows are removed.
--   * Permission: `installments.reschedule` (same permission that governs
--     editing an installment) plus branch membership.

create or replace function public.delete_installments(
  p_installment_ids uuid[],
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[] := coalesce(p_installment_ids, '{}');
  v_count integer;
  v_contract_ids uuid[];
  v_contract_id uuid;
  v_contract public.contracts;
  v_schedule_id uuid;
  v_schedule public.installment_schedules;
  v_deleted_sum numeric;
  v_deleted_count integer;
  v_paid_total numeric;
  v_unpaid_count integer;
  v_unpaid_target numeric;
  v_base numeric;
  v_allocated numeric;
  v_index integer;
  v_unpaid record;
  v_new_financed numeric;
  v_new_total numeric;
  v_new_count integer;
  v_new_schedule_count integer;
  v_result jsonb := '[]'::jsonb;
begin
  if not public.has_permission('installments.reschedule') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_ids := (select array_agg(distinct id) from unnest(v_ids) as id);

  if v_ids is null or array_length(v_ids, 1) is null then
    raise exception 'no_selection' using errcode = '22023';
  end if;

  -- Lock the selected rows and verify they all exist.
  perform 1 from public.installments where id = any(v_ids) for update;
  select count(*) into v_count from public.installments where id = any(v_ids);

  if v_count <> array_length(v_ids, 1) then
    raise exception 'installment_missing' using errcode = 'P0001';
  end if;

  -- Every selected installment must be unpaid and in a deletable state.
  if exists (
    select 1
    from public.installments
    where id = any(v_ids)
      and (paid_amount <> 0 or status not in ('pending', 'overdue'))
  ) then
    raise exception 'installment_locked' using errcode = '42501';
  end if;

  -- Branch membership for every selected row.
  if exists (
    select 1
    from public.installments i
    join public.installment_schedules s on s.id = i.schedule_id
    join public.contracts c on c.id = s.contract_id
    where i.id = any(v_ids)
      and not public.is_branch_member(c.branch_id)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- The schedule must be active and the contract must not be cancelled.
  if exists (
    select 1
    from public.installments i
    join public.installment_schedules s on s.id = i.schedule_id
    join public.contracts c on c.id = s.contract_id
    where i.id = any(v_ids)
      and (s.status <> 'active' or c.status = 'cancelled')
  ) then
    raise exception 'contract_locked' using errcode = '42501';
  end if;

  select array_agg(distinct s.contract_id) into v_contract_ids
  from public.installments i
  join public.installment_schedules s on s.id = i.schedule_id
  where i.id = any(v_ids);

  foreach v_contract_id in array v_contract_ids loop
    select * into v_contract from public.contracts where id = v_contract_id for update;
    if not found then
      raise exception 'contract_missing' using errcode = 'P0001';
    end if;

    select id into v_schedule_id
    from public.installment_schedules
    where contract_id = v_contract_id and status = 'active'
    order by version desc
    limit 1
    for update;

    if v_schedule_id is null then
      raise exception 'contract_locked' using errcode = '42501';
    end if;

    -- Make sure every selected installment of this contract belongs to the
    -- locked ACTIVE schedule (not a superseded one).
    select count(*) into v_deleted_count
    from public.installments
    where schedule_id = v_schedule_id and id = any(v_ids);

    if exists (
      select 1
      from public.installments i
      join public.installment_schedules s on s.id = i.schedule_id
      where i.id = any(v_ids) and s.contract_id = v_contract_id
        and s.id <> v_schedule_id
    ) then
      raise exception 'contract_locked' using errcode = '42501';
    end if;

    select * into v_schedule from public.installment_schedules where id = v_schedule_id;

    select coalesce(sum(amount), 0), count(*)
    into v_deleted_sum, v_deleted_count
    from public.installments
    where schedule_id = v_schedule_id and id = any(v_ids);

    -- Deleting every installment of the active schedule is not allowed —
    -- the contract cancel flow handles that case instead.
    select count(*) - v_deleted_count into v_new_schedule_count
    from public.installments
    where schedule_id = v_schedule_id;

    if v_new_schedule_count <= 0 then
      raise exception 'cannot_delete_all_installments' using errcode = '42501';
    end if;

    select coalesce(sum(paid_amount), 0) into v_paid_total
    from public.installments
    where schedule_id = v_schedule_id and id <> all(v_ids);

    v_new_financed := v_contract.financed_amount - v_deleted_sum;
    if v_new_financed < v_paid_total then
      raise exception 'installment_locked' using errcode = '42501';
    end if;

    v_new_total := v_new_financed + v_contract.down_payment;

    delete from public.installments
    where schedule_id = v_schedule_id and id = any(v_ids);

    -- Redistribute the remaining unpaid amount evenly.
    select count(*) into v_unpaid_count
    from public.installments
    where schedule_id = v_schedule_id
      and paid_amount = 0
      and status <> 'waived';

    v_unpaid_target := v_new_financed - v_paid_total;

    if v_unpaid_count > 0 then
      v_base := floor((v_unpaid_target / v_unpaid_count) * 100) / 100;
      v_index := 0;
      v_allocated := 0;

      for v_unpaid in
        select id
        from public.installments
        where schedule_id = v_schedule_id
          and paid_amount = 0
          and status <> 'waived'
        order by due_date, installment_no
      loop
        v_index := v_index + 1;

        if v_index = v_unpaid_count then
          update public.installments
          set amount = v_unpaid_target - v_allocated
          where id = v_unpaid.id;
        else
          update public.installments set amount = v_base where id = v_unpaid.id;
          v_allocated := v_allocated + v_base;
        end if;
      end loop;
    end if;

    -- Renumber installment_no sequentially (offset trick to avoid unique conflicts).
    update public.installments
    set installment_no = installment_no + 1000
    where schedule_id = v_schedule_id;

    update public.installments i
    set installment_no = numbered.rn
    from (
      select id, row_number() over (order by due_date, installment_no) as rn
      from public.installments
      where schedule_id = v_schedule_id
    ) as numbered
    where i.id = numbered.id;

    select count(*) into v_new_count
    from public.installments
    where schedule_id = v_schedule_id;

    update public.installment_schedules
    set total_amount = (
          select coalesce(sum(amount), 0)
          from public.installments
          where schedule_id = v_schedule_id
        ),
        installment_count = v_new_count
    where id = v_schedule_id;

    update public.contracts
    set financed_amount = v_new_financed,
        total_amount = v_new_total,
        installment_count = v_new_count,
        updated_at = now(),
        updated_by = auth.uid()
    where id = v_contract.id;

    -- Keep the (approved) sale invoice consistent with the new contract totals,
    -- mirroring the update_contract_terms behaviour. No cash is reversed here.
    if v_contract.sale_invoice_id is not null then
      update public.sales_invoices
      set subtotal = greatest(subtotal - v_deleted_sum, paid_amount),
          total = greatest(total - v_deleted_sum, paid_amount),
          remaining_amount = greatest(remaining_amount - v_deleted_sum, 0),
          updated_at = now(),
          updated_by = auth.uid()
      where id = v_contract.sale_invoice_id;
    end if;

    v_result := v_result || jsonb_build_object(
      'contract_id', v_contract.id,
      'contract_number', v_contract.number,
      'deleted_count', v_deleted_count,
      'deleted_amount', v_deleted_sum,
      'new_financed_amount', v_new_financed,
      'new_installment_count', v_new_count
    );
  end loop;

  return v_result;
end;
$$;

revoke all on function public.delete_installments(uuid[], text) from public, anon;
grant execute on function public.delete_installments(uuid[], text) to authenticated, service_role;

comment on function public.delete_installments(uuid[], text) is
  'Bulk-deletes UNPAID installments and rebalances the contract/invoice totals '
  'and the remaining unpaid installment amounts automatically.';
