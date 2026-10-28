-- M2.4 — Documents and secure Cloudinary uploads.
--
-- Every customer/supplier document is a registry row (`documents`) holding one
-- or more Cloudinary files (`document_files`). Files are stored with
-- access_mode=authenticated and are only delivered through short-lived signed
-- URLs issued by the `document-url` Edge Function, which logs every access in
-- `document_access_logs`. All writes go through security-definer RPCs.

-- ---------------------------------------------------------------------------
-- 1. Document code sequence (DOC-00001).
-- ---------------------------------------------------------------------------

insert into public.code_sequences (entity, prefix, padding)
values ('document', 'DOC', 5)
on conflict (entity) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Documents registry.
-- ---------------------------------------------------------------------------

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  doc_number text unique not null,
  title text not null check (char_length(btrim(title)) between 2 and 150),
  doc_type text not null default 'other'
    check (doc_type in ('id_card', 'commercial_registry', 'other')),
  owner_type text not null check (owner_type in ('customer', 'supplier')),
  customer_id uuid references public.customers (id),
  supplier_id uuid references public.suppliers (id),
  branch_id uuid not null references public.branches (id),
  status text not null default 'pending' check (status in ('pending', 'complete')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  constraint documents_single_owner check (
    (owner_type = 'customer' and customer_id is not null and supplier_id is null)
    or (owner_type = 'supplier' and supplier_id is not null and customer_id is null)
  )
);

create index if not exists documents_customer_idx on public.documents (customer_id);
create index if not exists documents_supplier_idx on public.documents (supplier_id);
create index if not exists documents_branch_type_idx on public.documents (branch_id, doc_type);

alter table public.documents enable row level security;

drop policy if exists documents_select_authorized on public.documents;
create policy documents_select_authorized
on public.documents
for select
to authenticated
using (
  public.has_permission('documents.view')
  and public.is_branch_member(branch_id)
);

drop policy if exists documents_public_select_denied on public.documents;

revoke all on public.documents from authenticated, anon;
grant select on public.documents to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Document files (Cloudinary assets).
-- ---------------------------------------------------------------------------

create table if not exists public.document_files (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  public_id text unique not null check (char_length(public_id) between 1 and 180),
  resource_type text not null default 'image'
    check (resource_type in ('image', 'raw')),
  format text not null check (format in ('jpg', 'jpeg', 'png', 'webp', 'pdf')),
  file_name text,
  bytes bigint not null check (bytes > 0 and bytes <= 10485760),
  width integer,
  height integer,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles (id)
);

create index if not exists document_files_document_idx on public.document_files (document_id);

alter table public.document_files enable row level security;

drop policy if exists document_files_select_authorized on public.document_files;
create policy document_files_select_authorized
on public.document_files
for select
to authenticated
using (
  exists (
    select 1 from public.documents as document
    where document.id = document_id
      and public.has_permission('documents.view')
      and public.is_branch_member(document.branch_id)
  )
);

revoke all on public.document_files from authenticated, anon;
grant select on public.document_files to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Access log (view/download only, never exposes URLs).
-- ---------------------------------------------------------------------------

create table if not exists public.document_access_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  file_id uuid references public.document_files (id) on delete set null,
  action text not null check (action in ('view', 'download', 'list')),
  accessed_at timestamptz not null default now(),
  accessed_by uuid references public.profiles (id)
);

create index if not exists document_access_logs_document_idx
  on public.document_access_logs (document_id, accessed_at desc);

alter table public.document_access_logs enable row level security;

drop policy if exists document_access_logs_select_authorized on public.document_access_logs;
create policy document_access_logs_select_authorized
on public.document_access_logs
for select
to authenticated
using (
  exists (
    select 1 from public.documents as document
    where document.id = document_id
      and public.has_permission('documents.view')
      and public.is_branch_member(document.branch_id)
  )
);

revoke all on public.document_access_logs from authenticated, anon;
grant select on public.document_access_logs to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.create_document(
  p_title text,
  p_doc_type text,
  p_owner_type text,
  p_customer_id uuid default null,
  p_supplier_id uuid default null,
  p_notes text default null
)
returns public.documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_owner_type text := lower(btrim(coalesce(p_owner_type, '')));
  target_doc_type text := lower(btrim(coalesce(p_doc_type, 'other')));
  target_branch uuid;
  new_row public.documents;
begin
  if not public.has_permission('documents.upload') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if target_doc_type not in ('id_card', 'commercial_registry', 'other') then
    raise exception 'invalid_document_type' using errcode = '22023';
  end if;

  if p_title is null or char_length(btrim(p_title)) < 2 or char_length(btrim(p_title)) > 150 then
    raise exception 'invalid_document_title' using errcode = '22023';
  end if;

  if target_owner_type = 'customer' then
    if p_customer_id is null or not exists (
      select 1 from public.customers where id = p_customer_id
    ) then
      raise exception 'customer_missing' using errcode = 'P0001';
    end if;
    select branch_id into target_branch from public.customers where id = p_customer_id;
  elsif target_owner_type = 'supplier' then
    if p_supplier_id is null or not exists (
      select 1 from public.suppliers where id = p_supplier_id
    ) then
      raise exception 'supplier_missing' using errcode = 'P0001';
    end if;
    select branch_id into target_branch from public.suppliers where id = p_supplier_id;
  else
    raise exception 'invalid_owner_type' using errcode = '22023';
  end if;

  if not public.is_branch_member(target_branch) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.documents (
    doc_number, title, doc_type, owner_type,
    customer_id, supplier_id, branch_id, status, notes, created_by
  )
  values (
    public.next_entity_code('document'), btrim(p_title), target_doc_type, target_owner_type,
    p_customer_id, p_supplier_id, target_branch, 'pending',
    nullif(btrim(coalesce(p_notes, '')), ''), auth.uid()
  )
  returning * into new_row;

  return new_row;
