-- M1.4 — Branches, showroom settings, and atomic document numbering
--
-- This migration turns the reference data created in M1.1 into a working
-- configuration surface:
--   * branch validation, launch-branch protection, and default branch seeding;
--   * validated showroom settings and document prefixes;
--   * an atomic `next_document_number` function that locks one sequence row
--     per branch, document type, and year;
--   * a read-only sequence view for the settings screen.
--
-- The numbering function is the only supported way to allocate document
-- numbers. `number_sequences` remains closed to direct client writes.

-- ---------------------------------------------------------------------------
-- 1. Branch constraints, normalization, and launch-branch protection.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'branches_code_format_check'
      and conrelid = 'public.branches'::regclass
  ) then
    alter table public.branches
      add constraint branches_code_format_check
      check (code ~ '^[A-Z][A-Z0-9-]{1,11}$') not valid;
  end if;
end;
$$;

alter table public.branches validate constraint branches_code_format_check;

create or replace function public.normalize_branch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.code := upper(btrim(new.code));
  new.name := btrim(new.name);
  new.address := nullif(btrim(new.address), '');
  return new;
end;
$$;

drop trigger if exists branches_normalize on public.branches;
create trigger branches_normalize
before insert or update on public.branches
for each row execute function public.normalize_branch();

create or replace function public.protect_launch_branch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.code = 'SNH-01' then
      raise exception 'launch_branch_locked' using errcode = '42501';
    end if;
    return old;
  end if;

  if new.id is distinct from old.id then
    raise exception 'branch_id_immutable' using errcode = '42501';
  end if;

  if old.code = 'SNH-01' then
    if new.code is distinct from old.code then
      raise exception 'launch_branch_code_immutable' using errcode = '42501';
    end if;
    if new.is_active is not true then
      raise exception 'launch_branch_active_required' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists branches_protect_launch_branch on public.branches;
create trigger branches_protect_launch_branch
before update or delete on public.branches
for each row execute function public.protect_launch_branch();

-- ---------------------------------------------------------------------------
-- 2. Standard updated_by trigger for reference tables.
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_by()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists branches_set_updated_by on public.branches;
create trigger branches_set_updated_by
before update on public.branches
for each row execute function public.set_updated_by();

drop trigger if exists system_settings_set_updated_by on public.system_settings;
create trigger system_settings_set_updated_by
before update on public.system_settings
for each row execute function public.set_updated_by();

drop trigger if exists accounts_set_updated_by on public.accounts;
create trigger accounts_set_updated_by
before update on public.accounts
for each row execute function public.set_updated_by();

drop trigger if exists cashboxes_set_updated_by on public.cashboxes;
create trigger cashboxes_set_updated_by
before update on public.cashboxes
for each row execute function public.set_updated_by();

drop trigger if exists bank_accounts_set_updated_by on public.bank_accounts;
create trigger bank_accounts_set_updated_by
before update on public.bank_accounts
for each row execute function public.set_updated_by();

-- ---------------------------------------------------------------------------
-- 3. Settings validation. Direct updates remain possible for compatibility,
--    but they must pass the same rules as the RPC below.
-- ---------------------------------------------------------------------------

create or replace function public.validate_system_settings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  document_type text;
  document_prefix text;
  allowed_prefixes jsonb := '{}'::jsonb;
