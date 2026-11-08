-- M7: Full CRUD — safe edit / cancel / hard-delete for every entity.
--
-- Rule: hard delete only when the record has no financial history.
-- Otherwise callers get a friendly code ('has_history') and must use
-- archive / cancel / waive / reschedule instead.
-- All writes go through security-definer RPCs; direct table writes stay closed.

-- ---------------------------------------------------------------------------
-- 1. Expenses (edit + delete/cancel).
-- ---------------------------------------------------------------------------

create or replace function public.update_expense(
  p_expense_id uuid,
  p_title text,
  p_category text default null,
  p_amount numeric default null,
  p_expense_date date default null,
  p_cashbox_id uuid default null,
  p_notes text default null
)
returns public.expenses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur public.expenses;
begin
  if not public.has_permission('expenses.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into cur from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'expense_missing' using errcode = 'P0001'; end if;
  if not public.is_branch_member(cur.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if cur.status = 'cancelled' then
    raise exception 'expense_archived' using errcode = '42501';
  end if;
  if p_title is null or char_length(btrim(p_title)) < 2 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  if p_amount is not null and (p_amount <= 0 or not (p_amount > 0)) then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  update public.expenses
  set title = btrim(p_title),
      category = coalesce(nullif(btrim(coalesce(p_category, '')), ''), category),
      amount = coalesce(p_amount, amount),
      expense_date = coalesce(p_expense_date, expense_date),
      cashbox_id = p_cashbox_id,
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_expense_id
  returning * into cur;

  return cur;
end;
$$;

create or replace function public.delete_expense(
  p_expense_id uuid
)
returns public.expenses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur public.expenses;
begin
  if not public.has_permission('expenses.cancel') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into cur from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'expense_missing' using errcode = 'P0001'; end if;
  if not public.is_branch_member(cur.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- draft: hard delete. approved: soft-cancel so the audit trail survives.
  if cur.status = 'draft' then
    delete from public.expenses where id = p_expense_id;
    return cur;
  end if;

  if cur.status = 'cancelled' then
    raise exception 'expense_archived' using errcode = '42501';
  end if;

  update public.expenses
  set status = 'cancelled', updated_at = now(), updated_by = auth.uid()
  where id = p_expense_id
  returning * into cur;

  return cur;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Documents (update + delete file).
-- ---------------------------------------------------------------------------

create or replace function public.update_document(
  p_document_id uuid,
  p_title text,
  p_doc_type text default null,
  p_notes text default null
)
returns public.documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur public.documents;
  clean_type text := lower(btrim(coalesce(p_doc_type, 'other')));
begin
  if not public.has_permission('documents.upload') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into cur from public.documents where id = p_document_id for update;
  if not found then raise exception 'document_missing' using errcode = 'P0001'; end if;
  if not public.is_branch_member(cur.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_title is null or char_length(btrim(p_title)) < 2 or char_length(btrim(p_title)) > 150 then
    raise exception 'invalid_document_title' using errcode = '22023';
  end if;
  if clean_type not in ('id_card', 'commercial_registry', 'other') then
    raise exception 'invalid_document_type' using errcode = '22023';
  end if;

  update public.documents
  set title = btrim(p_title), doc_type = clean_type,
      notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_document_id
  returning * into cur;

  return cur;
end;
$$;

create or replace function public.delete_document_file(
  p_file_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('documents.delete') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.document_files f
    join public.documents d on d.id = f.document_id
    where f.id = p_file_id and public.is_branch_member(d.branch_id)
  ) then
    raise exception 'document_file_missing' using errcode = 'P0001';
  end if;

  delete from public.document_files where id = p_file_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Customer contacts / guarantors / notes (update + delete).
-- ---------------------------------------------------------------------------

create or replace function public.update_customer_contact(
  p_contact_id uuid,
  p_label text,
  p_mobile text,
  p_note text default null
)
returns public.customer_contacts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur public.customer_contacts;
begin
  if not public.has_permission('customers.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into cur from public.customer_contacts where id = p_contact_id for update;
  if not found then raise exception 'contact_missing' using errcode = 'P0001'; end if;

  if not exists (
    select 1 from public.customers c where c.id = cur.customer_id and public.is_branch_member(c.branch_id)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_label is null or char_length(btrim(p_label)) < 1 or char_length(btrim(p_label)) > 50 then
    raise exception 'invalid_contact_label' using errcode = '22023';
  end if;

  update public.customer_contacts
  set label = btrim(p_label),
      mobile = public.normalize_egypt_mobile(p_mobile),
      note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_contact_id
  returning * into cur;

  return cur;
end;
$$;

create or replace function public.update_guarantor(
  p_guarantor_id uuid,
  p_full_name text,
  p_national_id text,
  p_mobile text,
  p_job text default null,
  p_address text default null
)
returns public.guarantors
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur public.guarantors;
  nid text := regexp_replace(btrim(coalesce(p_national_id, '')), '\D', '', 'g');
begin
  if not public.has_permission('customers.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into cur from public.guarantors where id = p_guarantor_id for update;
  if not found then raise exception 'guarantor_missing' using errcode = 'P0001'; end if;
  if not public.is_branch_member(cur.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_full_name is null or char_length(btrim(p_full_name)) < 3 then
    raise exception 'invalid_guarantor_name' using errcode = '22023';
  end if;
  if not public.validate_national_id(nid) then
    raise exception 'invalid_national_id' using errcode = '22023';
  end if;
  if exists (select 1 from public.guarantors where national_id = nid and id <> p_guarantor_id) then
    raise exception 'duplicate_national_id' using errcode = '23505';
  end if;

  update public.guarantors
  set full_name = btrim(p_full_name),
      national_id = nid,
      mobile = public.normalize_egypt_mobile(p_mobile),
      job = nullif(btrim(coalesce(p_job, '')), ''),
      address = nullif(btrim(coalesce(p_address, '')), ''),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_guarantor_id
  returning * into cur;

  return cur;
end;
$$;

create or replace function public.delete_guarantor(
  p_guarantor_id uuid,
  p_customer_id uuid default null
)
returns public.guarantors
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur public.guarantors;
begin
  if not public.has_permission('customers.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into cur from public.guarantors where id = p_guarantor_id for update;
  if not found then raise exception 'guarantor_missing' using errcode = 'P0001'; end if;
  if not public.is_branch_member(cur.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Linked to an active contract: deactivate + unlink from the customer,
  -- never hard-delete while history points at the person.
  if exists (
    select 1 from public.contract_guarantors cg
    join public.contracts c on c.id = cg.contract_id
    where cg.guarantor_id = p_guarantor_id and c.status = 'active'
  ) then
    update public.guarantors set is_active = false, updated_at = now(), updated_by = auth.uid()
    where id = p_guarantor_id returning * into cur;
    if p_customer_id is not null then
      delete from public.customer_guarantors where guarantor_id = p_guarantor_id and customer_id = p_customer_id;
    end if;
    return cur;
  end if;

  if p_customer_id is not null then
    delete from public.customer_guarantors where guarantor_id = p_guarantor_id and customer_id = p_customer_id;
  end if;
  delete from public.contract_guarantors where guarantor_id = p_guarantor_id;
  delete from public.guarantors where id = p_guarantor_id;
  return cur;
end;
$$;

create or replace function public.update_customer_note(
  p_note_id uuid,
  p_note text,
  p_note_type text default 'note',
  p_next_followup_at timestamptz default null
)
returns table (
  id uuid, customer_id uuid, note text, note_type text,
  next_followup_at timestamptz, created_at timestamptz, created_by uuid, created_by_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('customers.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_note is null or char_length(btrim(p_note)) < 1 or char_length(btrim(p_note)) > 2000 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;
  if lower(btrim(coalesce(p_note_type, ''))) not in ('note', 'call', 'visit', 'promise') then
    raise exception 'invalid_note_type' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.customer_notes n
    join public.customers c on c.id = n.customer_id
    where n.id = p_note_id and public.is_branch_member(c.branch_id)
  ) then
    raise exception 'note_missing' using errcode = 'P0001';
  end if;

  return query
  with updated as (
    update public.customer_notes
    set note = btrim(p_note), note_type = lower(btrim(p_note_type)),
        next_followup_at = p_next_followup_at
    where id = p_note_id
    returning id, customer_id, note, note_type, next_followup_at, created_at, created_by
  )
  select u.id, u.customer_id, u.note, u.note_type, u.next_followup_at, u.created_at, u.created_by,
         coalesce(p.full_name, 'مستخدم محذوف')
  from updated u left join public.profiles p on p.id = u.created_by;
end;
$$;

create or replace function public.delete_customer_note(
  p_note_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('customers.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.customer_notes n
    join public.customers c on c.id = n.customer_id
    where n.id = p_note_id and public.is_branch_member(c.branch_id)
  ) then
    raise exception 'note_missing' using errcode = 'P0001';
  end if;

  delete from public.customer_notes where id = p_note_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Hard delete (only when there is no history; otherwise has_history).
-- ---------------------------------------------------------------------------

create or replace function public.delete_customer(
  p_customer_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('customers.archive') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'customer_missing' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.customers c where c.id = p_customer_id and public.is_branch_member(c.branch_id)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (select 1 from public.contracts where customer_id = p_customer_id)
     or exists (select 1 from public.sales_invoices where customer_id = p_customer_id)
     or exists (select 1 from public.payments where customer_id = p_customer_id)
     or exists (select 1 from public.customer_transactions where customer_id = p_customer_id)
     or exists (select 1 from public.documents where customer_id = p_customer_id) then
    raise exception 'has_history' using errcode = '23000';
  end if;

  delete from public.customer_contacts where customer_id = p_customer_id;
  delete from public.customer_notes where customer_id = p_customer_id;
  delete from public.customer_guarantors where customer_id = p_customer_id;
  delete from public.customers where id = p_customer_id;
end;
$$;

create or replace function public.delete_supplier(
  p_supplier_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('suppliers.archive') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.suppliers where id = p_supplier_id) then
    raise exception 'supplier_missing' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.purchase_invoices where supplier_id = p_supplier_id)
     or exists (select 1 from public.supplier_transactions where supplier_id = p_supplier_id)
     or exists (select 1 from public.documents where supplier_id = p_supplier_id) then
    raise exception 'has_history' using errcode = '23000';
  end if;

  delete from public.suppliers where id = p_supplier_id;
end;
$$;

create or replace function public.delete_vehicle(
  p_vehicle_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('vehicles.archive') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.vehicles where id = p_vehicle_id) then
    raise exception 'vehicle_missing' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.sales_invoice_items where vehicle_id = p_vehicle_id)
     or exists (select 1 from public.purchase_invoice_items where vehicle_id = p_vehicle_id)
     or exists (select 1 from public.contracts where vehicle_id = p_vehicle_id)
     or exists (select 1 from public.stock_movements where vehicle_id = p_vehicle_id) then
    raise exception 'has_history' using errcode = '23000';
  end if;

  delete from public.vehicles where id = p_vehicle_id;
end;
$$;

create or replace function public.delete_product(
  p_product_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('products.archive') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'product_missing' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.sales_invoice_items where product_id = p_product_id)
     or exists (select 1 from public.purchase_invoice_items where product_id = p_product_id)
     or exists (select 1 from public.stock_movements where product_id = p_product_id) then
    raise exception 'has_history' using errcode = '23000';
  end if;

  delete from public.products where id = p_product_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Installments & contracts (edit before any collection; cancel active).
-- ---------------------------------------------------------------------------

create or replace function public.update_installment(
  p_installment_id uuid,
  p_amount numeric default null,
  p_due_date date default null,
  p_reason text default null
)
returns public.installments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur public.installments;
begin
  if not public.has_permission('installments.reschedule') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into cur from public.installments where id = p_installment_id for update;
  if not found then raise exception 'installment_missing' using errcode = 'P0001'; end if;

  if not exists (
    select 1
    from public.installment_schedules s
    join public.contracts c on c.id = s.contract_id
    where s.id = cur.schedule_id and public.is_branch_member(c.branch_id)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if cur.paid_amount > 0 or cur.status in ('paid', 'partial', 'waived') then
    raise exception 'installment_locked' using errcode = '42501';
  end if;
  if p_amount is not null and p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  update public.installments
  set amount = coalesce(p_amount, amount),
      due_date = coalesce(p_due_date, due_date)
  where id = p_installment_id
  returning * into cur;

  return cur;
end;
$$;

-- Edit an active (or draft) contract's terms + selling total, then rebuild the
-- schedule. Allowed only while nothing has been collected yet.
create or replace function public.update_contract_terms(
  p_contract_id uuid,
  p_total_amount numeric default null,
  p_installment_count integer default null,
  p_frequency text default null,
  p_custom_days integer default null,
  p_first_due_date date default null,
  p_notes text default null
)
returns public.contracts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur public.contracts;
  inv public.sales_invoices;
  paid_now numeric := 0;
  clean_freq text;
  new_total numeric;
  new_financed numeric;
  diff numeric;
  target_item record;
begin
  if not public.has_permission('contracts.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into cur from public.contracts where id = p_contract_id for update;
  if not found then raise exception 'contract_missing' using errcode = 'P0001'; end if;
  if not public.is_branch_member(cur.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if cur.status not in ('draft', 'active') then
    raise exception 'contract_locked' using errcode = '42501';
  end if;

  select coalesce(sum(paid_amount), 0) into paid_now
  from public.installments i
  join public.installment_schedules s on s.id = i.schedule_id
  where s.contract_id = p_contract_id;

  if paid_now > 0 or exists (
    select 1 from public.payments where contract_id = p_contract_id and payment_type = 'installment'
  ) then
    raise exception 'contract_has_payments' using errcode = '42501';
  end if;

  select * into inv from public.sales_invoices where id = cur.sale_invoice_id for update;
  if not found then raise exception 'invoice_missing' using errcode = 'P0001'; end if;

  clean_freq := lower(btrim(coalesce(p_frequency, cur.frequency)));
  if clean_freq not in ('weekly', 'biweekly', 'monthly', 'custom') then
    raise exception 'invalid_frequency' using errcode = '22023';
  end if;
  if clean_freq = 'custom' and coalesce(p_custom_days, cur.custom_days, 0) <= 0 then
    raise exception 'invalid_custom_days' using errcode = '22023';
  end if;
  if coalesce(p_installment_count, cur.installment_count) < 1 then
    raise exception 'invalid_installment_count' using errcode = '22023';
  end if;

  new_total := coalesce(p_total_amount, cur.total_amount);
  if new_total < cur.down_payment then
    raise exception 'invalid_down_payment' using errcode = '22023';
  end if;
  new_financed := new_total - cur.down_payment;

  if new_total <> cur.total_amount then
    diff := new_total - cur.total_amount;
    -- Put the whole price difference on the largest line.
    select * into target_item from public.sales_invoice_items
    where invoice_id = inv.id order by line_total desc limit 1;
    if not found then raise exception 'invoice_missing' using errcode = 'P0001'; end if;
    if target_item.line_total + diff < 0 then
      raise exception 'invalid_down_payment' using errcode = '22023';
    end if;
    update public.sales_invoice_items
    set unit_price = unit_price + (diff / nullif(quantity, 0)),
        line_total = line_total + diff
    where id = target_item.id;

    update public.sales_invoices
    set subtotal = subtotal + diff, total = new_total,
        remaining_amount = new_total - paid_amount,
        updated_at = now(), updated_by = auth.uid()
    where id = inv.id;
  end if;

  update public.contracts
  set total_amount = new_total,
      financed_amount = new_financed,
      installment_count = coalesce(p_installment_count, installment_count),
      frequency = clean_freq,
      custom_days = case when clean_freq = 'custom' then coalesce(p_custom_days, custom_days) else null end,
      first_due_date = coalesce(p_first_due_date, first_due_date),
      notes = nullif(btrim(coalesce(p_notes, notes, '')), ''),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_contract_id
  returning * into cur;

  -- Rebuild the schedule from the new terms.
  perform public.generate_installment_schedule(p_contract_id, false);

  return cur;
end;
$$;

-- Cancel a draft OR an active contract that has no collections. Reverses the
-- approval effects (vehicle, ledger, down payment, invoice).
create or replace function public.cancel_active_contract(
  p_contract_id uuid,
  p_reason text default null
)
returns public.contracts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur public.contracts;
  inv public.sales_invoices;
  paid_now numeric := 0;
  pay record;
  item record;
begin
  if not public.has_permission('contracts.cancel') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into cur from public.contracts where id = p_contract_id for update;
  if not found then raise exception 'contract_missing' using errcode = 'P0001'; end if;
  if not public.is_branch_member(cur.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if cur.status = 'cancelled' then
    raise exception 'contract_locked' using errcode = '42501';
  end if;

  select coalesce(sum(paid_amount), 0) into paid_now
  from public.installments i
  join public.installment_schedules s on s.id = i.schedule_id
  where s.contract_id = p_contract_id;

  if paid_now > 0 or exists (
    select 1 from public.payments where contract_id = p_contract_id and payment_type = 'installment'
  ) then
    raise exception 'contract_has_payments' using errcode = '42501';
  end if;

  select * into inv from public.sales_invoices where id = cur.sale_invoice_id for update;

  if cur.status = 'active' then
    -- Return vehicles to available.
    for item in select * from public.sales_invoice_items where invoice_id = cur.sale_invoice_id loop
      if item.vehicle_id is not null then
        -- Only return vehicles still marked sold by this sale.
        update public.vehicles
        set status = 'available', updated_at = now(), updated_by = auth.uid()
        where id = item.vehicle_id and status = 'sold';
        -- Reverse the sale stock movement with a +1 movement.
        perform public.record_stock_movement(
          'return_in', 1, null, item.vehicle_id,
          item.unit_price, cur.branch_id,
          'sales_invoice', cur.sale_invoice_id, 'إلغاء عقد ' || cur.number
        );
      elsif item.product_id is not null then
        perform public.record_stock_movement(
          'return_in', item.quantity, item.product_id, null,
          item.unit_price, cur.branch_id,
          'sales_invoice', cur.sale_invoice_id, 'إلغاء عقد ' || cur.number
        );
      end if;
    end loop;

    -- Reverse customer ledger.
    delete from public.customer_transactions
    where reference_type = 'contract' and reference_id = p_contract_id;

    -- Refund down payment(s).
    for pay in select * from public.payments where contract_id = p_contract_id loop
      if pay.cashbox_id is not null then
        update public.cashboxes
        set current_balance = greatest(current_balance - pay.amount, 0),
            updated_at = now(), updated_by = auth.uid()
        where id = pay.cashbox_id;
      end if;
    end loop;
    delete from public.payments where contract_id = p_contract_id;

    update public.installment_schedules
    set status = 'superseded'
    where contract_id = p_contract_id and status = 'active';

    if inv.id is not null then
      update public.sales_invoices
      set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
          updated_at = now(), updated_by = auth.uid()
      where id = inv.id;
    end if;
  end if;

  update public.contracts
  set status = 'cancelled',
      notes = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), notes),
      cancelled_at = now(), cancelled_by = auth.uid(),
      updated_at = now(), updated_by = auth.uid()
  where id = p_contract_id
  returning * into cur;

  return cur;
end;
$$;

-- Cancel an approved purchase invoice (full reversal), or a draft (simple).
create or replace function public.cancel_approved_purchase_invoice(
  p_invoice_id uuid,
  p_reason text default null
)
returns public.purchase_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur public.purchase_invoices;
  item record;
begin
  if not public.has_permission('purchases.cancel') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into cur from public.purchase_invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice_missing' using errcode = 'P0001'; end if;
  if not public.is_branch_member(cur.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if cur.status = 'cancelled' then
    raise exception 'invoice_locked' using errcode = '42501';
  end if;

  if cur.status = 'draft' then
    update public.purchase_invoices
    set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
        notes = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), notes),
        updated_at = now(), updated_by = auth.uid()
    where id = p_invoice_id returning * into cur;
    return cur;
  end if;

  -- Approved: reverse stock, ledger and payment. Journals stay as history.
  for item in select * from public.purchase_invoice_items where invoice_id = p_invoice_id loop
    if item.product_id is not null then
      perform public.record_stock_movement(
        'return_out', -item.quantity, item.product_id, null,
        item.landed_unit_cost, cur.branch_id,
        'purchase_invoice', cur.id, 'إلغاء مشتريات ' || cur.number
      );
    end if;
  end loop;

  insert into public.supplier_transactions (
    supplier_id, branch_id, transaction_type, transaction_date, amount,
    reference_type, reference_id, notes, created_by
  )
  values (
    cur.supplier_id, cur.branch_id, 'reversal', cur.invoice_date, -cur.total,
    'purchase_invoice', cur.id, 'إلغاء ' || cur.number || ' — ' || coalesce(nullif(btrim(coalesce(p_reason, '')), ''), ''), auth.uid()
  );

  if coalesce(cur.paid_amount, 0) > 0 then
    if cur.cashbox_id is not null then
      update public.cashboxes
      set current_balance = current_balance + cur.paid_amount, updated_at = now(), updated_by = auth.uid()
      where id = cur.cashbox_id;
    elsif cur.bank_account_id is not null then
      update public.bank_accounts
      set current_balance = current_balance + cur.paid_amount, updated_at = now(), updated_by = auth.uid()
      where id = cur.bank_account_id;
    end if;
  end if;

  update public.purchase_invoices
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
      notes = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), notes),
      remaining_amount = 0, updated_at = now(), updated_by = auth.uid()
  where id = p_invoice_id returning * into cur;

  return cur;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants + audit.
-- ---------------------------------------------------------------------------

revoke all on function public.update_expense(uuid, text, text, numeric, date, uuid, text) from public, anon;
grant execute on function public.update_expense(uuid, text, text, numeric, date, uuid, text) to authenticated, service_role;
revoke all on function public.delete_expense(uuid) from public, anon;
grant execute on function public.delete_expense(uuid) to authenticated, service_role;
revoke all on function public.update_document(uuid, text, text, text) from public, anon;
grant execute on function public.update_document(uuid, text, text, text) to authenticated, service_role;
revoke all on function public.delete_document_file(uuid) from public, anon;
grant execute on function public.delete_document_file(uuid) to authenticated, service_role;
revoke all on function public.update_customer_contact(uuid, text, text, text) from public, anon;
grant execute on function public.update_customer_contact(uuid, text, text, text) to authenticated, service_role;
revoke all on function public.update_guarantor(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.update_guarantor(uuid, text, text, text, text, text) to authenticated, service_role;
revoke all on function public.delete_guarantor(uuid, uuid) from public, anon;
grant execute on function public.delete_guarantor(uuid, uuid) to authenticated, service_role;
revoke all on function public.update_customer_note(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.update_customer_note(uuid, text, text, timestamptz) to authenticated, service_role;
revoke all on function public.delete_customer_note(uuid) from public, anon;
grant execute on function public.delete_customer_note(uuid) to authenticated, service_role;
revoke all on function public.delete_customer(uuid) from public, anon;
grant execute on function public.delete_customer(uuid) to authenticated, service_role;
revoke all on function public.delete_supplier(uuid) from public, anon;
grant execute on function public.delete_supplier(uuid) to authenticated, service_role;
revoke all on function public.delete_vehicle(uuid) from public, anon;
grant execute on function public.delete_vehicle(uuid) to authenticated, service_role;
revoke all on function public.delete_product(uuid) from public, anon;
grant execute on function public.delete_product(uuid) to authenticated, service_role;
revoke all on function public.update_installment(uuid, numeric, date, text) from public, anon;
grant execute on function public.update_installment(uuid, numeric, date, text) to authenticated, service_role;
revoke all on function public.update_contract_terms(uuid, numeric, integer, text, integer, date, text) from public, anon;
grant execute on function public.update_contract_terms(uuid, numeric, integer, text, integer, date, text) to authenticated, service_role;
revoke all on function public.cancel_active_contract(uuid, text) from public, anon;
grant execute on function public.cancel_active_contract(uuid, text) to authenticated, service_role;
revoke all on function public.cancel_approved_purchase_invoice(uuid, text) from public, anon;
grant execute on function public.cancel_approved_purchase_invoice(uuid, text) to authenticated, service_role;

-- Expenses need RLS delete? Soft paths go through RPCs; grant delete for draft hard-delete fallback.
drop policy if exists expenses_delete_authorized on public.expenses;
create policy expenses_delete_authorized
on public.expenses
for delete
to authenticated
using (
  public.has_permission('expenses.cancel', branch_id)
  and status = 'draft'
);
grant delete on public.expenses to authenticated;

drop trigger if exists audit_expenses_change on public.expenses;
create trigger audit_expenses_change
after insert or update or delete on public.expenses
for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- 7. Stock transfers (edit draft).
-- ---------------------------------------------------------------------------

create or replace function public.update_stock_transfer(
  p_transfer_id uuid,
  p_from_branch_id uuid,
  p_to_branch_id uuid,
  p_items jsonb,
  p_transfer_date date default null,
  p_notes text default null
)
returns public.stock_transfers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur public.stock_transfers;
  line record;
  line_index integer := 0;
  product_value uuid;
  vehicle_value uuid;
  item_quantity numeric;
  target_vehicle public.vehicles;
begin
  if not public.has_permission('products.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into cur from public.stock_transfers where id = p_transfer_id for update;
  if not found then raise exception 'transfer_missing' using errcode = 'P0001'; end if;
  if cur.status <> 'draft' then
    raise exception 'transfer_not_draft' using errcode = 'P0001';
  end if;

  if p_from_branch_id = p_to_branch_id then
    raise exception 'invalid_transfer_branch' using errcode = '22023';
  end if;

  if not public.is_branch_member(p_from_branch_id) or not public.is_branch_member(p_to_branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'invalid_transfer_items' using errcode = '22023';
  end if;

  for line in select value from jsonb_array_elements(p_items) loop
    product_value := nullif(btrim(coalesce(line.value ->> 'product_id', '')), '')::uuid;
    vehicle_value := nullif(btrim(coalesce(line.value ->> 'vehicle_id', '')), '')::uuid;
    item_quantity := coalesce((line.value ->> 'quantity')::numeric, 0);
    if num_nonnulls(product_value, vehicle_value) <> 1 or item_quantity <= 0 then
      raise exception 'invalid_transfer_item_numbers' using errcode = '22023';
    end if;
    if product_value is not null and not exists (
      select 1 from public.products where id = product_value and status <> 'archived'
    ) then
      raise exception 'product_missing' using errcode = 'P0001';
    end if;
    if vehicle_value is not null then
      select * into target_vehicle from public.vehicles where id = vehicle_value;
      if not found then raise exception 'vehicle_missing' using errcode = 'P0001'; end if;
      if target_vehicle.branch_id <> p_from_branch_id then
        raise exception 'vehicle_branch_mismatch' using errcode = 'P0001';
      end if;
    end if;
  end loop;

  update public.stock_transfers
  set from_branch_id = p_from_branch_id, to_branch_id = p_to_branch_id,
      transfer_date = coalesce(p_transfer_date, transfer_date),
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      updated_at = now(), updated_by = auth.uid()
  where id = p_transfer_id
  returning * into cur;

  delete from public.stock_transfer_items where transfer_id = p_transfer_id;

  for line in select value from jsonb_array_elements(p_items) loop
    line_index := line_index + 1;
    product_value := nullif(btrim(coalesce(line.value ->> 'product_id', '')), '')::uuid;
    vehicle_value := nullif(btrim(coalesce(line.value ->> 'vehicle_id', '')), '')::uuid;
    item_quantity := coalesce((line.value ->> 'quantity')::numeric, 0);
    insert into public.stock_transfer_items (transfer_id, line_no, product_id, vehicle_id, quantity, unit_cost)
    values (
      p_transfer_id, line_index, product_value, vehicle_value, item_quantity,
      case when product_value is not null
        then coalesce((select unit_cost from public.products where id = product_value), 0)
        else coalesce((select approved_cost from public.vehicles where id = vehicle_value), 0)
      end
    );
  end loop;

  return cur;
end;
$$;

revoke all on function public.update_stock_transfer(uuid, uuid, uuid, jsonb, date, text) from public, anon;
grant execute on function public.update_stock_transfer(uuid, uuid, uuid, jsonb, date, text) to authenticated, service_role;
