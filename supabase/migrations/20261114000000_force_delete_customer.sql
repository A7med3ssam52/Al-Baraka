-- Force delete (purge) — customers and installments.
--
-- 1. Customers can now be force-deleted by the OWNER role only
--    (new permission `customers.force_delete`, seeded to `owner` only).
--    A force delete wipes EVERY record owned by the customer:
--    contracts, schedules, installments, payments, collections phases,
--    sales invoices + items, sales returns + items, customer ledger
--    (customer_transactions), balance transactions, documents (+files and
--    access logs — DB rows only; Cloudinary assets are NOT touched),
--    notes, contacts, guarantor links, orphan guarantors that belonged only
--    to this customer, public portal access logs, and the customer row
--    itself (bypassing block_customer_delete via a session flag).
--    Journal entries sourced by the deleted records are removed as well.
--    DELIBERATELY kept: audit_logs, notifications, cash_transactions,
--    treasury/bank/counter balances are NOT re-balanced (raw purge).
--
-- 2. delete_installments is now truly forceful: any installment (pending,
--    overdue, partial, paid, waived) may be bulk-deleted — no reason is
--    required. Contract/invoice totals are reduced by the deleted sum and
--    the remaining unpaid installments are redistributed and renumbered.

-- ---------------------------------------------------------------------------
-- 1. Owner-only permission for force delete.
-- ---------------------------------------------------------------------------

insert into public.permissions (code, module, action, name_ar, name_en, is_active)
values ('customers.force_delete', 'customers', 'force_delete', 'حذف قسري للعميل', 'Force delete customer', true)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles as r
cross join public.permissions as p
where r.code = 'owner'
  and p.code = 'customers.force_delete'
  and not exists (
    select 1
    from public.role_permissions as rp
    where rp.role_id = r.id and rp.permission_id = p.id
  );

-- ---------------------------------------------------------------------------
-- 2. block_customer_delete must not fire inside the force-delete RPC.
-- ---------------------------------------------------------------------------

create or replace function public.block_customer_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The dedicated force_delete_customer RPC sets this flag for its own transaction.
  if coalesce(current_setting('app.force_delete_customer', true), '') = 'on' then
    return null;
  end if;

  raise exception 'customer_delete_forbidden' using errcode = '42501';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. delete_installments — forceful variant, no restriction on paid rows.
--    Replaces the previous (unpaid-only + reason) version.
-- ---------------------------------------------------------------------------

drop function if exists public.delete_installments(uuid[], text);

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
  v_contract_ids uuid[];
  v_contract_id uuid;
  v_contract public.contracts;
  v_schedule_id uuid;
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

  perform 1 from public.installments where id = any(v_ids) for update;
  select count(*) into v_count from public.installments where id = any(v_ids);

  if v_count <> array_length(v_ids, 1) then
    raise exception 'installment_missing' using errcode = 'P0001';
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

  -- The contract must not be cancelled and the schedule must be active.
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

    if exists (
      select 1
      from public.installments i
      join public.installment_schedules s on s.id = i.schedule_id
      where i.id = any(v_ids) and s.contract_id = v_contract_id
        and s.id <> v_schedule_id
    ) then
      raise exception 'contract_locked' using errcode = '42501';
    end if;

    select coalesce(sum(amount), 0), count(*)
    into v_deleted_sum, v_deleted_count
    from public.installments
    where schedule_id = v_schedule_id and id = any(v_ids);

    -- Deleting every installment of the active schedule is not allowed —
    -- use إلغاء العقد instead (it handles vehicle/invoice/ledger reversal).
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

    -- Remove journal entries sourced by the deleted installments, then the rows.
    delete from public.journal_entries
    where source_type = 'installment' and source_id = any(v_ids);

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

revoke all on function public.delete_installments(uuid[]) from public, anon;
grant execute on function public.delete_installments(uuid[]) to authenticated, service_role;

comment on function public.delete_installments(uuid[]) is
  'Force-deletes installments (any status, no reason required) and rebalances '
  'the contract/invoice totals and the remaining unpaid installment amounts.';

-- ---------------------------------------------------------------------------
-- 4. force_delete_customer — owner only, purges every trace of the customer.
-- ---------------------------------------------------------------------------