begin
  if new.id is distinct from true then
    raise exception 'settings_id_immutable' using errcode = '42501';
  end if;

  if new.branch_code is distinct from 'SNH-01' then
    raise exception 'settings_branch_code_immutable' using errcode = '42501';
  end if;

  new.app_name := btrim(coalesce(new.app_name, ''));
  if char_length(new.app_name) not between 2 and 120 then
    raise exception 'invalid_app_name' using errcode = '22023';
  end if;

  new.currency := upper(btrim(coalesce(new.currency, '')));
  if new.currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;

  if new.timezone is null
     or not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;

  new.logo_url := nullif(btrim(new.logo_url), '');
  if new.logo_url is not null
     and (char_length(new.logo_url) > 500 or new.logo_url !~* '^https?://') then
    raise exception 'invalid_logo_url' using errcode = '22023';
  end if;

  new.address := nullif(btrim(new.address), '');
  if new.address is not null and char_length(new.address) > 300 then
    raise exception 'invalid_address' using errcode = '22023';
  end if;

  new.phone := nullif(btrim(new.phone), '');
  if new.phone is not null and new.phone !~ '^[0-9+\-\s]{7,20}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  new.email := nullif(btrim(new.email), '');
  if new.email is not null
     and (char_length(new.email) > 160
          or new.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  new.tax_number := nullif(btrim(new.tax_number), '');
  if new.tax_number is not null and char_length(new.tax_number) > 50 then
    raise exception 'invalid_tax_number' using errcode = '22023';
  end if;

  if new.default_discount_limit is null or new.default_discount_limit < 0 then
    raise exception 'invalid_discount_limit' using errcode = '22023';
  end if;

  if new.document_prefixes is null
     or jsonb_typeof(new.document_prefixes) <> 'object' then
    raise exception 'invalid_document_prefixes' using errcode = '22023';
  end if;

  foreach document_type in array array[
    'sales_invoice',
    'purchase_invoice',
    'contract',
    'receipt',
    'payment',
    'journal_entry'
  ] loop
    document_prefix := upper(btrim(coalesce(new.document_prefixes ->> document_type, '')));

    if document_prefix = '' then
      document_prefix := case document_type
        when 'sales_invoice' then 'SAL'
        when 'purchase_invoice' then 'PUR'
        when 'contract' then 'CON'
        when 'receipt' then 'REC'
        when 'payment' then 'PAY'
        when 'journal_entry' then 'JV'
      end;
    end if;

    if document_prefix !~ '^[A-Z0-9]{2,6}$' then
      raise exception 'invalid_document_prefix' using errcode = '22023';
    end if;

    allowed_prefixes := allowed_prefixes
      || jsonb_build_object(document_type, document_prefix);
  end loop;

  new.document_prefixes := allowed_prefixes;
  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists system_settings_validate on public.system_settings;
create trigger system_settings_validate
before insert or update on public.system_settings
for each row execute function public.validate_system_settings();

-- ---------------------------------------------------------------------------
-- 4. New branches receive their own cashbox, bank placeholder, and sequences.
-- ---------------------------------------------------------------------------

create or replace function public.seed_branch_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  settings public.system_settings;
  cash_account_id uuid;
  bank_account_id uuid;
  new_year integer := extract(year from (now() at time zone 'Africa/Cairo'))::integer;
  loop_document_type text;
  loop_document_prefix text;
begin
  select * into settings from public.system_settings where id;

  select id into cash_account_id from public.accounts where code = '1101';
  select id into bank_account_id from public.accounts where code = '1103';

  if cash_account_id is not null then
    insert into public.cashboxes (
      branch_id,
      code,
      name_ar,
      name_en,
      account_id,
      currency,
      is_default,
      is_active,
      created_by
    )
    values (
      new.id,
      'CASH-01',
      'الخزنة الرئيسية',
      'Main cashbox',
      cash_account_id,
      coalesce(settings.currency, 'EGP'),
      true,
      true,
      auth.uid()
    )
    on conflict (branch_id, code) do nothing;
  end if;

  -- The bank row is intentionally inactive until real bank details are added
  -- in M6. It keeps the branch structurally ready without implying a live
  -- bank account.
  if bank_account_id is not null then
    insert into public.bank_accounts (
      branch_id,
      code,
      bank_name,
      account_name,
      account_id,
      currency,
      is_active,
      created_by
    )
    values (
      new.id,
      'BANK-01',
      'الحساب البنكي الرئيسي',
      'معرض البركة',
      bank_account_id,
      coalesce(settings.currency, 'EGP'),
      false,
      auth.uid()
    )
    on conflict (branch_id, code) do nothing;
  end if;

  foreach loop_document_type in array array[
    'sales_invoice',
    'purchase_invoice',
    'contract',
    'receipt',
    'payment',
    'journal_entry'
  ] loop
    loop_document_prefix := upper(btrim(coalesce(
      settings.document_prefixes ->> loop_document_type,
      case loop_document_type
        when 'sales_invoice' then 'SAL'
        when 'purchase_invoice' then 'PUR'
        when 'contract' then 'CON'
        when 'receipt' then 'REC'
        when 'payment' then 'PAY'
        when 'journal_entry' then 'JV'
      end
    )));

    insert into public.number_sequences (
      branch_id,
      document_type,
      year,
      prefix,
      next_number,
      padding,
      created_by
    )
    values (
      new.id,
      loop_document_type,
      new_year,
      loop_document_prefix,
      1,
      5,
      auth.uid()
    )
    on conflict (branch_id, document_type, year) do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists branches_seed_defaults on public.branches;
create trigger branches_seed_defaults
after insert on public.branches
for each row execute function public.seed_branch_defaults();

-- The launch branch existed before the trigger. Seed its bank placeholder now;
-- its cashbox and sequences were created by M1.1.
insert into public.bank_accounts (
  branch_id,
  code,
  bank_name,
  account_name,
  account_id,
  currency,
  is_active
)
select
  branch.id,
  'BANK-01',
  'الحساب البنكي الرئيسي',
  'معرض البركة',
  account.id,
  coalesce(settings.currency, 'EGP'),
  false
from public.branches as branch
join public.accounts as account on account.code = '1103'
cross join public.system_settings as settings
where branch.code = 'SNH-01'
on conflict (branch_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Validated settings update RPC.
-- ---------------------------------------------------------------------------

create or replace function public.update_system_settings(
  p_app_name text,
  p_logo_url text default null,
  p_address text default null,
  p_phone text default null,
  p_email text default null,
  p_tax_number text default null,
  p_currency text default 'EGP',
  p_timezone text default 'Africa/Cairo',
  p_document_prefixes jsonb default '{}'::jsonb,
  p_default_discount_limit numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_settings public.system_settings;
  normalized_prefixes jsonb := '{}'::jsonb;
  document_type text;
  document_prefix text;
begin
  if not public.has_permission('settings.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into current_settings from public.system_settings where id;
  if not found then
    raise exception 'settings_missing' using errcode = 'P0001';
  end if;

  if p_app_name is null or char_length(btrim(p_app_name)) not between 2 and 120 then
    raise exception 'invalid_app_name' using errcode = '22023';
  end if;

  foreach document_type in array array[
    'sales_invoice',
    'purchase_invoice',
    'contract',
    'receipt',
    'payment',
    'journal_entry'
  ] loop
    document_prefix := upper(btrim(coalesce(
      coalesce(p_document_prefixes, '{}'::jsonb) ->> document_type,
      current_settings.document_prefixes ->> document_type,
      case document_type
        when 'sales_invoice' then 'SAL'
        when 'purchase_invoice' then 'PUR'
        when 'contract' then 'CON'
        when 'receipt' then 'REC'
        when 'payment' then 'PAY'
        when 'journal_entry' then 'JV'
      end
    )));

    if document_prefix !~ '^[A-Z0-9]{2,6}$' then
      raise exception 'invalid_document_prefix' using errcode = '22023';
    end if;

    normalized_prefixes := normalized_prefixes
      || jsonb_build_object(document_type, document_prefix);
  end loop;

  update public.system_settings
  set app_name = p_app_name,
      logo_url = p_logo_url,
      address = p_address,
      phone = p_phone,
      email = p_email,
      tax_number = p_tax_number,
      currency = coalesce(p_currency, 'EGP'),
      timezone = coalesce(p_timezone, 'Africa/Cairo'),
      document_prefixes = normalized_prefixes,
      default_discount_limit = coalesce(p_default_discount_limit, 0),
      updated_by = auth.uid()
  where id;

  update public.number_sequences as sequence
  set prefix = normalized_prefixes ->> sequence.document_type,
      updated_by = auth.uid()
  where sequence.document_type in (
    'sales_invoice',
    'purchase_invoice',
    'contract',
    'receipt',
    'payment',
    'journal_entry'
  )
    and sequence.prefix is distinct from normalized_prefixes ->> sequence.document_type;

  select * into current_settings from public.system_settings where id;
  return to_jsonb(current_settings);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Atomic document numbering.
-- ---------------------------------------------------------------------------

create or replace function public.next_document_number(
  p_document_type text,
  p_branch_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_branch_id uuid := coalesce(p_branch_id, public.current_branch());
  target_document_type text := lower(btrim(coalesce(p_document_type, '')));
  document_year integer := extract(year from (now() at time zone 'Africa/Cairo'))::integer;
  document_prefix text;
  next_value bigint;
  sequence_padding smallint;
  required_permission text;
  allowed boolean := false;
begin
  if not public.is_active_user() then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if target_branch_id is null then
    raise exception 'branch_required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.branches
    where id = target_branch_id and is_active
  ) then
    raise exception 'invalid_branch' using errcode = '22023';
  end if;

  if not public.is_branch_member(target_branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  required_permission := case target_document_type
    when 'sales_invoice' then 'sales.create'
    when 'purchase_invoice' then 'purchases.create'
    when 'contract' then 'contracts.create'
    when 'receipt' then 'collections.create'
    when 'payment' then 'expenses.create'
    when 'journal_entry' then 'journal_entries.create'
    else null
  end;

  if required_permission is null then
    raise exception 'invalid_document_type' using errcode = '22023';
  end if;

  allowed := public.has_permission(required_permission, target_branch_id);

  if target_document_type = 'sales_invoice' then
    allowed := allowed or public.has_permission('sales.update', target_branch_id);
  elsif target_document_type = 'purchase_invoice' then
    allowed := allowed or public.has_permission('purchases.update', target_branch_id);
  elsif target_document_type = 'contract' then
    allowed := allowed or public.has_permission('contracts.update', target_branch_id);
  elsif target_document_type = 'receipt' then
    allowed := allowed or public.has_permission('installments.collect', target_branch_id);
  elsif target_document_type = 'payment' then
    allowed := allowed or public.has_permission('purchases.create', target_branch_id);
  elsif target_document_type = 'journal_entry' then
    allowed := allowed or public.has_permission('journal_entries.post', target_branch_id);
  end if;

  if not allowed then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select upper(btrim(coalesce(
    settings.document_prefixes ->> target_document_type,
    case target_document_type
      when 'sales_invoice' then 'SAL'
      when 'purchase_invoice' then 'PUR'
      when 'contract' then 'CON'
      when 'receipt' then 'REC'
      when 'payment' then 'PAY'
      when 'journal_entry' then 'JV'
    end
  )))
  into document_prefix
  from public.system_settings as settings
  where settings.id;

  if document_prefix is null or document_prefix !~ '^[A-Z0-9]{2,6}$' then
    raise exception 'invalid_document_prefix' using errcode = '22023';
  end if;

  -- The insert is idempotent; the following SELECT ... FOR UPDATE serializes
  -- concurrent callers on the same branch/type/year row. The first caller sees
  -- next_number = 1, then advances it to 2 for the next transaction.
  insert into public.number_sequences (
    branch_id,
    document_type,
    year,
    prefix,
    next_number,
    padding,
    created_by
  )
  values (
    target_branch_id,
    target_document_type,
    document_year,
    document_prefix,
    1,
    5,
    auth.uid()
  )
  on conflict (branch_id, document_type, year) do nothing;

  select sequence.next_number, sequence.padding
  into next_value, sequence_padding
  from public.number_sequences as sequence
  where sequence.branch_id = target_branch_id
    and sequence.document_type = target_document_type
    and sequence.year = document_year
  for update;

  if not found then
    raise exception 'sequence_missing' using errcode = 'P0001';
  end if;

  update public.number_sequences as sequence
  set next_number = next_value + 1,
      prefix = document_prefix,
      updated_by = auth.uid()
  where sequence.branch_id = target_branch_id
    and sequence.document_type = target_document_type
    and sequence.year = document_year;

  return document_prefix || '-' || document_year::text || '-'
    || lpad(next_value::text, sequence_padding, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Read-only sequence view for the settings screen.
-- ---------------------------------------------------------------------------

create or replace function public.list_document_sequences(
  p_branch_id uuid default null
)
returns table (
  document_type text,
  year integer,
  prefix text,
  next_number bigint,
  padding smallint,
  sample text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_branch_id uuid := coalesce(p_branch_id, public.current_branch());
  current_year integer := extract(year from (now() at time zone 'Africa/Cairo'))::integer;
begin
  if not public.is_active_user() then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if target_branch_id is null or not public.is_branch_member(target_branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not public.has_permission('settings.view', target_branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    sequence.document_type,
    sequence.year,
    sequence.prefix,
    sequence.next_number,
    sequence.padding,
    sequence.prefix || '-' || sequence.year::text || '-'
      || lpad(sequence.next_number::text, sequence.padding, '0')
  from public.number_sequences as sequence
  where sequence.branch_id = target_branch_id
    and sequence.year = current_year
  order by case sequence.document_type
    when 'sales_invoice' then 1
    when 'purchase_invoice' then 2
    when 'contract' then 3
    when 'receipt' then 4
    when 'payment' then 5
    when 'journal_entry' then 6
    else 99
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants. Trigger helpers stay closed; client RPCs are explicit.
-- ---------------------------------------------------------------------------

revoke all on function public.normalize_branch() from public, anon, authenticated, service_role;
revoke all on function public.protect_launch_branch() from public, anon, authenticated, service_role;
revoke all on function public.set_updated_by() from public, anon, authenticated, service_role;
revoke all on function public.validate_system_settings() from public, anon, authenticated, service_role;
revoke all on function public.seed_branch_defaults() from public, anon, authenticated, service_role;

revoke all on function public.update_system_settings(
  text, text, text, text, text, text, text, text, jsonb, numeric
) from public, anon;
grant execute on function public.update_system_settings(
  text, text, text, text, text, text, text, text, jsonb, numeric
) to authenticated, service_role;

revoke all on function public.next_document_number(text, uuid) from public, anon;
grant execute on function public.next_document_number(text, uuid) to authenticated, service_role;

revoke all on function public.list_document_sequences(uuid) from public, anon;
grant execute on function public.list_document_sequences(uuid) to authenticated, service_role;

comment on function public.next_document_number(text, uuid) is
  'Atomically allocates the next document number for a branch, document type, and Cairo year.';
comment on function public.update_system_settings(
  text, text, text, text, text, text, text, text, jsonb, numeric
) is
  'Validates and updates showroom settings and synchronizes document prefixes.';
comment on table public.bank_accounts is
  'Bank accounts. New branches receive an inactive BANK-01 placeholder until M6.';
