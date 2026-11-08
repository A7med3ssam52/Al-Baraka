-- M7-Balance — Customer prepaid balance (رصيد العميل) with automatic
-- deduction from upcoming installments (السيستم يخصمها لوحده).
--
-- Idea: العميل يدفع مقدمًا رصيدًا (كاش/تحويل). المبلغ يدخل الخزنة/البنك
-- ويرفع customers.credit_balance. بعدها النظام يخصم تلقائيًا من الأقساط
-- غير المدفوعة (الأقدم استحقاقًا أولًا) من غير أي تحريك كاش جديد —
-- لأن الفلوس دخلت أصلًا وقت شحن الرصيد.
--
-- المحاسبة:
--   * شحن الرصيد: مدين خزنة/بنك، دائن مقدمات عملاء (2201)
--   * الخصم التلقائي: مدين مقدمات عملاء (2201)، دائن عملاء (1201)
--   * customers.credit_balance = رصيد العملاء المتاح دائمًا
--   * customer_balance_transactions = دفتر حركة الرصيد
--   * payments: الشحن = (extra, cash/bank) بلا عقد؛ الخصم = (installment, balance)
--   * customer_transactions: الخصم فقط (payment -amount) — الشحن ما بيخلقش
--     حركة مديونية عشان ما يتضاعفش (المديونية بتقل وقت الخصم الفعلي).

-- ---------------------------------------------------------------------------
-- 1. customers.credit_balance
-- ---------------------------------------------------------------------------

alter table public.customers
  add column if not exists credit_balance numeric(14, 2) not null default 0
    check (credit_balance >= 0);

-- فترة شحن: طريقة دفع 'balance'
alter table public.payments
  drop constraint if exists payments_payment_method_check;
alter table public.payments
  add constraint payments_payment_method_check
  check (payment_method in ('cash', 'bank', 'transfer', 'cheque', 'balance'));

-- ---------------------------------------------------------------------------
-- 2. حساب مقدمات العملاء (2201) — التزام
-- ---------------------------------------------------------------------------

insert into public.accounts (code, name_ar, name_en, account_type, normal_balance, is_group)
values
  ('2201', 'مقدمات عملاء', 'Customer advances', 'liability', 'credit', false)
on conflict (code) do update
set name_ar = excluded.name_ar,
    account_type = excluded.account_type,
    normal_balance = excluded.normal_balance,
    is_active = true;

update public.accounts as child
set parent_id = parent.id
from (values ('2201', '2000')) as mapping(child_code, parent_code)
join public.accounts as parent on parent.code = mapping.parent_code
where child.code = mapping.child_code;

-- ---------------------------------------------------------------------------
-- 3. جدول حركة الرصيد
-- ---------------------------------------------------------------------------

create table if not exists public.customer_balance_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  branch_id uuid not null references public.branches (id) on delete restrict,
  transaction_type text not null check (transaction_type in ('top_up', 'deduction')),
  transaction_date date not null default current_date,
  amount numeric(14, 2) not null check (amount <> 0),
  reference_type text,
  reference_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create index if not exists customer_balance_transactions_customer_idx
  on public.customer_balance_transactions (customer_id, transaction_date desc, created_at desc);

alter table public.customer_balance_transactions enable row level security;

drop policy if exists customer_balance_transactions_select_authorized on public.customer_balance_transactions;
create policy customer_balance_transactions_select_authorized
on public.customer_balance_transactions
for select
to authenticated
using (
  public.has_permission('customers.view')
  and public.is_branch_member(branch_id)
);

revoke all on public.customer_balance_transactions from public, anon, authenticated;
grant select on public.customer_balance_transactions to authenticated;

drop trigger if exists audit_customer_balance_transactions_change on public.customer_balance_transactions;
create trigger audit_customer_balance_transactions_change
after insert or update or delete on public.customer_balance_transactions
for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- 4. apply_customer_balance_internal — قلب الخصم التلقائي (بلا صلاحية؛
--    يُستدعى من الدوال العامة ومن trigger التفعيل).
-- ---------------------------------------------------------------------------

