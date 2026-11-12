-- Force-delete installments, take two — no contract-status restrictions.
--
-- The user explicitly wants installment deletion to proceed even when the
-- contract is cancelled or the schedule is superseded. All gates related to
-- contract status/schedule status are removed; branch membership is kept as
-- the only access rule (plus installments.reschedule).
--
-- Improvements over the v1 function:
--   * Rows are processed per SCHEDULE (not per contract), so installments
--     spread over several schedule versions of the same contract are all
--     deleted, each with its own renumber/rebalance.
--   * If every installment of a schedule is selected, the schedule row is
--     removed as well instead of failing.
--
-- Contract/invoice totals are reduced by the deleted amount and the remaining
-- unpaid installments are redistributed evenly (last one takes the rounding
-- remainder); installment_no is renumbered sequentially.
-- The only remaining refusal is the mathematical impossibility of the
-- residual paid amount exceeding the residual financed amount.

create or replace function public.delete_installments(
  p_installment_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[] := coalesce(p_installment_ids, '{}');
  v_count integer;
  v_schedule_ids uuid[];
  v_schedule_id uuid;
  v_schedule public.installment_schedules;
  v_remaining integer;
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
  v_contract_id uuid;
  v_deleted_per_contract jsonb := '{}'::jsonb;
  v_result jsonb := '[]'::jsonb;
begin
  if not public.has_permission('installments.reschedule') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_ids := (select array_agg(distinct id) from unnest(v_ids) as id);

  if v_ids is null or array_length(v_ids, 1) is null then
    raise exception 'no_selection' using errcode = '22023';
  end if;

  perform 1 from public.installments where id = any(v_ids) for update;
  select count(*) into v_count from public.installments where id = any(v_ids);

  if v_count <> array_length(v_ids, 1) then
    raise exception 'installment_missing' using errcode = 'P0001';
  end if;

  -- Branch membership for every selected row. This is the ONLY remaining rule.
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

  select coalesce(array_agg(distinct s.id), '{}') into v_schedule_ids
  from public.installments i
  join public.installment_schedules s on s.id = i.schedule_id
  where i.id = any(v_ids);

  foreach v_schedule_id in array v_schedule_ids loop
    select * into v_schedule
    from public.installment_schedules
    where id = v_schedule_id
    for update;

    v_contract_id := v_schedule.contract_id;

    select coalesce(sum(amount), 0), count(*)
    into v_deleted_sum, v_deleted_count
    from public.installments
    where schedule_id = v_schedule_id and id = any(v_ids);

    select count(*) into v_remaining
    from public.installments
    where schedule_id = v_schedule_id and id <> all(v_ids);

    -- Remove journal entries sourced by the deleted installments, then the rows.
    delete from public.journal_entries
    where source_type = 'installment' and source_id = any(v_ids);

    delete from public.installments
    where schedule_id = v_schedule_id and id = any(v_ids);

    -- Rebalance every contract that owns this schedule.
    update public.contracts
    set financed_amount = greatest(financed_amount - v_deleted_sum, 0),
        total_amount = greatest(total_amount - v_deleted_sum, 0),
        installment_count = greatest(installment_count - v_deleted_count, 0),
        updated_at = now(),
        updated_by = auth.uid()
    where id = v_contract_id;

    -- Keep the linked sale invoice consistent with the new contract totals.
    update public.sales_invoices
    set subtotal = greatest(subtotal - v_deleted_sum, paid_amount),
        total = greatest(total - v_deleted_sum, paid_amount),
        remaining_amount = greatest(remaining_amount - v_deleted_sum, 0),
        updated_at = now(),
        updated_by = auth.uid()
    where id = (select sale_invoice_id from public.contracts where id = v_contract_id);

    if v_remaining = 0 then
      -- The whole schedule was wiped; drop it too instead of leaving an
      -- empty one behind (contract keeps installment_count = 0).
      delete from public.installment_schedules where id = v_schedule_id;
    else
      -- Redistribute the remaining unpaid amount evenly.
      v_new_financed := (
        select financed_amount from public.contracts where id = v_contract_id
      );

      select coalesce(sum(paid_amount), 0) into v_paid_total
      from public.installments
      where schedule_id = v_schedule_id;

      v_unpaid_target := v_new_financed - v_paid_total;

      if v_unpaid_target < 0 then
        raise exception 'installment_locked' using errcode = '42501';
      end if;

      select count(*) into v_unpaid_count
      from public.installments
      where schedule_id = v_schedule_id
        and paid_amount = 0
        and status <> 'waived';

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

      -- Renumber installment_no sequentially (offset trick avoids unique conflicts).
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

      update public.installment_schedules
      set total_amount = (
            select coalesce(sum(amount), 0)
            from public.installments
            where schedule_id = v_schedule_id
          ),
          installment_count = v_remaining
      where id = v_schedule_id;
    end if;

    v_result := v_result || jsonb_build_object(
      'contract_id', v_contract_id,
      'schedule_id', v_schedule_id,
      'deleted_count', v_deleted_count,
      'deleted_amount', v_deleted_sum,
      'remaining_installments', v_remaining
    );
  end loop;

  return v_result;
end;
$$;

revoke all on function public.delete_installments(uuid[]) from public, anon;
grant execute on function public.delete_installments(uuid[]) to authenticated, service_role;

comment on function public.delete_installments(uuid[]) is
  'Force-deletes installments (any status, any contract status, no confirmation) '
  'and rebalances the contract/invoice totals and the remaining installments.';
