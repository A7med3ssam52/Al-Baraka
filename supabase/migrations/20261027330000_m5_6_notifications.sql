-- M5.6 — Overdue installment notifications (minimal).

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete cascade,
  title text not null,
  body text,
  notification_type text not null default 'info'
    check (notification_type in ('info', 'warning', 'error', 'success')),
  reference_type text,
  reference_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_read_idx
  on public.notifications (user_id, is_read, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

revoke all on public.notifications from authenticated, anon;
grant select, insert, update on public.notifications to authenticated;

-- Function to generate overdue notifications for a branch.
create or replace function public.generate_overdue_notifications(p_branch_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
  v_branch uuid;
  rec record;
begin
  for rec in
    select i.id as installment_id, c.customer_id, c.branch_id, i.due_date, i.amount, i.paid_amount
    from public.installments i
    join public.installment_schedules s on s.id = i.schedule_id
    join public.contracts c on c.id = s.contract_id
    where s.status = 'active'
      and i.status in ('pending', 'partial', 'overdue')
      and i.due_date < current_date
      and (p_branch_id is null or c.branch_id = p_branch_id)
  loop
    v_branch := rec.branch_id;

    if not exists (
      select 1 from public.notifications
      where reference_type = 'installment'
        and reference_id = rec.installment_id
        and created_at::date = current_date
    ) then
      insert into public.notifications (
        user_id, branch_id, title, body, notification_type, reference_type, reference_id
      )
      select p.id, v_branch,
             'قسط متأخر',
             'القسط #' || rec.installment_id || ' مستحق منذ ' || rec.due_date,
             'warning', 'installment', rec.installment_id
      from public.profiles as p
      where p.branch_id = v_branch and p.is_active;

      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.generate_overdue_notifications(uuid) from public, anon;
grant execute on function public.generate_overdue_notifications(uuid) to authenticated, service_role;
