-- M5.4 — Waive and reschedule installments.

create or replace function public.waive_installment(p_installment_id uuid, p_reason text default null)
returns public.installments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inst_row public.installments;
  schedule_row public.installment_schedules;
  contract_row public.contracts;
begin
  if not public.has_permission('installments.waive') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into inst_row from public.installments where id = p_installment_id for update;
  if not found then raise exception 'installment_missing' using errcode = 'P0001'; end if;

  select * into schedule_row from public.installment_schedules where id = inst_row.schedule_id;
  select * into contract_row from public.contracts where id = schedule_row.contract_id;

  if not public.is_branch_member(contract_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if inst_row.status = 'paid' then
    raise exception 'installment_already_paid' using errcode = 'P0001';
  end if;

  update public.installments
  set status = 'waived',
      paid_amount = amount
  where id = p_installment_id
  returning * into inst_row;

  return inst_row;
end;
$$;

revoke all on function public.waive_installment(uuid, text) from public, anon;
grant execute on function public.waive_installment(uuid, text) to authenticated, service_role;

create or replace function public.reschedule_installment(
  p_installment_id uuid,
  p_new_due_date date,
  p_reason text default null
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
begin
  if not public.has_permission('installments.reschedule') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into inst_row from public.installments where id = p_installment_id for update;
  if not found then raise exception 'installment_missing' using errcode = 'P0001'; end if;

  select * into schedule_row from public.installment_schedules where id = inst_row.schedule_id;
  select * into contract_row from public.contracts where id = schedule_row.contract_id;

  if not public.is_branch_member(contract_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if inst_row.status in ('paid', 'waived') then
    raise exception 'installment_not_reschedulable' using errcode = 'P0001';
  end if;

  if p_new_due_date is null or p_new_due_date <= current_date then
    raise exception 'invalid_due_date' using errcode = '22023';
  end if;

  update public.installments
  set due_date = p_new_due_date
  where id = p_installment_id
  returning * into inst_row;

  return inst_row;
end;
$$;

revoke all on function public.reschedule_installment(uuid, date, text) from public, anon;
grant execute on function public.reschedule_installment(uuid, date, text) to authenticated, service_role;
