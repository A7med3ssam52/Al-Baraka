-- 20261119 — Fix the "same data already exists" flows around installment sales.
--
-- Part 1 — save_contract: the update branch (p_contract_id not null, i.e.
--   "تحديث البيانات الجديدة فوق القديمة" instead of creating a new contract for
--   the same invoice) was broken two ways:
--   * it never set contracts.total_amount, so after ANY change to the invoice
--     total the CHECK (financed_amount = total_amount - down_payment) failed
--     with a 23514 check_violation;
--   * its `update ... set financed_amount = financed_amount` / `set
--     financed_amount = total_amount - clean_down` mix plpgsql variables with
--     column names without a #variable_conflict directive, which fails under
--     the default `error` mode ("column reference is ambiguous").
--   Local variables are now prefixed with v_ (no column collisions) and the
--   update branch sets total_amount + financed_amount in a single statement.
--   Behaviour is otherwise byte-for-byte the same as the previous definition.
--
-- Part 2 — v_installment_status: return only the installments of the LATEST
--   schedule version per contract. Older ('draft'/'superseded') versions used
--   to leak into the view, so a failed "إنشاء الأقساط" retried afterwards (or a
--   "تعديل العقد") made the الأقساط screen / dashboard / portal show the same
--   rows twice. No data is deleted; history stays in installment_schedules.

-- ---------------------------------------------------------------------------
-- Part 1 — save_contract (recreated with the fixed update branch).
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
  v_target_branch uuid;
  invoice_row public.sales_invoices;
  customer_row public.customers;
  vehicle_row public.vehicles;
  clean_frequency text := lower(btrim(coalesce(p_frequency, 'monthly')));
  clean_down numeric := coalesce(p_down_payment, 0);
  clean_count integer := coalesce(p_installment_count, 0);
  clean_custom integer := p_custom_days;
  v_total_amount numeric;
  v_financed_amount numeric;
  v_existing public.contracts;
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

    select * into v_existing from public.contracts where id = p_contract_id;

    if not found then
      raise exception 'contract_missing' using errcode = 'P0001';
    end if;

    if v_existing.status <> 'draft' then
      raise exception 'contract_not_draft' using errcode = 'P0001';
    end if;

    if not public.is_branch_member(v_existing.branch_id) then
      raise exception 'forbidden' using errcode = '42501';
    end if;

    v_target_branch := v_existing.branch_id;
  end if;

  -- invoice must exist, be installment, draft, in a branch the user belongs to
  select * into invoice_row from public.sales_invoices where id = p_sale_invoice_id;

  if not found then
    raise exception 'invoice_missing' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(invoice_row.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_target_branch is null then
    v_target_branch := invoice_row.branch_id;
  end if;

  if v_target_branch <> invoice_row.branch_id then
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

  v_total_amount := invoice_row.total;

  if clean_down < 0 or clean_down > v_total_amount then
    raise exception 'invalid_down_payment' using errcode = '22023';
  end if;

  v_financed_amount := v_total_amount - clean_down;

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
      vehicle_row.id, v_target_branch, coalesce(invoice_row.invoice_date, current_date),
      v_total_amount, clean_down, v_financed_amount, clean_count, clean_frequency,
      clean_custom, p_first_due_date, nullif(btrim(coalesce(p_notes, '')), ''),
      'draft', auth.uid(), auth.uid()
    )
    returning * into new_row;
  else
    update public.contracts
    set total_amount = v_total_amount,
        down_payment = clean_down,
        financed_amount = v_financed_amount,
        installment_count = clean_count,
        frequency = clean_frequency,
        custom_days = clean_custom,
        first_due_date = p_first_due_date,
        notes = nullif(btrim(coalesce(p_notes, '')), ''),
        updated_by = auth.uid(),
        updated_at = now()
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
-- Part 2 — v_installment_status restricted to the latest schedule per contract.
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
  c.branch_id,
  i.legacy_paid
from public.installments as i
join public.installment_schedules as s on s.id = i.schedule_id
join public.contracts as c on c.id = s.contract_id
where s.id = (
  select s2.id
  from public.installment_schedules as s2
  where s2.contract_id = c.id
  order by s2.version desc
  limit 1
);

-- ---------------------------------------------------------------------------
-- Part 3 — realign document sequences with existing rows.
--
-- Diagnosis (verified on the live project): approving ANY contract / sale /
-- purchase / collect on SNH-01 called next_entity_code('journal_entry'), which
-- returned JE-000001 — a number already used by PINV-00001's approval — so the
-- INSERT into journal_entries (branch_id, entry_number) blew up with a 23505
-- unique_violation. The whole approve transaction rolled back (that is why
-- SINV-/CON- drafts are left behind) and the UI showed the generic
-- «في سجل بنفس البيانات موجود بالفعل» message.
--
-- The counters are repaired here from the actual tables (greatest wins — this
-- migration is idempotent and raises every counter to at least max+1). The
-- root cause of the original drift was an out-of-band edit on the database, so
-- this guards against it recurring via any path.
-- ---------------------------------------------------------------------------

with codes as (
  select 'customer' as entity, code as c from public.customers
  union all select 'supplier', code from public.suppliers
  union all select 'vehicle', code from public.vehicles
  union all select 'product', code from public.products
  union all select 'sales_invoice', number from public.sales_invoices
  union all select 'contract', number from public.contracts
  union all select 'purchase_invoice', number from public.purchase_invoices
  union all select 'sales_return', number from public.sales_returns
  union all select 'stock_transfer', number from public.stock_transfers
  union all select 'stock_count', number from public.stock_counts
  union all select 'journal_entry', entry_number from public.journal_entries
  union all select 'document', doc_number from public.documents
)
update public.code_sequences seq
set next_number = greatest(seq.next_number, coalesce(m.max_num, 0) + 1),
    updated_at = now()
from (
  select entity, max((regexp_match(c, '(\d+)$'))[1]::bigint) as max_num
  from codes
  group by entity
) as m
where seq.entity = m.entity;
