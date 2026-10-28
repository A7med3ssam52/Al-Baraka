-- M3.1 — Product classifications and quantitative products.
--
-- Reference tables (categories with self-reference, brands, models, units)
-- plus the quantitative product catalog: barcode, reorder level, valuation
-- method, current stock, and unit cost. Stock movements themselves land in
-- M3.3; here a fresh product always starts with stock 0. All writes go
-- through security-definer RPCs; direct table writes stay denied (no
-- INSERT/UPDATE policies, revoke on the tables).

-- ---------------------------------------------------------------------------
-- 1. Product code sequence (PRD-0001).
-- ---------------------------------------------------------------------------

insert into public.code_sequences (entity, prefix, padding)
values ('product', 'PRD', 4)
on conflict (entity) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Reference tables.
-- ---------------------------------------------------------------------------

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 80),
  parent_id uuid references public.product_categories (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create table if not exists public.product_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create table if not exists public.product_models (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.product_brands (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  unique (brand_id, name)
);

create table if not exists public.product_units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 40),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

-- Seed the common measurement units.
insert into public.product_units (name)
values
  ('قطعة'),
  ('كرتونة'),
  ('كيلو جرام'),
  ('جرام'),
  ('لتر')
on conflict (name) do nothing;

do $$
declare
  targets text;
begin
  -- RLS + selects for the four reference tables.
  -- RLS + selects for the four reference tables.
  foreach targets in array array['product_categories', 'product_brands', 'product_models', 'product_units']  loop
    execute format(
      'alter table public.%I enable row level security', targets
    );
    execute format(
      'drop policy if exists %I on public.%2$I', targets || '_select_authorized', targets
    );
    execute format(
      'create policy %I on public.%2$I for select to authenticated
       using (public.has_permission(''products.view''))',
      targets || '_select_authorized', targets
    );
    execute format(
      'revoke all on public.%I from authenticated, anon', targets
    );
    execute format(
      'grant select on public.%I to authenticated', targets
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Products (quantitative catalog).
-- ---------------------------------------------------------------------------

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null check (char_length(btrim(name)) between 2 and 150),
  category_id uuid references public.product_categories (id),
  brand_id uuid references public.product_brands (id),
  model_id uuid references public.product_models (id),
  unit_name text references public.product_units (name),
  barcode text unique,
  description text,
  unit_cost numeric(14, 2) not null default 0 check (unit_cost >= 0),
  valuation_method text not null default 'avco' check (valuation_method in ('fifo', 'avco', 'weighted')),
  reorder_level numeric(14, 2) not null default 0 check (reorder_level >= 0),
  stock_qty numeric(14, 2) not null default 0 check (stock_qty >= 0),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create index if not exists products_name_idx on public.products (name);
create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_status_idx on public.products (status, code);

alter table public.products enable row level security;

drop policy if exists products_select_authorized on public.products;
create policy products_select_authorized
on public.products
for select
to authenticated
using (public.has_permission('products.view'));

revoke all on public.products from authenticated, anon;
grant select on public.products to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Reference RPCs (upsert + soft archive).
-- ---------------------------------------------------------------------------

create or replace function public.save_product_category(
  p_name text,
  p_parent_id uuid default null,
  p_id uuid default null
)
returns public.product_categories
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_name text := btrim(coalesce(p_name, ''));
  new_row public.product_categories;
begin
  if not public.has_permission('products.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if char_length(clean_name) < 2 or char_length(clean_name) > 80 then
    raise exception 'invalid_reference_name' using errcode = '22023';
  end if;

  if p_parent_id = p_id then
    raise exception 'cyclic_reference' using errcode = '22023';
  end if;

  insert into public.product_categories (id, name, parent_id, created_by)
  values (coalesce(p_id, gen_random_uuid()), clean_name, p_parent_id, auth.uid())
  on conflict (id) do update
  set name = clean_name,
      parent_id = p_parent_id
  returning * into new_row;

  return new_row;
end;
$$;

revoke all on function public.save_product_category(text, uuid, uuid) from public, anon;
grant execute on function public.save_product_category(text, uuid, uuid) to authenticated, service_role;

create or replace function public.save_product_brand(
  p_name text,
  p_id uuid default null
)
returns public.product_brands
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_name text := btrim(coalesce(p_name, ''));
  new_row public.product_brands;
begin
  if not public.has_permission('products.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if char_length(clean_name) < 1 or char_length(clean_name) > 80 then
    raise exception 'invalid_reference_name' using errcode = '22023';
  end if;

  insert into public.product_brands (id, name, created_by)
  values (coalesce(p_id, gen_random_uuid()), clean_name, auth.uid())
  on conflict (id) do update
  set name = clean_name
  returning * into new_row;

  return new_row;
end;
$$;

revoke all on function public.save_product_brand(text, uuid) from public, anon;
grant execute on function public.save_product_brand(text, uuid) to authenticated, service_role;

create or replace function public.save_product_model(
  p_brand_id uuid,
  p_name text,
  p_id uuid default null
)
returns public.product_models
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_name text := btrim(coalesce(p_name, ''));
  new_row public.product_models;
begin
  if not public.has_permission('products.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_brand_id is null or not exists (
    select 1 from public.product_brands where id = p_brand_id and is_active
  ) then
    raise exception 'product_brand_missing' using errcode = 'P0001';
  end if;

  if char_length(clean_name) < 1 or char_length(clean_name) > 80 then
    raise exception 'invalid_reference_name' using errcode = '22023';
  end if;

  insert into public.product_models (id, brand_id, name, created_by)
  values (coalesce(p_id, gen_random_uuid()), p_brand_id, clean_name, auth.uid())
  on conflict (id) do update
  set brand_id = p_brand_id,
      name = clean_name
  returning * into new_row;

  return new_row;
end;
$$;

revoke all on function public.save_product_model(uuid, text, uuid) from public, anon;
grant execute on function public.save_product_model(uuid, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Product RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.create_product(
  p_name text,
  p_category_id uuid default null,
  p_brand_id uuid default null,
  p_model_id uuid default null,
  p_unit_name text default null,
  p_barcode text default null,
  p_description text default null,
  p_unit_cost numeric default null,
  p_valuation_method text default null,
  p_reorder_level numeric default null
)
returns public.products
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_name text := btrim(coalesce(p_name, ''));
  clean_barcode text;
  clean_method text := lower(btrim(coalesce(p_valuation_method, 'avco')));
  clean_cost numeric := coalesce(p_unit_cost, 0);
  clean_reorder numeric := coalesce(p_reorder_level, 0);
  new_row public.products;
begin
  if not public.has_permission('products.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if char_length(clean_name) < 2 or char_length(clean_name) > 150 then
    raise exception 'invalid_product_name' using errcode = '22023';
  end if;

  if clean_method not in ('fifo', 'avco', 'weighted') then
    raise exception 'invalid_valuation_method' using errcode = '22023';
  end if;

  if clean_cost < 0 or clean_reorder < 0 then
    raise exception 'invalid_product_numbers' using errcode = '22023';
  end if;

  if clean_reorder > 999999999 then
    raise exception 'invalid_product_numbers' using errcode = '22023';
  end if;

  clean_barcode := nullif(btrim(coalesce(p_barcode, '')), '');
  if exists (
    select 1 from public.products where barcode = clean_barcode
  ) and clean_barcode is not null then
    raise exception 'duplicate_barcode' using errcode = 'P0001';
  end if;

  insert into public.products (
    code, name, category_id, brand_id, model_id, unit_name,
    barcode, description, unit_cost, valuation_method, reorder_level,
    created_by, updated_by
  )
  values (
    public.next_entity_code('product'), clean_name, p_category_id, p_brand_id, p_model_id,
    p_unit_name, clean_barcode,
    nullif(btrim(coalesce(p_description, '')), ''),
    clean_cost, clean_method, clean_reorder,
    auth.uid(), auth.uid()
  )
  returning * into new_row;

  return new_row;
end;
$$;

revoke all on function public.create_product(text, uuid, uuid, uuid, text, text, text, numeric, text, numeric)
  from public, anon;
grant execute on function public.create_product(text, uuid, uuid, uuid, text, text, text, numeric, text, numeric)
  to authenticated, service_role;

create or replace function public.update_product(
  p_product_id uuid,
  p_name text,
  p_category_id uuid default null,
  p_brand_id uuid default null,
  p_model_id uuid default null,
  p_unit_name text default null,
  p_barcode text default null,
  p_description text default null,
  p_unit_cost numeric default null,
  p_valuation_method text default null,
  p_reorder_level numeric default null
)
returns public.products
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_name text := btrim(coalesce(p_name, ''));
  clean_barcode text;
  clean_method text := lower(btrim(coalesce(p_valuation_method, 'avco')));
  clean_cost numeric := coalesce(p_unit_cost, 0);
  clean_reorder numeric := coalesce(p_reorder_level, 0);
  new_row public.products;
begin
  if not public.has_permission('products.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if char_length(clean_name) < 2 or char_length(clean_name) > 150 then
    raise exception 'invalid_product_name' using errcode = '22023';
  end if;

  if clean_method not in ('fifo', 'avco', 'weighted') then
    raise exception 'invalid_valuation_method' using errcode = '22023';
  end if;

  if clean_cost < 0 or clean_reorder < 0 then
    raise exception 'invalid_product_numbers' using errcode = '22023';
  end if;

  clean_barcode := nullif(btrim(coalesce(p_barcode, '')), '');
  if clean_barcode is not null and exists (
    select 1 from public.products
    where barcode = clean_barcode and id <> p_product_id
  ) then
    raise exception 'duplicate_barcode' using errcode = 'P0001';
  end if;

  update public.products
  set name = clean_name,
      category_id = p_category_id,
      brand_id = p_brand_id,
      model_id = p_model_id,
      unit_name = p_unit_name,
      barcode = clean_barcode,
      description = nullif(btrim(coalesce(p_description, '')), ''),
      unit_cost = clean_cost,
      valuation_method = clean_method,
      reorder_level = clean_reorder,
      updated_by = auth.uid()
  where products.id = p_product_id
    and status <> 'archived'
  returning * into new_row;

  if new_row is null then
    raise exception 'product_missing' using errcode = 'P0001';
  end if;

  return new_row;
end;
$$;

revoke all on function public.update_product(uuid, text, uuid, uuid, uuid, text, text, text, numeric, text, numeric)
  from public, anon;
grant execute on function public.update_product(uuid, text, uuid, uuid, uuid, text, text, text, numeric, text, numeric)
  to authenticated, service_role;

create or replace function public.set_product_status(
  p_product_id uuid,
  p_status text
)
returns public.products
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_status text := lower(btrim(coalesce(p_status, '')));
  new_row public.products;
begin
  if target_status = 'archived' then
    if not public.has_permission('products.archive') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  else
    if not public.has_permission('products.update') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  if target_status not in ('active', 'inactive', 'archived') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  update public.products
  set status = target_status,
      updated_by = auth.uid()
  where products.id = p_product_id
  returning * into new_row;

  if new_row is null then
    raise exception 'product_missing' using errcode = 'P0001';
  end if;

  return new_row;
end;
$$;

revoke all on function public.set_product_status(uuid, text) from public, anon;
grant execute on function public.set_product_status(uuid, text) to authenticated, service_role;

create or replace function public.list_products(
  p_status text default 'active',
  p_search text default null,
  p_category_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  code text,
  name text,
  category_id uuid,
  category_name text,
  brand_id uuid,
  brand_name text,
  model_id uuid,
  model_name text,
  unit_name text,
  barcode text,
  description text,
  unit_cost numeric,
  valuation_method text,
  reorder_level numeric,
  stock_qty numeric,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('products.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    product.id, product.code, product.name, product.category_id,
    category.name,
    product.brand_id,
    brand.name,
    product.model_id,
    model.name,
    product.unit_name, product.barcode, product.description,
    product.unit_cost, product.valuation_method, product.reorder_level,
    product.stock_qty, product.status, product.created_at
  from public.products as product
  left join public.product_categories as category on category.id = product.category_id
  left join public.product_brands as brand on brand.id = product.brand_id
  left join public.product_models as model on model.id = product.model_id
  where (p_status = 'all' or product.status = lower(btrim(coalesce(p_status, 'all'))))
    and (p_category_id is null or product.category_id = p_category_id)
    and (
      p_search is null
      or product.name ilike '%' || btrim(p_search) || '%'
      or product.code ilike '%' || btrim(p_search) || '%'
      or product.barcode ilike '%' || btrim(p_search) || '%'
    )
  order by product.code
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_products(text, text, uuid, integer, integer) from public, anon;
grant execute on function public.list_products(text, text, uuid, integer, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Audit integration.
-- ---------------------------------------------------------------------------

drop trigger if exists audit_products_change on public.products;
create trigger audit_products_change
after insert or update or delete on public.products
for each row execute function public.audit_row_change();

drop trigger if exists audit_product_categories_change on public.product_categories;
create trigger audit_product_categories_change
after insert or update or delete on public.product_categories
for each row execute function public.audit_row_change();

drop trigger if exists audit_product_brands_change on public.product_brands;
create trigger audit_product_brands_change
after insert or update or delete on public.product_brands
for each row execute function public.audit_row_change();

drop trigger if exists audit_product_models_change on public.product_models;
create trigger audit_product_models_change
after insert or update or delete on public.product_models
for each row execute function public.audit_row_change();

drop trigger if exists audit_product_units_change on public.product_units;
create trigger audit_product_units_change
after insert or update or delete on public.product_units
for each row execute function public.audit_row_change();
