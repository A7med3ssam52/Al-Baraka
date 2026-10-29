-- M5.5 — Collections report.

create or replace function public.get_collections_report(
  p_from date default null,
  p_to date default null,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.has_permission('reports.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_branch_id is not null and not public.is_branch_member(p_branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total_collected', coalesce(sum(p.amount), 0),
      'payment_count', count(*)::integer,
      'cash_total', coalesce(sum(p.amount) filter (where p.payment_method = 'cash'), 0),
      'bank_total', coalesce(sum(p.amount) filter (where p.payment_method = 'bank'), 0),
      'down_payment_total', coalesce(sum(p.amount) filter (where p.payment_type = 'down_payment'), 0),
      'installment_total', coalesce(sum(p.amount) filter (where p.payment_type = 'installment'), 0)
    ),
    'payments', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.payment_date desc)
       from (
         select p.id, p.payment_date, p.amount, p.payment_method, p.payment_type,
                p.receipt_number, c.full_name as customer_name, c.code as customer_code,
                b.name as branch_name, con.number as contract_number
         from public.payments as p
         join public.customers as c on c.id = p.customer_id
         join public.branches as b on b.id = p.branch_id
         left join public.contracts as con on con.id = p.contract_id
         where public.is_branch_member(p.branch_id)
           and (p_branch_id is null or p.branch_id = p_branch_id)
           and (p_from is null or p.payment_date >= p_from)
           and (p_to is null or p.payment_date <= p_to)
       ) r),
      '[]'::jsonb
    )
  ) into result
  from public.payments as p
  where public.is_branch_member(p.branch_id)
    and (p_branch_id is null or p.branch_id = p_branch_id)
    and (p_from is null or p.payment_date >= p_from)
    and (p_to is null or p.payment_date <= p_to);

  return coalesce(result, jsonb_build_object(
    'summary', jsonb_build_object(
      'total_collected',0,'payment_count',0,'cash_total',0,'bank_total',0,
      'down_payment_total',0,'installment_total',0
    ),
    'payments', '[]'::jsonb
  ));
end;
$$;

revoke all on function public.get_collections_report(date, date, uuid) from public, anon;
grant execute on function public.get_collections_report(date, date, uuid) to authenticated, service_role;