create or replace function public.apply_customer_balance_internal(
  p_customer_id uuid,
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer public.customers;
  v_balance numeric;
  v_applied numeric := 0;
  v_count integer := 0;
  rec record;
  v_take numeric;
  v_remaining numeric;
  v_advances_account uuid;
  v_receivable_account uuid;
  v_journal_id uuid;
  v_journal_number text;
  v_payment_id uuid;
  v_as_of date := coalesce(p_as_of_date, current_date);
begin
  if p_customer_id is null then
    raise exception 'customer_missing' using errcode = 'P0001';
  end if;

  select * into v_customer from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'customer_missing' using errcode = 'P0001';
  end if;

  if v_customer.status = 'archived' then
    return jsonb_build_object('applied_amount', 0, 'paid_count', 0, 'remaining_balance', 0);
  end if;

  v_balance := coalesce(v_customer.credit_balance, 0);
  if v_balance <= 0 then
    return jsonb_build_object('applied_amount', 0, 'paid_count', 0, 'remaining_balance', v_balance);
  end if;

  select id into v_advances_account from public.accounts where code = '2201';
  select id into v_receivable_account from public.accounts where code = '1201';
  if v_advances_account is null or v_receivable_account is null then
    raise exception 'journal_account_missing' using errcode = 'P0001';
  end if;

  for rec in
    select i.id as installment_id, i.amount, i.paid_amount, i.due_date,
           c.id as contract_id, c.number as contract_number, c.sale_invoice_id, c.branch_id
    from public.installments as i
    join public.installment_schedules as s on s.id = i.schedule_id
    join public.contracts as c on c.id = s.contract_id
    where c.customer_id = p_customer_id
      and c.status = 'active'
      and s.status = 'active'
      and i.status not in ('paid', 'waived')
      and (i.amount - i.paid_amount) > 0
    order by i.due_date asc, i.installment_no asc
    for update of i
  loop
    v_remaining := rec.amount - rec.paid_amount;
    v_take := least(v_balance, v_remaining);
    if v_take <= 0 then
      exit;
    end if;

    update public.installments
    set paid_amount = paid_amount + v_take,
        status = case when paid_amount + v_take >= amount then 'paid' else 'partial' end,
        paid_at = case when paid_amount + v_take >= amount then coalesce(paid_at, now()) else paid_at end
    where id = rec.installment_id;

    insert into public.payments (
      contract_id, sale_invoice_id, customer_id, branch_id, payment_type,
      payment_date, amount, payment_method, notes, created_by, updated_by
    )
    values (
      rec.contract_id, rec.sale_invoice_id, p_customer_id, rec.branch_id, 'installment',
      v_as_of, v_take, 'balance', 'خصم تلقائي من رصيد العميل', auth.uid(), auth.uid()
    )
    returning id into v_payment_id;

    insert into public.customer_transactions (
      customer_id, branch_id, transaction_type, transaction_date, amount,
      reference_type, reference_id, notes, created_by
    )
    values (
      p_customer_id, rec.branch_id, 'payment', v_as_of, -v_take,
      'installment', rec.installment_id, 'خصم من رصيد العميل', auth.uid()
    );

    insert into public.customer_balance_transactions (
      customer_id, branch_id, transaction_type, transaction_date, amount,
      reference_type, reference_id, notes, created_by
    )
    values (
      p_customer_id, rec.branch_id, 'deduction', v_as_of, -v_take,
      'installment', rec.installment_id, 'خصم قسط ' || rec.contract_number, auth.uid()
    );

    -- قيد محاسبي: مدين مقدمات عملاء / دائن عملاء (بدون كاش/بنك)
    v_journal_number := public.next_entity_code('journal_entry');
    insert into public.journal_entries (
      branch_id, entry_number, entry_date, description, source_type, source_id,
      status, posted_at, posted_by, total_debit, total_credit, created_by, updated_by
    )
    values (
      rec.branch_id, v_journal_number, v_as_of,
      'خصم تلقائي من رصيد ' || rec.contract_number,
      'installment', rec.installment_id, 'posted', now(), auth.uid(),
      v_take, v_take, auth.uid(), auth.uid()
    )
    returning id into v_journal_id;

    insert into public.journal_entry_lines (
      journal_entry_id, line_number, account_id, description, debit, credit, created_by
    )
    values
      (v_journal_id, 1, v_advances_account, 'خصم من رصيد ' || rec.contract_number, v_take, 0, auth.uid()),
      (v_journal_id, 2, v_receivable_account, 'ذمم قسط ' || rec.contract_number, 0, v_take, auth.uid());

    update public.payments set journal_entry_id = v_journal_id where id = v_payment_id;

    v_balance := v_balance - v_take;
    v_applied := v_applied + v_take;
    v_count := v_count + 1;

    if v_balance <= 0 then
      exit;
    end if;
  end loop;

  update public.customers
  set credit_balance = v_balance,
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_customer_id;

  return jsonb_build_object(
    'applied_amount', v_applied,
    'paid_count', v_count,
    'remaining_balance', v_balance
  );
end;
$$;

revoke all on function public.apply_customer_balance_internal(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. apply_customer_balance — الدالة العامة (عميل واحد أو كل الفرع).
-- ---------------------------------------------------------------------------

create or replace function public.apply_customer_balance(
  p_customer_id uuid default null,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_single jsonb;
  v_total_applied numeric := 0;
  v_total_paid integer := 0;
  v_customers integer := 0;
  cid record;
begin
  if not public.has_permission('installments.collect') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_customer_id is not null then
    if not exists (
      select 1 from public.customers c
      where c.id = p_customer_id and public.is_branch_member(c.branch_id)
    ) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    v_single := public.apply_customer_balance_internal(p_customer_id, current_date);
    return jsonb_build_object(
      'customers_processed', 1,
      'paid_count', coalesce((v_single->>'paid_count')::integer, 0),
      'applied_amount', coalesce((v_single->>'applied_amount')::numeric, 0),
      'remaining_balance', coalesce((v_single->>'remaining_balance')::numeric, 0)
    );
  end if;

  for cid in
    select c.id
    from public.customers as c
    where coalesce(c.credit_balance, 0) > 0
      and c.status <> 'archived'
      and public.is_branch_member(c.branch_id)
      and (p_branch_id is null or c.branch_id = p_branch_id)
    order by c.id
  loop
    v_single := public.apply_customer_balance_internal(cid.id, current_date);
    v_total_applied := v_total_applied + coalesce((v_single->>'applied_amount')::numeric, 0);
    v_total_paid := v_total_paid + coalesce((v_single->>'paid_count')::integer, 0);
    v_customers := v_customers + 1;
  end loop;

  return jsonb_build_object(
    'customers_processed', v_customers,
    'paid_count', v_total_paid,
    'applied_amount', v_total_applied
  );
end;
$$;

revoke all on function public.apply_customer_balance(uuid, uuid) from public, anon;
grant execute on function public.apply_customer_balance(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. add_customer_balance — شحن رصيد + خصم تلقائي فوري.
-- ---------------------------------------------------------------------------

create or replace function public.add_customer_balance(
  p_customer_id uuid,
  p_amount numeric,
  p_payment_method text default 'cash',
  p_payment_date date default current_date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer public.customers;
  v_amount numeric := coalesce(p_amount, 0);
  v_method text := lower(btrim(coalesce(p_payment_method, 'cash')));
  v_as_of date := coalesce(p_payment_date, current_date);
  v_cashbox_id uuid;
  v_bank_id uuid;
  v_payment_account uuid;
  v_advances_account uuid;
  v_journal_id uuid;
  v_journal_number text;
  v_payment_id uuid;
  v_balance_tx_id uuid;
  v_apply_result jsonb;
  v_new_balance numeric;
begin
  if not public.has_permission('installments.collect') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_customer from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'customer_missing' using errcode = 'P0001';
  end if;

  if v_customer.status = 'archived' then
    raise exception 'customer_archived' using errcode = 'P0001';
  end if;

  if not public.is_branch_member(v_customer.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  v_cashbox_id := null;
  v_bank_id := null;
  v_payment_account := null;

  if v_method = 'cash' then
    select id, account_id into v_cashbox_id, v_payment_account
    from public.cashboxes
    where branch_id = v_customer.branch_id and is_default and is_active
    limit 1 for update;
  elsif v_method = 'bank' then
    select id, account_id into v_bank_id, v_payment_account
    from public.bank_accounts
    where branch_id = v_customer.branch_id and is_default and is_active
    limit 1 for update;
  else
    raise exception 'invalid_payment_method' using errcode = '22023';
  end if;

  if v_payment_account is null then
    raise exception 'payment_source_missing' using errcode = 'P0001';
  end if;

  select id into v_advances_account from public.accounts where code = '2201';
  if v_advances_account is null then
    raise exception 'journal_account_missing' using errcode = 'P0001';
  end if;

  -- دخول الفلوس الخزنة/البنك
  if v_method = 'cash' then
    update public.cashboxes
    set current_balance = current_balance + v_amount, updated_at = now(), updated_by = auth.uid()
    where id = v_cashbox_id;
  else
    update public.bank_accounts
    set current_balance = current_balance + v_amount, updated_at = now(), updated_by = auth.uid()
    where id = v_bank_id;
  end if;

  -- رفع رصيد العميل
  v_new_balance := coalesce(v_customer.credit_balance, 0) + v_amount;
  update public.customers
  set credit_balance = v_new_balance, updated_at = now(), updated_by = auth.uid()
  where id = p_customer_id;

  -- سجل دفع (بدون عقد) + حركة رصيد
  insert into public.payments (
    contract_id, sale_invoice_id, customer_id, branch_id, payment_type,
    payment_date, amount, payment_method, cashbox_id, bank_account_id,
    notes, created_by, updated_by
  )
  values (
    null, null, p_customer_id, v_customer.branch_id, 'extra',
    v_as_of, v_amount, v_method,
    case when v_method = 'cash' then v_cashbox_id else null end,
    case when v_method = 'bank' then v_bank_id else null end,
    coalesce(nullif(btrim(coalesce(p_notes, '')), ''), 'إضافة رصيد'),
    auth.uid(), auth.uid()
  )
  returning id into v_payment_id;

  insert into public.customer_balance_transactions (
    customer_id, branch_id, transaction_type, transaction_date, amount,
    reference_type, reference_id, notes, created_by
  )
  values (
    p_customer_id, v_customer.branch_id, 'top_up', v_as_of, v_amount,
    'payment', v_payment_id, 'إضافة رصيد', auth.uid()
  )
  returning id into v_balance_tx_id;

  -- قيد: مدين خزنة/بنك / دائن مقدمات عملاء
  v_journal_number := public.next_entity_code('journal_entry');
  insert into public.journal_entries (
    branch_id, entry_number, entry_date, description, source_type, source_id,
    status, posted_at, posted_by, total_debit, total_credit, created_by, updated_by
  )
  values (
    v_customer.branch_id, v_journal_number, v_as_of,
    'إضافة رصيد ' || v_customer.code,
    'balance_top_up', v_payment_id, 'posted', now(), auth.uid(),
    v_amount, v_amount, auth.uid(), auth.uid()
  )
  returning id into v_journal_id;

  insert into public.journal_entry_lines (
    journal_entry_id, line_number, account_id, description, debit, credit, created_by
  )
  values
    (v_journal_id, 1, v_payment_account, 'إضافة رصيد ' || v_customer.code, v_amount, 0, auth.uid()),
    (v_journal_id, 2, v_advances_account, 'إضافة رصيد ' || v_customer.code, 0, v_amount, auth.uid());

  update public.payments set journal_entry_id = v_journal_id where id = v_payment_id;

  -- خصم تلقائي فوري للأقساط القادمة
  v_apply_result := public.apply_customer_balance_internal(p_customer_id, v_as_of);

  return jsonb_build_object(
    'balance_transaction_id', v_balance_tx_id,
    'payment_id', v_payment_id,
    'amount', v_amount,
    'applied_amount', coalesce((v_apply_result->>'applied_amount')::numeric, 0),
    'applied_count', coalesce((v_apply_result->>'paid_count')::integer, 0),
    'remaining_balance', coalesce((v_apply_result->>'remaining_balance')::numeric, 0)
  );
end;
$$;

revoke all on function public.add_customer_balance(uuid, numeric, text, date, text) from public, anon;
grant execute on function public.add_customer_balance(uuid, numeric, text, date, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. list_customer_balance_transactions — قراءة دفتر الرصيد.
-- ---------------------------------------------------------------------------

create or replace function public.list_customer_balance_transactions(
  p_customer_id uuid,
  p_limit integer default 100
)
returns table (
  id uuid,
  customer_id uuid,
  branch_id uuid,
  transaction_type text,
  transaction_date date,
  amount numeric,
  reference_type text,
  reference_id uuid,
  notes text,
  created_at timestamptz,
  created_by uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id, t.customer_id, t.branch_id, t.transaction_type, t.transaction_date,
         t.amount, t.reference_type, t.reference_id, t.notes, t.created_at, t.created_by
  from public.customer_balance_transactions as t
  where t.customer_id = p_customer_id
    and exists (
      select 1 from public.customers as c
      where c.id = t.customer_id and public.is_branch_member(c.branch_id)
    )
  order by t.transaction_date desc, t.created_at desc, t.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke all on function public.list_customer_balance_transactions(uuid, integer) from public, anon;
grant execute on function public.list_customer_balance_transactions(uuid, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. خصم تلقائي عند تفعيل جدول أقساط جديد — العميل اللي عنده رصيد
--    بيتخصم له فورًا من غير تدخل.
-- ---------------------------------------------------------------------------

create or replace function public.auto_apply_balance_on_schedule_active()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
begin
  select customer_id into v_customer_id from public.contracts where id = NEW.contract_id;
  if v_customer_id is not null then
    perform public.apply_customer_balance_internal(v_customer_id, current_date);
  end if;
  return NEW;
end;
$$;

revoke all on function public.auto_apply_balance_on_schedule_active() from public, anon, authenticated, service_role;

drop trigger if exists auto_apply_balance_on_schedule_active on public.installment_schedules;
create trigger auto_apply_balance_on_schedule_active
after update of status on public.installment_schedules
for each row
when (OLD.status <> NEW.status and NEW.status = 'active')
execute function public.auto_apply_balance_on_schedule_active();