end;
$$;

revoke all on function public.create_document(text, text, text, uuid, uuid, text) from public, anon;
grant execute on function public.create_document(text, text, text, uuid, uuid, text) to authenticated, service_role;

create or replace function public.attach_document_file(
  p_document_id uuid,
  p_public_id text,
  p_format text,
  p_bytes bigint,
  p_file_name text default null,
  p_width integer default null,
  p_height integer default null,
  p_resource_type text default 'image'
)
returns public.document_files
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_public_id text := btrim(coalesce(p_public_id, ''));
  clean_format text := lower(btrim(coalesce(p_format, '')));
  new_row public.document_files;
begin
  if not public.has_permission('documents.upload') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.documents
    where documents.id = p_document_id and public.is_branch_member(documents.branch_id)
  ) then
    raise exception 'document_missing' using errcode = 'P0001';
  end if;

  if clean_public_id = '' or char_length(clean_public_id) > 180 or clean_public_id ~ '[^a-zA-Z0-9/_-]' then
    raise exception 'invalid_public_id' using errcode = '22023';
  end if;

  if clean_format not in ('jpg', 'jpeg', 'png', 'webp', 'pdf') then
    raise exception 'invalid_file_format' using errcode = '22023';
  end if;

  if p_bytes is null or p_bytes < 1 or p_bytes > 10485760 then
    raise exception 'invalid_file_size' using errcode = '22023';
  end if;

  insert into public.document_files (
    document_id, public_id, resource_type, format, file_name, bytes, width, height, uploaded_by
  )
  values (
    p_document_id, clean_public_id,
    case when lower(btrim(coalesce(p_resource_type, 'image'))) = 'raw' then 'raw' else 'image' end,
    clean_format, nullif(btrim(coalesce(p_file_name, '')), ''), p_bytes, p_width, p_height, auth.uid()
  )
  returning * into new_row;

  update public.documents
  set status = 'complete'
  where id = p_document_id and status = 'pending';

  return new_row;
end;
$$;

revoke all on function public.attach_document_file(uuid, text, text, bigint, text, integer, integer, text)
  from public, anon;
grant execute on function public.attach_document_file(uuid, text, text, bigint, text, integer, integer, text)
  to authenticated, service_role;

create or replace function public.list_documents(
  p_owner_type text,
  p_owner_id uuid,
  p_doc_type text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  doc_number text,
  title text,
  doc_type text,
  owner_type text,
  customer_id uuid,
  supplier_id uuid,
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
  if not public.has_permission('documents.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select document.id, document.doc_number, document.title, document.doc_type,
         document.owner_type, document.customer_id, document.supplier_id,
         document.status, document.notes, document.created_at
  from public.documents as document
  where document.owner_type = lower(btrim(coalesce(p_owner_type, '')))
    and (p_owner_type = 'customer' and document.customer_id = p_owner_id
         or p_owner_type = 'supplier' and document.supplier_id = p_owner_id)
    and (p_doc_type is null or document.doc_type = lower(btrim(p_doc_type)))
  order by document.created_at desc, document.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_documents(text, uuid, text, integer, integer) from public, anon;
grant execute on function public.list_documents(text, uuid, text, integer, integer) to authenticated, service_role;

create or replace function public.record_document_access(
  p_document_id uuid,
  p_file_id uuid default null,
  p_action text default 'view'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_action text := lower(btrim(coalesce(p_action, '')));
begin
  if not public.has_permission('documents.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if clean_action not in ('view', 'download', 'list') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.documents
    where documents.id = p_document_id and public.is_branch_member(documents.branch_id)
  ) then
    raise exception 'document_missing' using errcode = 'P0001';
  end if;

  if p_file_id is not null and not exists (
    select 1 from public.document_files where document_files.id = p_file_id and document_files.document_id = p_document_id
  ) then
    raise exception 'document_file_missing' using errcode = 'P0001';
  end if;

  insert into public.document_access_logs (document_id, file_id, action, accessed_by)
  values (p_document_id, p_file_id, clean_action, auth.uid());
end;
$$;

revoke all on function public.record_document_access(uuid, uuid, text) from public, anon;
grant execute on function public.record_document_access(uuid, uuid, text) to authenticated, service_role;

create or replace function public.list_document_access_logs(
  p_document_id uuid,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  file_id uuid,
  action text,
  accessed_at timestamptz,
  accessed_by uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('documents.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.documents
    where documents.id = p_document_id and public.is_branch_member(documents.branch_id)
  ) then
    raise exception 'document_missing' using errcode = 'P0001';
  end if;

  return query
  select access_log.id, access_log.file_id, access_log.action,
         access_log.accessed_at, access_log.accessed_by
  from public.document_access_logs as access_log
  where access_log.document_id = p_document_id
  order by access_log.accessed_at desc, access_log.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_document_access_logs(uuid, integer, integer) from public, anon;
grant execute on function public.list_document_access_logs(uuid, integer, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Audit integration.
-- ---------------------------------------------------------------------------

drop trigger if exists audit_documents_change on public.documents;
create trigger audit_documents_change
after insert or update or delete on public.documents
for each row execute function public.audit_row_change();

drop trigger if exists audit_document_files_change on public.document_files;
create trigger audit_document_files_change
after insert or update or delete on public.document_files
for each row execute function public.audit_row_change();
