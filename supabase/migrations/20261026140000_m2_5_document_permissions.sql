-- M2.5 — Document permissions and stage-2 close-out.
--
-- BR-26: sensitive-document access is a permission of its own
-- (`documents.download_sensitive`), separate from the general documents view
-- and from financial editing. Deletion is restricted to `documents.delete`
-- (owner/manager) and logged as an audit row via the existing trigger. The
-- `is_sensitive` flag is prepared now and enforced at delivery time by the
-- `document-url` Edge Function.

-- ---------------------------------------------------------------------------
-- 1. Sensitivity flag.
-- ---------------------------------------------------------------------------

alter table public.documents
  add column if not exists is_sensitive boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. RPCs (security definer; branch-scoped writes).
-- ---------------------------------------------------------------------------

create or replace function public.set_document_sensitivity(
  p_document_id uuid,
  p_is_sensitive boolean
)
returns public.documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_row public.documents;
begin
  if not public.has_permission('documents.download_sensitive') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.documents
  set is_sensitive = coalesce(p_is_sensitive, false)
  where documents.id = p_document_id
    and public.is_branch_member(branch_id)
  returning * into new_row;

  if new_row is null then
    raise exception 'document_missing' using errcode = 'P0001';
  end if;

  return new_row;
end;
$$;

revoke all on function public.set_document_sensitivity(uuid, boolean) from public, anon;
grant execute on function public.set_document_sensitivity(uuid, boolean) to authenticated, service_role;

create or replace function public.delete_document(p_document_id uuid)
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
    select 1 from public.documents
    where documents.id = p_document_id and public.is_branch_member(branch_id)
  ) then
    raise exception 'document_missing' using errcode = 'P0001';
  end if;

  delete from public.documents where documents.id = p_document_id;
end;
$$;

revoke all on function public.delete_document(uuid) from public, anon;
grant execute on function public.delete_document(uuid) to authenticated, service_role;

comment on column public.documents.is_sensitive is
  'BR-26: sensitive documents require documents.download_sensitive at delivery time (enforced in the document-url Edge Function).';
