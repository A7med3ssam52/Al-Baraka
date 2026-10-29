-- M4.4 — Installment schedule generation.
--
-- Generates a payment schedule for an approved contract. Each installment gets
-- a due date based on frequency and a principal amount; the rounding remainder
-- is absorbed by the last installment so the sum equals the financed amount.

-- ---------------------------------------------------------------------------
-- 1. Tables.
-- ---------------------------------------------------------------------------

create table if not exists public.installment_schedules (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete restrict,
  version integer not null default 1 check (version > 0),
  total_amount numeric(14, 2) not null default 0 check (total_amount >= 0),
  installment_count integer not null check (installment_count > 0),
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly', 'custom')),
  custom_days integer check (custom_days is null or custom_days > 0),
  first_due_date date not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'superseded')),
  generated_at timestamptz not null default now(),
  generated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  unique (contract_id, version)
);

create index if not exists installment_schedules_contract_idx
  on public.installment_schedules (contract_id, version desc);

create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.installment_schedules (id) on delete cascade,
  installment_no integer not null check (installment_no > 0),
  due_date date not null,
  amount numeric(14, 2) not null check (amount >= 0),
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'partial', 'paid', 'overdue', 'waived')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (schedule_id, installment_no),
  check (paid_amount <= amount)
);

create index if not exists installments_schedule_idx
  on public.installments (schedule_id, installment_no);
create index if not exists installments_due_date_idx
  on public.installments (due_date, status);

-- ---------------------------------------------------------------------------
-- 2. RLS.
-- ---------------------------------------------------------------------------

alter table public.installment_schedules enable row level security;

drop policy if exists installment_schedules_select_authorized on public.installment_schedules;
create policy installment_schedules_select_authorized
on public.installment_schedules
for select
to authenticated
using (
  public.has_permission('installments.view')
  and exists (
    select 1 from public.contracts as contract
    where contract.id = installment_schedules.contract_id
      and public.is_branch_member(contract.branch_id)
  )
);

revoke all on public.installment_schedules from authenticated, anon;
grant select on public.installment_schedules to authenticated;

alter table public.installments enable row level security;

drop policy if exists installments_select_authorized on public.installments;
create policy installments_select_authorized
on public.installments
for select
to authenticated
using (
  public.has_permission('installments.view')
  and exists (
    select 1
    from public.installment_schedules as schedule
    join public.contracts as contract on contract.id = schedule.contract_id
    where schedule.id = installments.schedule_id
      and public.is_branch_member(contract.branch_id)
  )
);

revoke all on public.installments from authenticated, anon;
grant select on public.installments to authenticated;

-- ---------------------------------------------------------------------------
-- 3. generate_installment_schedule.
-- ---------------------------------------------------------------------------

create or replace function public.generate_installment_schedule(
  p_contract_id uuid,
  p_preview boolean default false
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

  if v_first_due is null then
    raise exception 'invalid_first_due_date' using errcode = '22023';
  end if;

  -- interval in days per installment
  if v_frequency = 'weekly' then
    v_interval_days := 7;
  elsif v_frequency = 'biweekly' then
    v_interval_days := 14;
  elsif v_frequency = 'monthly' then
    v_interval_days := 0; -- handled specially (add months)
  elsif v_frequency = 'custom' then
    v_interval_days := v_custom_days;
  else
    raise exception 'invalid_frequency' using errcode = '22023';
  end if;

  -- base amount per installment (rounded to 2 decimals)
  v_base_amount := trunc(v_total / v_count, 2);
  v_remainder := v_total - (v_base_amount * v_count);

  -- preview mode: return items without persisting
  if p_preview then
    v_current_date := v_first_due;
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

  return jsonb_build_object(
    'schedule_id', v_schedule_id,
    'contract_id', p_contract_id,
    'version', v_version,
    'total', v_total,
    'count', v_count
  );
end;
$$;

revoke all on function public.generate_installment_schedule(uuid, boolean) from public, anon;
grant execute on function public.generate_installment_schedule(uuid, boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. activate_schedule (mark a draft schedule as active).
-- ---------------------------------------------------------------------------

create or replace function public.activate_installment_schedule(p_schedule_id uuid)
returns public.installment_schedules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  schedule_row public.installment_schedules;
  contract_row public.contracts;
begin
  if not public.has_permission('contracts.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into schedule_row
  from public.installment_schedules
  where id = p_schedule_id
  for update;

  if not found then
    raise exception 'schedule_missing' using errcode = 'P0001';
  end if;

  select * into contract_row from public.contracts where id = schedule_row.contract_id;

  if not public.is_branch_member(contract_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if schedule_row.status <> 'draft' then
    raise exception 'schedule_not_draft' using errcode = 'P0001';
  end if;

  -- supersede other active schedules
  update public.installment_schedules
  set status = 'superseded'
  where contract_id = schedule_row.contract_id
    and status = 'active'
    and id <> p_schedule_id;

  update public.installment_schedules
  set status = 'active'
  where id = p_schedule_id
  returning * into schedule_row;

  return schedule_row;
end;
$$;

revoke all on function public.activate_installment_schedule(uuid) from public, anon;
grant execute on function public.activate_installment_schedule(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. list_installments for a contract (via active schedule).
-- ---------------------------------------------------------------------------

create or replace function public.list_contract_installments(p_contract_id uuid)
returns table (
  id uuid,
  schedule_id uuid,
  installment_no integer,
  due_date date,
  amount numeric,
  paid_amount numeric,
  status text,
  paid_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  schedule_id uuid;
begin
  if not public.has_permission('installments.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select s.id into schedule_id
  from public.installment_schedules as s
  join public.contracts as c on c.id = s.contract_id
  where s.contract_id = p_contract_id
    and s.status = 'active'
    and public.is_branch_member(c.branch_id)
  order by s.version desc
  limit 1;

  if schedule_id is null then
    return;
  end if;

  return query
  select i.id, i.schedule_id, i.installment_no, i.due_date, i.amount,
         i.paid_amount, i.status, i.paid_at
  from public.installments as i
  where i.schedule_id = schedule_id
  order by i.installment_no;
end;
$$;

revoke all on function public.list_contract_installments(uuid) from public, anon;
grant execute on function public.list_contract_installments(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Audit.
-- ---------------------------------------------------------------------------

drop trigger if exists audit_installment_schedules_change on public.installment_schedules;
create trigger audit_installment_schedules_change
after insert or update or delete on public.installment_schedules
for each row execute function public.audit_row_change();

drop trigger if exists audit_installments_change on public.installments;
create trigger audit_installments_change
after insert or update or delete on public.installments
for each row execute function public.audit_row_change();
