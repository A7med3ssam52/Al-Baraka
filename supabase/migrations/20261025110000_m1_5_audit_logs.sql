-- M1.5 — Audit log, UI guards support, and RLS review
--
-- Sensitive changes are captured by triggers on the reference/security tables
-- that exist at this stage. Future modules attach the same trigger function to
-- their own tables as they are created.
--
-- The audit log is append-only for clients: they can read it with
-- `audit_logs.view`, but cannot insert, update, or delete rows. Tokens and
-- secrets are stripped before a payload is written.

-- ---------------------------------------------------------------------------
-- 1. Indexes for the audit screen.
-- ---------------------------------------------------------------------------

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

create index if not exists audit_logs_branch_created_idx
  on public.audit_logs (branch_id, created_at desc);

create index if not exists audit_logs_user_created_idx
  on public.audit_logs (user_id, created_at desc);

create index if not exists audit_logs_action_created_idx
  on public.audit_logs (action, created_at desc);

create index if not exists audit_logs_table_created_idx
  on public.audit_logs (table_name, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Redaction and trigger.
-- ---------------------------------------------------------------------------

create or replace function public.audit_redact(payload jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when payload is null then null
    else payload - array[
      'token',
      'token_hash',
      'password',
      'password_hash',
      'secret',
      'api_key',
      'api_secret',
      'service_role_key',
      'access_token',
      'refresh_token',
      'authorization'
    ]
  end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_payload jsonb;
  new_payload jsonb;
  row_payload jsonb;
  record_id text;
  row_branch_id uuid;
  actor_id uuid;
begin
  if tg_op <> 'INSERT' then
    old_payload := to_jsonb(old);
  end if;

  if tg_op <> 'DELETE' then
    new_payload := to_jsonb(new);
  end if;

  row_payload := coalesce(new_payload, old_payload);
  record_id := nullif(row_payload ->> 'id', '');

  if tg_table_name = 'branches' then
    row_branch_id := nullif(row_payload ->> 'id', '')::uuid;
  elsif tg_table_name = 'staff_invitations' then
    row_branch_id := nullif(row_payload ->> 'default_branch_id', '')::uuid;
  else
    row_branch_id := nullif(row_payload ->> 'branch_id', '')::uuid;
  end if;

  -- Deleting a branch cascades to its cashboxes, bank accounts, and sequences.
  -- Their audit rows must survive the parent deletion, so a missing branch is
  -- recorded as a global row instead of violating the foreign key.
  if row_branch_id is not null and not exists (
    select 1 from public.branches where id = row_branch_id
  ) then
    row_branch_id := null;
  end if;

  actor_id := auth.uid();
  if actor_id is not null and not exists (
    select 1 from public.profiles where id = actor_id
  ) then
    actor_id := null;
  end if;

  insert into public.audit_logs (
    user_id,
    branch_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    created_by
  )
  values (
    actor_id,
    row_branch_id,
    lower(tg_op),
    tg_table_name,
    record_id,
    public.audit_redact(old_payload),
    public.audit_redact(new_payload),
    actor_id
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'branches',
    'system_settings',
    'profiles',
    'user_roles',
    'user_branches',
    'staff_invitations',
    'staff_signup_claims',
    'roles',
    'role_permissions',
    'accounts',
    'cashboxes',
    'bank_accounts'
  ] loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'audit_' || table_name || '_change',
      table_name
    );
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      || 'for each row execute function public.audit_row_change()',
      'audit_' || table_name || '_change',
      table_name
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Visibility helper and audit-log RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.can_view_audit_log(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_active_user()
    and (
      public.is_owner()
      or (
        target_branch_id is null
        and public.has_permission('audit_logs.view')
      )
      or (
        target_branch_id is not null
        and public.has_permission('audit_logs.view', target_branch_id)
      )
    );
$$;

drop policy if exists audit_logs_select_authorized on public.audit_logs;
create policy audit_logs_select_authorized
on public.audit_logs
for select
to authenticated
using (public.can_view_audit_log(branch_id));

create or replace function public.list_audit_logs(
  p_search text default null,
  p_action text default null,
  p_table text default null,
  p_user_id uuid default null,
  p_branch_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  user_name text,
  branch_id uuid,
  branch_name text,
  action text,
  table_name text,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  search_text text := nullif(btrim(coalesce(p_search, '')), '');
  page_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  page_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.has_permission('audit_logs.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with visible as (
    select log.*
    from public.audit_logs as log
    where public.can_view_audit_log(log.branch_id)
      and (p_action is null or log.action = p_action)
      and (p_table is null or log.table_name = p_table)
      and (p_user_id is null or log.user_id = p_user_id)
      and (p_branch_id is null or log.branch_id = p_branch_id)
      and (p_from is null or log.created_at >= p_from)
      and (p_to is null or log.created_at <= p_to)
      and (
        search_text is null
        or log.record_id ilike '%' || search_text || '%'
        or log.action ilike '%' || search_text || '%'
        or log.table_name ilike '%' || search_text || '%'
        or coalesce(log.new_data::text, '') ilike '%' || search_text || '%'
        or coalesce(log.old_data::text, '') ilike '%' || search_text || '%'
        or exists (
          select 1
          from public.profiles as profile
          where profile.id = log.user_id
            and (
              coalesce(profile.full_name, '') ilike '%' || search_text || '%'
              or coalesce(profile.phone, '') ilike '%' || search_text || '%'
            )
        )
      )
  ),
  counted as (
    select visible.*, count(*) over() as total_count
    from visible
  )
  select
    counted.id,
    counted.user_id,
    coalesce(profile.full_name, auth_user.email::text, 'مستخدم محذوف'),
    counted.branch_id,
    branch.name,
    counted.action,
    counted.table_name,
    counted.record_id,
    counted.old_data,
    counted.new_data,
    counted.created_at,
    counted.total_count
  from counted
  left join public.profiles as profile on profile.id = counted.user_id
  left join auth.users as auth_user on auth_user.id = counted.user_id
  left join public.branches as branch on branch.id = counted.branch_id
  order by counted.created_at desc, counted.id desc
  limit page_limit
  offset page_offset;
end;
$$;

create or replace function public.audit_log_filter_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.has_permission('audit_logs.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with visible as (
    select log.*
    from public.audit_logs as log
    where public.can_view_audit_log(log.branch_id)
  ),
  users as (
    select distinct
      visible.user_id,
      coalesce(profile.full_name, auth_user.email::text, 'مستخدم محذوف') as display_name
    from visible
    left join public.profiles as profile on profile.id = visible.user_id
    left join auth.users as auth_user on auth_user.id = visible.user_id
    where visible.user_id is not null
    order by display_name
    limit 100
  ),
  actions as (
    select distinct visible.action
    from visible
    where visible.action is not null
    order by visible.action
  ),
  tables as (
    select distinct visible.table_name
    from visible
    where visible.table_name is not null
    order by visible.table_name
  ),
  branches as (
    select distinct visible.branch_id, branch.name
    from visible
    join public.branches as branch on branch.id = visible.branch_id
    where visible.branch_id is not null
    order by branch.name
  )
  select jsonb_build_object(
    'users', coalesce(
      (select jsonb_agg(
        jsonb_build_object('id', users.user_id, 'name', users.display_name)
        order by users.display_name
      ) from users),
      '[]'::jsonb
    ),
    'actions', coalesce(
      (select jsonb_agg(actions.action order by actions.action) from actions),
      '[]'::jsonb
    ),
    'tables', coalesce(
      (select jsonb_agg(tables.table_name order by tables.table_name) from tables),
      '[]'::jsonb
    ),
    'branches', coalesce(
      (select jsonb_agg(
        jsonb_build_object('id', branches.branch_id, 'name', branches.name)
        order by branches.name
      ) from branches),
      '[]'::jsonb
    )
  )
  into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants. Audit writes only happen through triggers.
-- ---------------------------------------------------------------------------

revoke all on function public.audit_redact(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.audit_row_change() from public, anon, authenticated, service_role;

revoke all on function public.can_view_audit_log(uuid) from public, anon;
grant execute on function public.can_view_audit_log(uuid) to authenticated, service_role;

revoke all on function public.list_audit_logs(
  text, text, text, uuid, uuid, timestamptz, timestamptz, integer, integer
) from public, anon;
grant execute on function public.list_audit_logs(
  text, text, text, uuid, uuid, timestamptz, timestamptz, integer, integer
) to authenticated, service_role;

revoke all on function public.audit_log_filter_options() from public, anon;
grant execute on function public.audit_log_filter_options() to authenticated, service_role;

comment on function public.audit_row_change() is
  'Writes redacted insert/update/delete audit rows for sensitive tables.';
comment on function public.list_audit_logs(
  text, text, text, uuid, uuid, timestamptz, timestamptz, integer, integer
) is
  'Paginated audit log query with branch-aware visibility.';
