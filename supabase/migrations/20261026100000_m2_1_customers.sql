-- M2.1 — Customers
--
-- Creates the `customers` table as the unified customer file required by M2.
-- Clients can only read customer rows (with `customers.view`); every write goes
-- through RPCs that validate the Egyptian national ID, normalize mobile
-- numbers, allocate the unique CUS-xxxx code atomically, and forbid deleting
-- rows with history (archiving replaces deletion).
--
-- Also adds the shared `code_sequences` allocator used by later modules
-- (suppliers, and any other auto-coded entity).

-- ---------------------------------------------------------------------------
-- 1. Entity code allocator.
-- ---------------------------------------------------------------------------

create table if not exists public.code_sequences (
  entity text primary key,
  prefix text not null check (prefix ~ '^[A-Z0-9]{2,6}$'),
  next_number bigint not null default 1 check (next_number >= 1),
  padding smallint not null default 4 check (padding between 1 and 6),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

drop trigger if exists code_sequences_normalize on public.code_sequences;
create trigger code_sequences_normalize
before update on public.code_sequences
for each row execute function public.set_updated_by();

insert into public.code_sequences (entity, prefix, padding)
values
  ('customer', 'CUS', 4),
  ('supplier', 'SUP', 4)
on conflict (entity) do nothing;

create or replace function public.next_entity_code(p_entity text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  entity_key text := lower(btrim(coalesce(p_entity, '')));
  row_record public.code_sequences;
begin
  select * into row_record
  from public.code_sequences
  where entity = entity_key
  for update;

  if not found then
    raise exception 'unknown_code_entity' using errcode = '22023';
  end if;

  update public.code_sequences
  set next_number = row_record.next_number + 1,
      updated_by = coalesce(auth.uid(), updated_by)
  where entity = entity_key;

  return row_record.prefix || '-' || lpad(row_record.next_number::text, row_record.padding, '0');
end;
$$;

revoke all on function public.next_entity_code(text) from public, anon;
grant execute on function public.next_entity_code(text) to authenticated, service_role;

alter table public.code_sequences enable row level security;

drop policy if exists code_sequences_select_authorized on public.code_sequences;
create policy code_sequences_select_authorized
on public.code_sequences
for select
to authenticated
using (public.has_permission('users.view'));

-- ---------------------------------------------------------------------------
-- 2. Validation helpers shared with later modules.
-- ---------------------------------------------------------------------------

-- Egyptian national ID: 14 digits. Format CYYMMDDGGXXXXR
--   C: 2 = born 1900s, 3 = born 2000s
--   GG: governorate 01..88, R: check digit retained as any digit.
create or replace function public.validate_national_id(target text)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  digits text;
  century smallint;
  y smallint;
  m smallint;
  d smallint;
  governorate smallint;
begin
  if target is null then return false; end if;
  digits := regexp_replace(target, '\D', '', 'g');
  if char_length(digits) <> 14 then return false; end if;

  century := substring(digits, 1, 1)::smallint;
  if century not in (2, 3) then return false; end if;

  y := substring(digits, 2, 2)::smallint;
  m := substring(digits, 4, 2)::smallint;
  d := substring(digits, 6, 2)::smallint;
  governorate := substring(digits, 8, 2)::smallint;

  if century = 2 then y := y + 1900; else y := y + 2000; end if;
  if m < 1 or m > 12 then return false; end if;
  if governorate < 1 or governorate > 88 then return false; end if;

  begin
    if make_date(y, m, d) > (now() at time zone 'Africa/Cairo')::date then
      return false;
    end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    return false;
  end;

  return true;
end;
$$;

-- Egyptian mobile normalization. Accepts:
--   01012345678 / 011 / 012 / 015, +2010..., 002010..., 2010..., 10...
-- Returns +20xxxxxxxxxx or raises invalid_mobile.
create or replace function public.normalize_egypt_mobile(target text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  digits text;
  cleaned text;
begin
  if target is null then return null; end if;
  digits := regexp_replace(target, '[^0-9+]', '', 'g');
  digits := regexp_replace(digits, '^\+', '');
  digits := regexp_replace(digits, '^00', '');

  -- Strip the country code "20" or its substitute leading "0".
  if digits ~ '^20[0-9]+$' then
    digits := substr(digits, 3);
  elsif digits ~ '^0[0-9]+$' then
    digits := substr(digits, 2);
  end if;

  -- The remaining national number is exactly 10 digits: 1 + operator [0125] + 8.
  if digits !~ '^1[0125][0-9]{8}$' then
    raise exception 'invalid_mobile' using errcode = '22023';
  end if;

  cleaned := '+20' || digits;
  return cleaned;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Customers table.
-- ---------------------------------------------------------------------------

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^CUS-[0-9]{4,6}$'),
  full_name text not null check (char_length(btrim(full_name)) between 3 and 150),
  national_id text unique not null,
  mobile text not null,
  phone2 text,
  job text,
  address text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  notes text,
  branch_id uuid not null references public.branches (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create index if not exists customers_name_idx on public.customers (full_name);
create index if not exists customers_mobile_idx on public.customers (mobile);
create index if not exists customers_status_idx on public.customers (status, full_name);

drop trigger if exists customers_normalize on public.customers;
create trigger customers_normalize
before insert or update on public.customers
for each row execute function public.set_updated_by();

-- No deletes at all: history is preserved through archiving instead.
create or replace function public.block_customer_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'customer_delete_forbidden' using errcode = '42501';
end;
$$;

revoke all on function public.block_customer_delete() from public, anon, authenticated, service_role;

drop trigger if exists customers_block_delete on public.customers;
create trigger customers_block_delete
before delete on public.customers
for each statement execute function public.block_customer_delete();

-- ---------------------------------------------------------------------------
-- 4. RLS — read only with customers.view. Writes go through RPCs.
-- ---------------------------------------------------------------------------

alter table public.customers enable row level security;

drop policy if exists customers_select_authorized on public.customers;
create policy customers_select_authorized
on public.customers
for select
to authenticated
using (public.has_permission('customers.view'));

drop policy if exists code_sequences_customers_select on public.code_sequences;
drop policy if exists code_sequences_code_select on public.code_sequences;

-- Archiving customers is a sensitive operation for the manager and above;
-- the sales role must not archive (BR-03 / role matrix).
delete from public.role_permissions
where role_id = (select id from public.roles where code = 'sales')
  and permission_id = (select id from public.permissions where code = 'customers.archive');

-- ---------------------------------------------------------------------------
-- 5. Customer RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.check_customer_duplicates(
  p_national_id text,
  p_mobile text,
  p_exclude_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  nid text := regexp_replace(coalesce(p_national_id, ''), '\D', '', 'g');
  dup_mobile text;
  result jsonb;
begin
  begin
    dup_mobile := public.normalize_egypt_mobile(p_mobile);
  exception when sqlstate '22023' then
    dup_mobile := null;
  end;

  select jsonb_build_object(
    'national_id', coalesce((
      select jsonb_build_object('id', c.id, 'code', c.code, 'name', c.full_name)
      from public.customers as c
      where c.national_id = nid
        and (p_exclude_id is null or c.id <> p_exclude_id)
      limit 1
    ), 'null'::jsonb),
    'mobiles', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', c.id, 'code', c.code, 'name', c.full_name)
      )
      from public.customers as c
      where (c.mobile = dup_mobile or c.phone2 = dup_mobile)
        and dup_mobile is not null
        and (p_exclude_id is null or c.id <> p_exclude_id)
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

create or replace function public.create_customer(
  p_full_name text,
  p_national_id text,
  p_mobile text,
  p_phone2 text default null,
  p_job text default null,
  p_address text default null,
  p_notes text default null,
  p_branch_id uuid default null
)
returns public.customers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_branch uuid := coalesce(p_branch_id, public.current_branch());
  nid text := regexp_replace(btrim(coalesce(p_national_id, '')), '\D', '', 'g');
  mobile text;
  phone2 text;
  new_code text;
  new_row public.customers;
begin
  if not public.has_permission('customers.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not public.is_branch_member(target_branch) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_full_name is null or char_length(btrim(p_full_name)) < 3 then
    raise exception 'invalid_customer_name' using errcode = '22023';
  end if;

  if not public.validate_national_id(nid) then
    raise exception 'invalid_national_id' using errcode = '22023';
  end if;

  mobile := public.normalize_egypt_mobile(p_mobile);

  if exists (select 1 from public.customers where national_id = nid) then
    raise exception 'duplicate_national_id' using errcode = '23505';
  end if;

  if p_phone2 is not null and btrim(p_phone2) <> '' then
    phone2 := public.normalize_egypt_mobile(p_phone2);
  end if;

  new_code := public.next_entity_code('customer');

  insert into public.customers (
    code, full_name, national_id, mobile, phone2, job, address, notes,
    branch_id, created_by
  )
  values (
    new_code, btrim(p_full_name), nid, mobile, phone2, p_job, p_address, p_notes,
    target_branch, auth.uid()
  )
  returning * into new_row;

  return new_row;
end;
$$;

create or replace function public.update_customer(
  p_customer_id uuid,
  p_full_name text,
  p_mobile text,
  p_phone2 text default null,
  p_job text default null,
  p_address text default null,
  p_notes text default null
)
returns public.customers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  mobile text;
  phone2 text;
  updated_row public.customers;
begin
  if not public.has_permission('customers.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into updated_row from public.customers where id = p_customer_id;
  if not found then
    raise exception 'customer_missing' using errcode = 'P0001';
  end if;

  if updated_row.status = 'archived' then
    raise exception 'customer_archived' using errcode = '42501';
  end if;

  if p_full_name is null or char_length(btrim(p_full_name)) < 3 then
    raise exception 'invalid_customer_name' using errcode = '22023';
  end if;

  mobile := public.normalize_egypt_mobile(p_mobile);
  if p_phone2 is not null and btrim(p_phone2) <> '' then
    phone2 := public.normalize_egypt_mobile(p_phone2);
  end if;

  update public.customers
  set full_name = btrim(p_full_name),
      mobile = mobile,
      phone2 = phone2,
      job = p_job,
      address = p_address,
      notes = p_notes,
      updated_by = auth.uid()
  where id = p_customer_id
  returning * into updated_row;

  return updated_row;
end;
$$;

create or replace function public.set_customer_status(
  p_customer_id uuid,
  p_status text
)
returns public.customers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_status text := lower(btrim(coalesce(p_status, '')));
  required_permission text;
  updated_row public.customers;
begin
  if target_status not in ('active', 'inactive', 'archived') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select * into updated_row from public.customers where id = p_customer_id;
  if not found then
    raise exception 'customer_missing' using errcode = 'P0001';
  end if;

  if target_status = 'archived' then
    required_permission := 'customers.archive';
  else
    required_permission := 'customers.update';
  end if;

  if not public.has_permission(required_permission) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.customers
  set status = target_status,
      updated_by = auth.uid()
  where id = p_customer_id
  returning * into updated_row;

  return updated_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants.
-- ---------------------------------------------------------------------------

revoke all on function public.validate_national_id(text) from public, anon;
grant execute on function public.validate_national_id(text) to authenticated, service_role;

revoke all on function public.normalize_egypt_mobile(text) from public, anon;
grant execute on function public.normalize_egypt_mobile(text) to authenticated, service_role;

revoke all on function public.check_customer_duplicates(text, text, uuid) from public, anon;
grant execute on function public.check_customer_duplicates(text, text, uuid) to authenticated, service_role;

revoke all on function public.create_customer(
  text, text, text, text, text, text, text, uuid
) from public, anon;
grant execute on function public.create_customer(
  text, text, text, text, text, text, text, uuid
) to authenticated, service_role;

revoke all on function public.update_customer(
  uuid, text, text, text, text, text, text
) from public, anon;
grant execute on function public.update_customer(
  uuid, text, text, text, text, text, text
) to authenticated, service_role;

revoke all on function public.set_customer_status(uuid, text) from public, anon;
grant execute on function public.set_customer_status(uuid, text) to authenticated, service_role;

comment on table public.customers is
  'Unified customer file. Codes come from code_sequences; archiving supplies deletion.';
comment on function public.next_entity_code(text) is
  'Atomically allocates the next shared entity code (customer, supplier, ...).';

-- Capture every customer change in the audit log (M1.5 trigger).
drop trigger if exists audit_customers_change on public.customers;
drop trigger if exists audit_customers_change on public.customers;
create trigger audit_customers_change
after insert or update or delete on public.customers
for each row execute function public.audit_row_change();
