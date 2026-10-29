-- M5.1 — Installment status engine.

-- ---------------------------------------------------------------------------
-- 1. Status computation function.
-- ---------------------------------------------------------------------------

create or replace function public.installment_status(
  p_due_date date,
  p_amount numeric,
  p_paid_amount numeric
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_paid numeric := coalesce(p_paid_amount, 0);
  v_amount numeric := coalesce(p_amount, 0);
begin
  if v_amount <= 0 then
    return 'paid';
  end if;

  if v_paid >= v_amount then
    return 'paid';
  end if;

  if v_paid > 0 then
    return 'partial';
  end if;

  if p_due_date is null then
    return 'pending';
  end if;

  if p_due_date > current_date then
    return 'pending';
  end if;

  if p_due_date = current_date then
    return 'due';
  end if;

  return 'overdue';
end;
$$;

revoke all on function public.installment_status(date, numeric, numeric) from public, anon;
grant execute on function public.installment_status(date, numeric, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. View with computed status.
-- ---------------------------------------------------------------------------

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
  c.branch_id
from public.installments as i
join public.installment_schedules as s on s.id = i.schedule_id
join public.contracts as c on c.id = s.contract_id;

-- ---------------------------------------------------------------------------
-- 3. Customer financial summary.
-- ---------------------------------------------------------------------------

create or replace function public.customer_financial_summary(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.has_permission('customers.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.customers
    where id = p_customer_id and public.is_branch_member(branch_id)
  ) then
    raise exception 'customer_missing' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'customer_id', p_customer_id,
    'contract_count', coalesce((select count(*) from public.contracts where customer_id = p_customer_id), 0),
    'active_contract_count', coalesce((select count(*) from public.contracts where customer_id = p_customer_id and status = 'active'), 0),
    'total_financed', coalesce((select sum(financed_amount) from public.contracts where customer_id = p_customer_id and status in ('active','completed')), 0),
    'total_paid', coalesce((select sum(paid_amount) from public.installments i join public.installment_schedules s on s.id=i.schedule_id join public.contracts c on c.id=s.contract_id where c.customer_id = p_customer_id), 0),
    'overdue_count', coalesce((select count(*) from public.v_installment_status where customer_id = p_customer_id and computed_status = 'overdue'), 0),
    'overdue_amount', coalesce((select sum(remaining_amount) from public.v_installment_status where customer_id = p_customer_id and computed_status = 'overdue'), 0),
    'next_due_date', (select min(due_date) from public.v_installment_status where customer_id = p_customer_id and computed_status in ('pending','due','overdue'))
  ) into result;

  return result;
end;
$$;

revoke all on function public.customer_financial_summary(uuid) from public, anon;
grant execute on function public.customer_financial_summary(uuid) to authenticated, service_role;
