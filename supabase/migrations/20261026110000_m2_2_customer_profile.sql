-- M2.2 — Customer profile: notes, follow-ups, and responsible staff.
--
-- Notes are an append-only timeline: there is no UPDATE or DELETE path from
-- clients. The assigned staff member is stored on the customer row itself.

-- ---------------------------------------------------------------------------
-- 1. Assigned staff.
-- ---------------------------------------------------------------------------

alter table public.customers
  add column if not exists assigned_to uuid references public.profiles (id);

-- ---------------------------------------------------------------------------
-- 2. Customer notes (append-only timeline).
-- ---------------------------------------------------------------------------

create table if not exists public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id),
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  next_followup_at timestamptz,
  note_type text not null default 'note'
    check (note_type in ('note', 'call', 'visit', 'promise')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create index if not exists customer_notes_customer_created_idx
  on public.customer_notes (customer_id, created_at desc);

alter table public.customer_notes enable row level security;

drop policy if exists customer_notes_select_authorized on public.customer_notes;
create policy customer_notes_select_authorized
on public.customer_notes
for select
to authenticated
using (
  public.has_permission('customers.view')
  and exists (
    select 1 from public.customers as customer where customer.id = customer_id
  )
);

create or replace function public.add_customer_note(
  p_customer_id uuid,
  p_note text,
  p_note_type text default 'note',
  p_next_followup_at timestamptz default null
)
returns table (
  id uuid,
  customer_id uuid,
  note text,
  note_type text,
  next_followup_at timestamptz,
  created_at timestamptz,
  created_by uuid,
  created_by_name text
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
#variable_conflict use_column
begin
  if public.current_branch() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not public.has_permission('customers.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_note is null or char_length(btrim(p_note)) < 1 or char_length(btrim(p_note)) > 2000 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  if lower(btrim(coalesce(p_note_type, ''))) not in ('note', 'call', 'visit', 'promise') then
    raise exception 'invalid_note_type' using errcode = '22023';
  end if;

  if not exists (select 1 from public.customers as c where c.id = p_customer_id) then
    raise exception 'customer_missing' using errcode = 'P0001';
  end if;

  return query
  with inserted as (
    insert into public.customer_notes (
      customer_id, note, note_type, next_followup_at, created_by
    )
    values (
      p_customer_id, btrim(p_note), lower(btrim(p_note_type)), p_next_followup_at,
      auth.uid()
    )
    returning id, customer_id, note, note_type, next_followup_at,
              created_at, created_by
  )
  select
    inserted.id,
    inserted.customer_id,
    inserted.note,
    inserted.note_type,
    inserted.next_followup_at,
    inserted.created_at,
    inserted.created_by,
    coalesce(profile.full_name, 'مستخدم محذوف')
  from inserted
  left join public.profiles as profile on profile.id = inserted.created_by;
end;
$$;

revoke all on function public.add_customer_note(
  uuid, text, text, timestamptz
) from public, anon;
grant execute on function public.add_customer_note(
  uuid, text, text, timestamptz
) to authenticated, service_role;

create or replace function public.list_customer_notes(
  p_customer_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  customer_id uuid,
  note text,
  note_type text,
  next_followup_at timestamptz,
  created_at timestamptz,
  created_by uuid,
  created_by_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('customers.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    notes.id,
    notes.customer_id,
    notes.note,
    notes.note_type,
    notes.next_followup_at,
    notes.created_at,
    notes.created_by,
    coalesce(profile.full_name, 'مستخدم محذوف')
  from public.customer_notes as notes
  left join public.profiles as profile on profile.id = notes.created_by
  where notes.customer_id = p_customer_id
  order by notes.created_at desc, notes.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_customer_notes(uuid, integer, integer) from public, anon;
grant execute on function public.list_customer_notes(uuid, integer, integer) to authenticated, service_role;

create or replace function public.set_customer_assignee(
  p_customer_id uuid,
  p_staff_id uuid
)
returns public.customers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_row public.customers;
begin
  if not public.has_permission('customers.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_staff_id is not null and not exists (select 1 from public.profiles where id = p_staff_id) then
    raise exception 'staff_missing' using errcode = '22023';
  end if;

  update public.customers
  set assigned_to = p_staff_id,
      updated_by = auth.uid()
  where id = p_customer_id
  returning * into new_row;

  if new_row is null then
    raise exception 'customer_missing' using errcode = 'P0001';
  end if;

  return new_row;
end;
$$;

revoke all on function public.set_customer_assignee(uuid, uuid) from public, anon;
grant execute on function public.set_customer_assignee(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Audit integration.
-- ---------------------------------------------------------------------------

drop trigger if exists audit_customer_notes_change on public.customer_notes;
create trigger audit_customer_notes_change
after insert or update or delete on public.customer_notes
for each row execute function public.audit_row_change();

comment on table public.customer_notes is
  'Append-only customer notes/follow-up timeline. No update or delete path.';
