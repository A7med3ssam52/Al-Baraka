-- M2.3 — Customer contacts, guarantors, and suppliers.
--
-- Extra phone contacts for a customer, the guarantor registry (with the
-- contract link table reserved for later modules), and the supplier registry.
-- Client writes go through security-definer RPCs only.

-- ---------------------------------------------------------------------------
-- 1. Customer contacts.
-- ---------------------------------------------------------------------------

create table if not exists public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id),
  label text not null check (char_length(btrim(label)) between 1 and 50),
  mobile text not null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create index if not exists customer_contacts_customer_idx
  on public.customer_contacts (customer_id);

alter table public.customer_contacts enable row level security;

drop policy if exists customer_contacts_select_authorized on public.customer_contacts;
create policy customer_contacts_select_authorized
on public.customer_contacts
for select
to authenticated
using (
  public.has_permission('customers.view')
  and exists (
    select 1 from public.customers as customer
    where customer.id = customer_id
      and public.is_branch_member(customer.branch_id)
  )
);

create or replace function public.add_customer_contact(
  p_customer_id uuid,
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
  normalized text;
  new_row public.customer_contacts;
begin
  if not public.has_permission('customers.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_label is null or char_length(btrim(p_label)) < 1 or char_length(btrim(p_label)) > 50 then
    raise exception 'invalid_contact_label' using errcode = '22023';
  end if;

  normalized := public.normalize_egypt_mobile(p_mobile);

  if not exists (select 1 from public.customers as c where c.id = p_customer_id) then
    raise exception 'customer_missing' using errcode = 'P0001';
  end if;

  insert into public.customer_contacts (
    customer_id, label, mobile, note, created_by
  )
  values (
    p_customer_id, btrim(p_label), normalized,
    nullif(btrim(coalesce(p_note, '')), ''), auth.uid()
  )
  returning * into new_row;

  return new_row;
end;
$$;

revoke all on function public.add_customer_contact(uuid, text, text, text) from public, anon;
grant execute on function public.add_customer_contact(uuid, text, text, text) to authenticated, service_role;

create or replace function public.list_customer_contacts(p_customer_id uuid)
returns table (
  id uuid,
  customer_id uuid,
  label text,
  mobile text,
  note text,
  created_at timestamptz,
  created_by uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select contacts.id, contacts.customer_id, contacts.label, contacts.mobile,
         contacts.note, contacts.created_at, contacts.created_by
  from public.customer_contacts as contacts
  where contacts.customer_id = p_customer_id
  order by contacts.created_at desc, contacts.id desc;
$$;

revoke all on function public.list_customer_contacts(uuid) from public, anon;
grant execute on function public.list_customer_contacts(uuid) to authenticated, service_role;

create or replace function public.delete_customer_contact(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('customers.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.customer_contacts where id = p_contact_id;

  if not found then
    raise exception 'contact_missing' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.delete_customer_contact(uuid) from public, anon;
grant execute on function public.delete_customer_contact(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Guarantors and the contract link table.
-- ---------------------------------------------------------------------------

create table if not exists public.guarantors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 3 and 150),
  national_id text unique not null,
  mobile text not null,
  job text,
  address text,
  branch_id uuid not null references public.branches (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create index if not exists guarantors_name_idx on public.guarantors (full_name);

alter table public.guarantors enable row level security;

drop policy if exists guarantors_select_authorized on public.guarantors;
create policy guarantors_select_authorized
on public.guarantors
for select
to authenticated
using (
  public.has_permission('customers.view')
  and public.is_branch_member(branch_id)
);

-- Reserved for M4.x/M5.x: links a contract to its guarantors. The FK to
-- contracts appears when the contracts table exists.
create table if not exists public.contract_guarantors (
  contract_id uuid,
  guarantor_id uuid not null references public.guarantors (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create unique index if not exists contract_guarantors_unique_idx2
  on public.contract_guarantors (guarantor_id, coalesce(contract_id, '00000000-0000-0000-0000-000000000000'::uuid));

create or replace function public.add_guarantor(
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
  nid text;
  new_row public.guarantors;
begin
  if not public.has_permission('customers.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_full_name is null or char_length(btrim(p_full_name)) < 3 then
    raise exception 'invalid_guarantor_name' using errcode = '22023';
  end if;

  nid := regexp_replace(btrim(coalesce(p_national_id, '')), '\D', '', 'g');

  if not public.validate_national_id(nid) then
    raise exception 'invalid_national_id' using errcode = '22023';
  end if;

  insert into public.guarantors (
    full_name, national_id, mobile, job, address, branch_id, created_by, updated_by
  )
  values (
    btrim(p_full_name), nid, public.normalize_egypt_mobile(p_mobile),
    nullif(btrim(coalesce(p_job, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    public.current_branch(), auth.uid(), auth.uid()
  )
  returning * into new_row;

  return new_row;
end;
$$;

revoke all on function public.add_guarantor(text, text, text, text, text) from public, anon;
grant execute on function public.add_guarantor(text, text, text, text, text) to authenticated, service_role;

create or replace function public.list_guarantors(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  full_name text,
  national_id text,
  mobile text,
  job text,
  address text,
  is_active boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select guarantor.id, guarantor.full_name, guarantor.national_id, guarantor.mobile,
         guarantor.job, guarantor.address, guarantor.is_active, guarantor.created_at
  from public.guarantors as guarantor
  where guarantor.is_active
    and (p_search is null or guarantor.full_name ilike '%' || btrim(p_search) || '%'
         or guarantor.national_id ilike '%' || btrim(p_search) || '%'
         or guarantor.mobile ilike '%' || btrim(p_search) || '%')
  order by guarantor.created_at desc, guarantor.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.list_guarantors(text, integer, integer) from public, anon;
grant execute on function public.list_guarantors(text, integer, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Suppliers.
-- ---------------------------------------------------------------------------

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^SUP-[0-9]{4,}$'),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 150),
  contact_name text,
  phone text not null,
  phone2 text,
  tax_number text,
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

create index if not exists suppliers_name_idx on public.suppliers (full_name);
create index if not exists suppliers_phone_idx on public.suppliers (phone);
create index if not exists suppliers_status_idx on public.suppliers (status, full_name);

alter table public.suppliers enable row level security;

drop policy if exists suppliers_select_authorized on public.suppliers;
create policy suppliers_select_authorized
on public.suppliers
for select
to authenticated
using (public.has_permission('suppliers.view'));

create or replace function public.create_supplier(
  p_full_name text,
  p_phone text,
  p_contact_name text default null,
  p_phone2 text default null,
  p_tax_number text default null,
  p_address text default null,
  p_notes text default null,
  p_branch_id uuid default null
)
returns public.suppliers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_branch uuid := coalesce(p_branch_id, public.current_branch());
  new_code text;
  new_row public.suppliers;
begin
  if not public.has_permission('suppliers.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if target_branch is null or not exists (
    select 1 from public.branches where id = target_branch and is_active
  ) then
    raise exception 'invalid_branch' using errcode = '22023';
  end if;

  if p_full_name is null or char_length(btrim(p_full_name)) < 2 then
    raise exception 'invalid_supplier_name' using errcode = '22023';
  end if;

  new_code := public.next_entity_code('supplier');

  insert into public.suppliers (
    code, full_name, contact_name, phone, phone2, tax_number,
    address, notes, branch_id, created_by, updated_by
  )
  values (
    new_code, btrim(p_full_name),
    nullif(btrim(coalesce(p_contact_name, '')), ''),
    public.normalize_egypt_mobile(p_phone),
    null,
    nullif(btrim(coalesce(p_tax_number, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    target_branch, auth.uid(), auth.uid()
  )
  returning * into new_row;

  return new_row;
end;
$$;

revoke all on function public.create_supplier(text, text, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.create_supplier(text, text, text, text, text, text, text, uuid) to authenticated, service_role;

create or replace function public.update_supplier(
  p_supplier_id uuid,
  p_full_name text,
  p_phone text,
  p_contact_name text default null,
  p_tax_number text default null,
  p_address text default null,
  p_notes text default null
)
returns public.suppliers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_row public.suppliers;
begin
  if not public.has_permission('suppliers.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.suppliers
  set full_name = btrim(p_full_name),
      contact_name = nullif(btrim(coalesce(p_contact_name, '')), ''),
      phone = public.normalize_egypt_mobile(p_phone),
      tax_number = nullif(btrim(coalesce(p_tax_number, '')), ''),
      address = nullif(btrim(coalesce(p_address, '')), ''),
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      updated_by = auth.uid()
  where id = p_supplier_id
    and status <> 'archived'
  returning * into new_row;

  if new_row is null then
    raise exception 'supplier_missing' using errcode = 'P0001';
  end if;

  return new_row;
end;
$$;

revoke all on function public.update_supplier(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_supplier(uuid, text, text, text, text, text, text) to authenticated, service_role;

create or replace function public.set_supplier_status(
  p_supplier_id uuid,
  p_status text
)
returns public.suppliers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_status text := lower(btrim(coalesce(p_status, '')));
  new_row public.suppliers;
begin
  if target_status = 'archived' then
    if not public.has_permission('suppliers.archive') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  else
    if not public.has_permission('suppliers.update') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  if target_status not in ('active', 'inactive', 'archived') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  update public.suppliers
  set status = target_status,
      updated_by = auth.uid()
  where id = p_supplier_id
  returning * into new_row;

  if new_row is null then
    raise exception 'supplier_missing' using errcode = 'P0001';
  end if;

  return new_row;
end;
$$;

revoke all on function public.set_supplier_status(uuid, text) from public, anon;
grant execute on function public.set_supplier_status(uuid, text) to authenticated, service_role;

create or replace function public.list_suppliers(
  p_status text default 'active',
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  code text,
  full_name text,
  contact_name text,
  phone text,
  tax_number text,
  address text,
  status text,
  notes text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('suppliers.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select supplier.id, supplier.code, supplier.full_name, supplier.contact_name,
         supplier.phone, supplier.tax_number, supplier.address, supplier.status,
         supplier.notes, supplier.created_at
  from public.suppliers as supplier
  where (p_status = 'all' or supplier.status = lower(btrim(coalesce(p_status, 'all'))))
    and (
      p_search is null
      or supplier.full_name ilike '%' || btrim(p_search) || '%'
      or supplier.code ilike '%' || btrim(p_search) || '%'
      or supplier.phone ilike '%' || btrim(coalesce(p_search, '')) || '%'
      or supplier.contact_name ilike '%' || btrim(p_search) || '%'
    )
  order by supplier.code
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_suppliers(text, text, integer, integer) from public, anon;
grant execute on function public.list_suppliers(text, text, integer, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Unified search (customer or supplier).
-- ---------------------------------------------------------------------------

create or replace function public.search_customers_suppliers(p_search text)
returns table (
  entity text,
  id uuid,
  code text,
  name text,
  identifier text,
  mobile text,
  status text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  term text := btrim(coalesce(p_search, ''));
  digits text := regexp_replace(term, '\D', '', 'g');
  pattern text := '%' || term || '%';
begin
  if char_length(term) < 1 then
    return;
  end if;

  return query
  (
    select
      'customer'::text as entity, customer.id, customer.code, customer.full_name,
      customer.national_id, customer.mobile, customer.status
    from public.customers as customer
    where public.has_permission('customers.view')
      and (
        customer.full_name ilike pattern
        or customer.code ilike pattern
        or customer.national_id ilike pattern
        or (char_length(digits) >= 4 and (customer.mobile ilike '%' || digits || '%' or customer.phone2 ilike '%' || digits || '%'))
      )
      and customer.status <> 'archived'
    order by customer.code
    limit 25
  )
  union all
  (
    select
      'supplier'::text as entity, supplier.id, supplier.code, supplier.full_name,
      coalesce(supplier.tax_number, ''), supplier.phone, supplier.status
    from public.suppliers as supplier
    where public.has_permission('suppliers.view')
      and (
        supplier.full_name ilike pattern
        or supplier.code ilike pattern
        or supplier.contact_name ilike pattern
        or (char_length(digits) >= 4 and supplier.phone ilike '%' || digits || '%')
      )
      and supplier.status <> 'archived'
    order by supplier.code
    limit 25
  );
end;
$$;

revoke all on function public.search_customers_suppliers(text) from public, anon;
grant execute on function public.search_customers_suppliers(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Audit integration.
-- ---------------------------------------------------------------------------

drop trigger if exists audit_customer_contacts_change on public.customer_contacts;
create trigger audit_customer_contacts_change
after insert or update or delete on public.customer_contacts
for each row execute function public.audit_row_change();

drop trigger if exists audit_guarantors_change on public.guarantors;
create trigger audit_guarantors_change
after insert or update or delete on public.guarantors
for each row execute function public.audit_row_change();

drop trigger if exists audit_suppliers_change on public.suppliers;
create trigger audit_suppliers_change
after insert or update or delete on public.suppliers
for each row execute function public.audit_row_change();

revoke all on public.suppliers from authenticated;
grant select on public.suppliers to authenticated;
revoke all on public.guarantors from authenticated;
grant select on public.guarantors to authenticated;
revoke all on public.customer_contacts from authenticated;
grant select on public.customer_contacts to authenticated;
revoke all on public.contract_guarantors from authenticated;
