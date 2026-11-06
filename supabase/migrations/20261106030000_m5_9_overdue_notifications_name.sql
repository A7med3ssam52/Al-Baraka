-- M5.9 — Include customer name in overdue installment notifications.
-- Title: "قسط ( اسم العميل ) متأخر"

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
    select i.id as installment_id, c.customer_id, c.branch_id, i.due_date, i.amount, i.paid_amount,
           cu.full_name as customer_name
    from public.installments i
    join public.installment_schedules s on s.id = i.schedule_id
    join public.contracts c on c.id = s.contract_id
    join public.customers cu on cu.id = c.customer_id
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
             'قسط (' || coalesce(rec.customer_name, 'بدون اسم') || ') متأخر',
             'القسط #' || rec.installment_id || ' مستحق منذ ' || rec.due_date
               || ' — المبلغ ' || rec.amount || ' جنيه، المدفوع ' || rec.paid_amount || ' جنيه.',
             'warning', 'installment', rec.installment_id
      from public.profiles as p
      where p.branch_id = v_branch and p.is_active;

      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;
