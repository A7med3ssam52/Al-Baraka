-- M4.7 — Sales report (by period/branch/employee).

create or replace function public.get_sales_report(
  p_from date default null,
  p_to date default null,
  p_branch_id uuid default null,
  p_status text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  status_filter text := lower(btrim(coalesce(p_status, 'all')));
begin
  if not public.has_permission('reports.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_branch_id is not null and not public.is_branch_member(p_branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'summary', jsonb_build_object(
      'invoice_count', count(*)::integer,
      'approved_count', count(*) filter (where report_row.status = 'approved')::integer,
      'draft_count', count(*) filter (where report_row.status = 'draft')::integer,
      'cancelled_count', count(*) filter (where report_row.status = 'cancelled')::integer,
      'total_amount', coalesce(sum(report_row.total) filter (where report_row.status = 'approved'), 0),
      'paid_amount', coalesce(sum(report_row.paid_amount) filter (where report_row.status = 'approved'), 0),
      'remaining_amount', coalesce(sum(report_row.remaining_amount) filter (where report_row.status = 'approved'), 0),
      'cash_count', count(*) filter (where report_row.status = 'approved' and report_row.sale_type = 'cash')::integer,
      'installment_count', count(*) filter (where report_row.status = 'approved' and report_row.sale_type = 'installment')::integer,
      'vehicle_count', coalesce(sum(report_row.vehicle_count) filter (where report_row.status = 'approved'), 0)::integer,
      'product_revenue', coalesce(sum(report_row.product_revenue) filter (where report_row.status = 'approved'), 0)
    ),
    'by_branch', '[]'::jsonb,
    'invoices', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.invoice_date desc, r.number desc)
       from (
         select invoice.id, invoice.number, invoice.invoice_date, invoice.status,
                invoice.sale_type, invoice.total, invoice.paid_amount, invoice.remaining_amount,
                invoice.approved_at, customer.full_name as customer_name, customer.code as customer_code,
                branch.name as branch_name, creator.full_name as created_by_name
         from public.sales_invoices as invoice
         join public.customers as customer on customer.id = invoice.customer_id
         join public.branches as branch on branch.id = invoice.branch_id
         left join public.profiles as creator on creator.id = invoice.created_by
         where public.is_branch_member(invoice.branch_id)
           and (p_branch_id is null or invoice.branch_id = p_branch_id)
           and (p_from is null or invoice.invoice_date >= p_from)
           and (p_to is null or invoice.invoice_date <= p_to)
           and (status_filter = 'all' or invoice.status = status_filter)
       ) r),
      '[]'::jsonb
    )
  )
  into result
  from (
    select
      invoice.id, invoice.number, invoice.invoice_date, invoice.status,
      invoice.sale_type, invoice.total, invoice.paid_amount, invoice.remaining_amount,
      invoice.branch_id, branch.name as branch_name,
      (select count(*)::integer from public.sales_invoice_items i where i.invoice_id = invoice.id and i.vehicle_id is not null) as vehicle_count,
      (select coalesce(sum(i.line_total),0) from public.sales_invoice_items i where i.invoice_id = invoice.id and i.product_id is not null) as product_revenue
    from public.sales_invoices as invoice
    join public.branches as branch on branch.id = invoice.branch_id
    where public.is_branch_member(invoice.branch_id)
      and (p_branch_id is null or invoice.branch_id = p_branch_id)
      and (p_from is null or invoice.invoice_date >= p_from)
      and (p_to is null or invoice.invoice_date <= p_to)
      and (status_filter = 'all' or invoice.status = status_filter)
  ) as report_row;

  return coalesce(result, jsonb_build_object(
    'summary', jsonb_build_object(
      'invoice_count',0,'approved_count',0,'draft_count',0,'cancelled_count',0,
      'total_amount',0,'paid_amount',0,'remaining_amount',0,
      'cash_count',0,'installment_count',0,'vehicle_count',0,'product_revenue',0
    ),
    'by_branch', '[]'::jsonb,
    'invoices', '[]'::jsonb
  ));
end;
$$;

revoke all on function public.get_sales_report(date, date, uuid, text) from public, anon;
grant execute on function public.get_sales_report(date, date, uuid, text) to authenticated, service_role;