create or replace function public.force_delete_customer(
  p_customer_id uuid,
  p_confirm_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer public.customers;
  v_contract_ids uuid[] := '{}';
  v_schedule_ids uuid[] := '{}';
  v_installment_ids uuid[] := '{}';
  v_invoice_ids uuid[] := '{}';
  v_return_ids uuid[] := '{}';
  v_payment_ids uuid[] := '{}';
  v_document_ids uuid[] := '{}';
  v_guarantor_ids uuid[] := '{}';
  v_counts jsonb := '{}'::jsonb;
begin
  if not public.has_permission('customers.force_delete') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_customer from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'customer_missing' using errcode = 'P0001';
  end if;
  if not public.is_branch_member(v_customer.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Typed confirmation: the caller must type the exact customer code.
  if p_confirm_code is null or btrim(p_confirm_code) <> v_customer.code then
    raise exception 'confirmation_mismatch' using errcode = '22023';
  end if;

  select coalesce(array_agg(id), '{}') into v_contract_ids
  from public.contracts where customer_id = p_customer_id;

  select coalesce(array_agg(s.id), '{}') into v_schedule_ids
  from public.installment_schedules s
  where s.contract_id = any(v_contract_ids);

  select coalesce(array_agg(i.id), '{}') into v_installment_ids
  from public.installments i
  where i.schedule_id = any(v_schedule_ids);

  select coalesce(array_agg(inv.id), '{}') into v_invoice_ids
  from public.sales_invoices inv
  where inv.customer_id = p_customer_id
     or inv.id = any(select sale_invoice_id from public.contracts where id = any(v_contract_ids));

  select coalesce(array_agg(r.id), '{}') into v_return_ids
  from public.sales_returns r
  where r.customer_id = p_customer_id
     or r.sales_invoice_id = any(v_invoice_ids);

  select coalesce(array_agg(pay.id), '{}') into v_payment_ids
  from public.payments pay
  where pay.customer_id = p_customer_id
     or pay.contract_id = any(v_contract_ids)
     or pay.sale_invoice_id = any(v_invoice_ids);

  select coalesce(array_agg(d.id), '{}') into v_document_ids
  from public.documents d
  where d.customer_id = p_customer_id;

  select coalesce(array_agg(distinct cg.guarantor_id), '{}') into v_guarantor_ids
  from public.customer_guarantors cg
  where cg.customer_id = p_customer_id;

  -- Journal entries sourced by the records being purged (lines cascade).
  delete from public.journal_entries
  where (source_type in ('installment', 'contract', 'sales_invoice')
         and source_id in (select unnest(v_installment_ids) union
                          select unnest(v_contract_ids) union
                          select unnest(v_invoice_ids)))
     or (source_type = 'balance_top_up' and source_id = any(v_payment_ids));

  -- Purchase order: children before parents to respect FK RESTRICT/NO ACTION.
  delete from public.payments where id = any(v_payment_ids);
  v_counts := v_counts || jsonb_build_object('payments', coalesce(array_length(v_payment_ids, 1), 0));

  delete from public.sales_return_items where return_id = any(v_return_ids);
  delete from public.sales_returns where id = any(v_return_ids);
  v_counts := v_counts || jsonb_build_object('sales_returns', coalesce(array_length(v_return_ids, 1), 0));

  delete from public.installments where id = any(v_installment_ids);
  delete from public.installment_schedules where id = any(v_schedule_ids);
  v_counts := v_counts || jsonb_build_object('installments', coalesce(array_length(v_installment_ids, 1), 0));

  -- collections_phases was never applied on this database; delete it only if present.
  if to_regclass('public.collections_phases') is not null then
    execute 'delete from public.collections_phases where contract_id = any($1)' using v_contract_ids;
  end if;

  delete from public.customer_transactions where customer_id = p_customer_id;
  delete from public.customer_balance_transactions where customer_id = p_customer_id;

  delete from public.contract_guarantors where contract_id = any(v_contract_ids);
  delete from public.contracts where id = any(v_contract_ids);
  v_counts := v_counts || jsonb_build_object('contracts', coalesce(array_length(v_contract_ids, 1), 0));

  delete from public.sales_invoice_items where invoice_id = any(v_invoice_ids);
  delete from public.sales_invoices where id = any(v_invoice_ids);
  v_counts := v_counts || jsonb_build_object('sales_invoices', coalesce(array_length(v_invoice_ids, 1), 0));

  -- Documents: DB rows only. Files stay on Cloudinary (orphaned).
  delete from public.documents where id = any(v_document_ids);
  v_counts := v_counts || jsonb_build_object('documents', coalesce(array_length(v_document_ids, 1), 0));

  delete from public.customer_notes where customer_id = p_customer_id;
  delete from public.customer_contacts where customer_id = p_customer_id;
  delete from public.customer_guarantors where customer_id = p_customer_id;

  -- Orphan guarantors that were linked ONLY to this customer.
  delete from public.guarantors g
  where g.id = any(v_guarantor_ids)
    and not exists (select 1 from public.customer_guarantors cg where cg.guarantor_id = g.id)
    and not exists (select 1 from public.contract_guarantors ct where ct.guarantor_id = g.id);

  -- Portal access logs for this customer are purged as requested.
  delete from public.public_portal_access_logs where customer_id = p_customer_id;

  -- Allow the customer row itself to be deleted from this transaction only.
  perform set_config('app.force_delete_customer', 'on', true);
  delete from public.customers where id = p_customer_id;

  return v_counts || jsonb_build_object(
    'customer_id', p_customer_id,
    'customer_code', v_customer.code,
    'customer_name', v_customer.full_name
  );
end;
$$;

revoke all on function public.force_delete_customer(uuid, text) from public, anon;
grant execute on function public.force_delete_customer(uuid, text) to authenticated, service_role;

comment on function public.force_delete_customer(uuid, text) is
  'Owner-only force delete: purges the customer and every dependent record '
  '(contracts, schedules, installments, payments, invoices, returns, ledger, '
  'balance transactions, documents rows, portal logs). Not reversible.';
