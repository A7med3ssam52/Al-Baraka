-- M1.3 — User management, invitations, and access assignment
-- Builds on M1.2. Adds the server-side operations used by the users screen:
--   * list_users          — permission-aware directory with auth metadata.
--   * assign_user_access  — replace roles/branches atomically (authenticated).
--   * admin_assign_user_access — same operation for the invite Edge Function.
--   * update_user_profile — edit display name and phone.
--   * set_user_active     — activate/deactivate and revoke live sessions.
--
-- Design:
--   * `user_roles` + `user_branches` remain the source of truth (D-18).
--   * `profiles.role` and `profiles.branch_id` are kept in sync for the
--     current frontend until the compatibility fields are retired.
--   * Every write is audited in `audit_logs`.
--   * A manager can only manage users and branches they can already see.
--   * Only an owner can grant the owner role or modify an owner account.
--   * Nobody can change their own role, and the last active owner cannot be
--     demoted or deactivated.
--   * Deactivation also bans the auth user and deletes auth sessions so the
--     account cannot refresh its token. RLS additionally checks is_active.

-- ---------------------------------------------------------------------------
-- Directory: returns only users visible to the caller. Managers see users who
-- share a branch where they hold users.view; owners see everyone.
-- ---------------------------------------------------------------------------

create or replace function public.list_users(search_text text default null)
returns table (
  user_id uuid,
  email text,
  full_name text,
  phone text,
  is_active boolean,
  email_confirmed boolean,
  invited_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  primary_role text,
  default_branch_id uuid,
  roles jsonb,
  branches jsonb
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  with visible_users as (
    select profile.id
    from public.profiles as profile
    where public.is_active_user()
      and (
        public.is_owner()
        or profile.id = auth.uid()
        or exists (
          select 1
          from public.user_branches as membership
          where membership.user_id = profile.id
            and public.has_permission('users.view', membership.branch_id)
        )
      )
  )
  select
    profile.id as user_id,
    auth_user.email::text as email,
    profile.full_name,
    profile.phone,
    profile.is_active,
    auth_user.email_confirmed_at is not null as email_confirmed,
    auth_user.invited_at,
    auth_user.last_sign_in_at,
    profile.created_at,
    profile.role as primary_role,
    profile.branch_id as default_branch_id,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'code', role.code,
            'name', role.name_ar,
            'branch_id', assignment.branch_id
          )
          order by role.code, assignment.branch_id
        )
        from public.user_roles as assignment
        join public.roles as role on role.id = assignment.role_id
        where assignment.user_id = profile.id
          and (
            public.is_owner()
            or profile.id = auth.uid()
            or public.has_permission('users.view', assignment.branch_id)
          )
      ),
      '[]'::jsonb
    ) as roles,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', branch.id,
            'code', branch.code,
            'name', branch.name,
            'is_default', membership.is_default
          )
          order by membership.is_default desc, branch.code
        )
        from public.user_branches as membership
        join public.branches as branch on branch.id = membership.branch_id
        where membership.user_id = profile.id
          and (
            public.is_owner()
            or profile.id = auth.uid()
            or public.has_permission('users.view', membership.branch_id)
          )
      ),
      '[]'::jsonb
    ) as branches
  from visible_users as visible
  join public.profiles as profile on profile.id = visible.id
  join auth.users as auth_user on auth_user.id = profile.id
  where nullif(btrim(coalesce(search_text, '')), '') is null
     or profile.full_name ilike '%' || btrim(search_text) || '%'
     or auth_user.email ilike '%' || btrim(search_text) || '%'
     or profile.phone ilike '%' || btrim(search_text) || '%'
  order by profile.is_active desc, profile.created_at desc, profile.id;
$$;

comment on function public.list_users(text) is
  'Permission-aware user directory. Managers only see users in their branches.';

-- ---------------------------------------------------------------------------
-- Self access: one round trip for the authenticated shell. Returns the current
-- profile, permission codes for the default branch, role assignments, and
-- branch memberships. Only ever exposes auth.uid()'s own data.
-- ---------------------------------------------------------------------------

create or replace function public.my_access()
returns jsonb
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'full_name', (
      select profile.full_name from public.profiles as profile where profile.id = auth.uid()
    ),
    'phone', (
      select profile.phone from public.profiles as profile where profile.id = auth.uid()
    ),
    'email', (
      select auth_user.email::text from auth.users as auth_user where auth_user.id = auth.uid()
    ),
    'primary_role', (
      select profile.role from public.profiles as profile where profile.id = auth.uid()
    ),
    'default_branch_id', (
      select profile.branch_id from public.profiles as profile where profile.id = auth.uid()
    ),
    'is_active', public.is_active_user(),
    'is_owner', public.is_owner(),
    'permissions', coalesce(
      (
        select jsonb_agg(permission.code order by permission.code)
        from public.my_permissions() as permission(code)
      ),
      '[]'::jsonb
    ),
    'roles', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'code', role.code,
            'name', role.name_ar,
            'branch_id', assignment.branch_id,
            'is_primary', assignment.is_primary
          )
          order by role.code, assignment.branch_id
        )
        from public.user_roles as assignment
        join public.roles as role on role.id = assignment.role_id
        where assignment.user_id = auth.uid()
      ),
      '[]'::jsonb
    ),
    'branches', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', branch.id,
            'code', branch.code,
            'name', branch.name,
            'is_default', membership.is_default
          )
          order by membership.is_default desc, branch.code
        )
        from public.user_branches as membership
        join public.branches as branch on branch.id = membership.branch_id
        where membership.user_id = auth.uid()
      ),
      '[]'::jsonb
    )
  );
$$;

comment on function public.my_access() is
  'Returns the signed-in user''s profile, permissions, roles, and branches.';

-- ---------------------------------------------------------------------------
-- Internal assignment. Wrappers below enforce caller identity and branch scope.
-- ---------------------------------------------------------------------------

create or replace function public._assign_user_access(
  target_user_id uuid,
  target_roles text[],
  target_branch_ids uuid[],
  target_default_branch_id uuid,
  target_primary_role text,
  actor_id uuid,
  actor_is_owner boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_roles text[];
  normalized_branches uuid[];
  target_profile_active boolean;
  target_is_owner boolean;
  active_owner_count integer;
  old_roles jsonb;
  old_branches jsonb;
begin
  if target_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  select profile.is_active
  into target_profile_active
  from public.profiles as profile
  where profile.id = target_user_id
  for update;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct btrim(requested_role) order by btrim(requested_role)), '{}'::text[])
  into normalized_roles
  from unnest(coalesce(target_roles, '{}'::text[])) as requested_role
  where requested_role is not null
    and btrim(requested_role) <> '';

  select coalesce(array_agg(distinct requested_branch order by requested_branch), '{}'::uuid[])
  into normalized_branches
  from unnest(coalesce(target_branch_ids, '{}'::uuid[])) as requested_branch
  where requested_branch is not null;

  if cardinality(normalized_roles) = 0 then
    raise exception 'roles_required' using errcode = '22023';
  end if;

  if cardinality(normalized_branches) = 0 then
    raise exception 'branches_required' using errcode = '22023';
  end if;

  if target_default_branch_id is null
     or not (target_default_branch_id = any(normalized_branches)) then
    raise exception 'invalid_default_branch' using errcode = '22023';
  end if;

  if target_primary_role is null
     or btrim(target_primary_role) = ''
     or not (btrim(target_primary_role) = any(normalized_roles)) then
    raise exception 'invalid_primary_role' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(normalized_roles) as requested(role_code)
    where not exists (
      select 1
      from public.roles as role
      where role.code = requested.role_code
        and role.is_active
    )
  ) then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(normalized_branches) as requested(branch_id)
    where not exists (
      select 1
      from public.branches as branch
      where branch.id = requested.branch_id
        and branch.is_active
    )
  ) then
    raise exception 'invalid_branch' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.user_roles as assignment
    join public.roles as role on role.id = assignment.role_id
    where assignment.user_id = target_user_id
      and role.code = 'owner'
  )
  into target_is_owner;

  if (target_is_owner or 'owner' = any(normalized_roles)) and not actor_is_owner then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  if target_is_owner
     and target_profile_active
     and not ('owner' = any(normalized_roles)) then
    select count(distinct assignment.user_id)
    into active_owner_count
    from public.user_roles as assignment
    join public.roles as role on role.id = assignment.role_id
    join public.profiles as profile on profile.id = assignment.user_id
    where role.code = 'owner'
      and profile.is_active;

    if active_owner_count <= 1 then
      raise exception 'last_owner' using errcode = '23514';
    end if;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('role', role.code, 'branch_id', assignment.branch_id)
      order by role.code, assignment.branch_id
    ),
    '[]'::jsonb
  )
  into old_roles
  from public.user_roles as assignment
  join public.roles as role on role.id = assignment.role_id
  where assignment.user_id = target_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('branch_id', membership.branch_id, 'is_default', membership.is_default)
      order by membership.branch_id
    ),
    '[]'::jsonb
  )
  into old_branches
  from public.user_branches as membership
  where membership.user_id = target_user_id;

  update public.profiles
  set role = btrim(target_primary_role),
      branch_id = target_default_branch_id,
      updated_by = actor_id
  where id = target_user_id;

  delete from public.user_roles where user_id = target_user_id;
  delete from public.user_branches where user_id = target_user_id;

  insert into public.user_roles (user_id, role_id, branch_id, is_primary, created_by, updated_by)
  select
    target_user_id,
    role.id,
    requested_branch.branch_id,
    role.code = btrim(target_primary_role)
      and requested_branch.branch_id = target_default_branch_id,
    actor_id,
    actor_id
  from public.roles as role
  cross join unnest(normalized_branches) as requested_branch(branch_id)
  where role.code = any(normalized_roles);

  insert into public.user_branches (user_id, branch_id, is_default, created_by, updated_by)
  select
    target_user_id,
    requested_branch.branch_id,
    requested_branch.branch_id = target_default_branch_id,
    actor_id,
    actor_id
  from unnest(normalized_branches) as requested_branch(branch_id);

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
    target_default_branch_id,
    'user.access_assigned',
    'user_roles',
    target_user_id::text,
    jsonb_build_object('roles', old_roles, 'branches', old_branches),
    jsonb_build_object(
      'roles', normalized_roles,
      'branch_ids', normalized_branches,
      'primary_role', btrim(target_primary_role),
      'default_branch_id', target_default_branch_id
    ),
    actor_id
  );

  return jsonb_build_object(
    'user_id', target_user_id,
    'roles', normalized_roles,
    'branch_ids', normalized_branches,
    'primary_role', btrim(target_primary_role),
    'default_branch_id', target_default_branch_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Authenticated wrapper: actor is the signed-in user.
-- ---------------------------------------------------------------------------

create or replace function public.assign_user_access(
  target_user_id uuid,
  target_roles text[],
  target_branch_ids uuid[],
  target_default_branch_id uuid,
  target_primary_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not public.is_active_user() then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if target_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  if target_user_id = actor then
    raise exception 'cannot_modify_self' using errcode = '42501';
  end if;

  if not public.has_permission('users.assign_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not public.can_view_profile(target_user_id) then
    raise exception 'user_out_of_scope' using errcode = '42501';
  end if;

  if not public.is_owner() then
    if exists (
      select 1
      from public.user_branches as membership
      where membership.user_id = target_user_id
        and not public.has_permission('users.assign_role', membership.branch_id)
    ) then
      raise exception 'user_out_of_scope' using errcode = '42501';
    end if;

    if exists (
      select 1
      from unnest(coalesce(target_branch_ids, '{}'::uuid[])) as requested(branch_id)
      where not public.has_permission('users.assign_role', requested.branch_id)
    ) then
      raise exception 'branch_out_of_scope' using errcode = '42501';
    end if;
  end if;

  return public._assign_user_access(
    target_user_id,
    target_roles,
    target_branch_ids,
    target_default_branch_id,
    target_primary_role,
    actor,
    public.is_owner()
  );
end;
$$;

comment on function public.assign_user_access(uuid, text[], uuid[], uuid, text) is
  'Replaces a user''s roles and branches. Caller must hold users.assign_role.';

-- ---------------------------------------------------------------------------
-- Service-role wrapper used by the invite Edge Function after it verifies the
-- caller. actor_id is the manager who performed the invite (for audit only).
-- ---------------------------------------------------------------------------

create or replace function public.admin_assign_user_access(
  target_user_id uuid,
  target_roles text[],
  target_branch_ids uuid[],
  target_default_branch_id uuid,
  target_primary_role text,
  actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_role text;
begin
  caller_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb ->> 'role';

  if caller_role is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if actor_id is not null
     and not exists (select 1 from public.profiles as profile where profile.id = actor_id) then
    actor_id := null;
  end if;

  return public._assign_user_access(
    target_user_id,
    target_roles,
    target_branch_ids,
    target_default_branch_id,
    target_primary_role,
    actor_id,
    true
  );
end;
$$;

comment on function public.admin_assign_user_access(uuid, text[], uuid[], uuid, text, uuid) is
  'Service-role-only access assignment used by invite-user.';

-- ---------------------------------------------------------------------------
-- Profile fields (display name and phone).
-- ---------------------------------------------------------------------------

create or replace function public.update_user_profile(
  target_user_id uuid,
  target_full_name text,
  target_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  target_is_owner boolean;
  previous_full_name text;
  previous_phone text;
begin
  if actor is null or not public.is_active_user() then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if target_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  if not public.has_permission('users.update') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not public.can_view_profile(target_user_id) then
    raise exception 'user_out_of_scope' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.user_roles as assignment
    join public.roles as role on role.id = assignment.role_id
    where assignment.user_id = target_user_id
      and role.code = 'owner'
  )
  into target_is_owner;

  if target_is_owner and not public.is_owner() then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(target_full_name, '')), '') is null then
    raise exception 'full_name_required' using errcode = '22023';
  end if;

  select profile.full_name, profile.phone
  into previous_full_name, previous_phone
  from public.profiles as profile
  where profile.id = target_user_id
  for update;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  update public.profiles
  set full_name = btrim(target_full_name),
      phone = nullif(btrim(coalesce(target_phone, '')), ''),
      updated_by = actor
  where id = target_user_id;

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
  select
    actor,
    profile.branch_id,
    'user.profile_updated',
    'profiles',
    target_user_id::text,
    jsonb_build_object('full_name', previous_full_name, 'phone', previous_phone),
    jsonb_build_object(
      'full_name', btrim(target_full_name),
      'phone', nullif(btrim(coalesce(target_phone, '')), '')
    ),
    actor
  from public.profiles as profile
  where profile.id = target_user_id;

  return jsonb_build_object(
    'user_id', target_user_id,
    'full_name', btrim(target_full_name),
    'phone', nullif(btrim(coalesce(target_phone, '')), '')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Activation. Disabling bans the auth user and deletes live sessions; RLS
-- already rejects an inactive profile on every request.
-- ---------------------------------------------------------------------------

create or replace function public.set_user_active(
  target_user_id uuid,
  target_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  target_profile_active boolean;
  target_is_owner boolean;
  active_owner_count integer;
begin
  if actor is null or not public.is_active_user() then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if target_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  if target_user_id = actor then
    raise exception 'cannot_modify_self' using errcode = '42501';
  end if;

  if target_active is null then
    raise exception 'active_state_required' using errcode = '22023';
  end if;

  if not public.has_permission('users.deactivate') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not public.can_view_profile(target_user_id) then
    raise exception 'user_out_of_scope' using errcode = '42501';
  end if;

  select profile.is_active
  into target_profile_active
  from public.profiles as profile
  where profile.id = target_user_id
  for update;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  select exists (
    select 1
    from public.user_roles as assignment
    join public.roles as role on role.id = assignment.role_id
    where assignment.user_id = target_user_id
      and role.code = 'owner'
  )
  into target_is_owner;

  if target_is_owner and not public.is_owner() then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  if target_is_owner and target_profile_active and not target_active then
    select count(distinct assignment.user_id)
    into active_owner_count
    from public.user_roles as assignment
    join public.roles as role on role.id = assignment.role_id
    join public.profiles as profile on profile.id = assignment.user_id
    where role.code = 'owner'
      and profile.is_active;

    if active_owner_count <= 1 then
      raise exception 'last_owner' using errcode = '23514';
    end if;
  end if;

  update public.profiles
  set is_active = target_active,
      updated_by = actor
  where id = target_user_id;

  update auth.users
  set banned_until = case
        when target_active then null
        else '9999-12-31 23:59:59+00'::timestamptz
      end,
      updated_at = now()
  where id = target_user_id;

  if not target_active then
    delete from auth.sessions where user_id = target_user_id;
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
  select
    actor,
    profile.branch_id,
    case when target_active then 'user.activated' else 'user.deactivated' end,
    'profiles',
    target_user_id::text,
    jsonb_build_object('is_active', target_profile_active),
    jsonb_build_object('is_active', target_active),
    actor
  from public.profiles as profile
  where profile.id = target_user_id;

  return jsonb_build_object(
    'user_id', target_user_id,
    'is_active', target_active
  );
end;
$$;

comment on function public.set_user_active(uuid, boolean) is
  'Activates or deactivates a user, bans/unbans the auth account, and revokes sessions.';

-- ---------------------------------------------------------------------------
-- Grants. The internal function is only callable by the wrappers (function
-- owner privileges), never directly by clients.
-- ---------------------------------------------------------------------------

revoke all on function public.list_users(text) from public, anon;
revoke all on function public.my_access() from public, anon;
revoke all on function public.assign_user_access(uuid, text[], uuid[], uuid, text) from public, anon;
revoke all on function public.admin_assign_user_access(uuid, text[], uuid[], uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.update_user_profile(uuid, text, text) from public, anon;
revoke all on function public.set_user_active(uuid, boolean) from public, anon;
revoke all on function public._assign_user_access(uuid, text[], uuid[], uuid, text, uuid, boolean) from public, anon, authenticated, service_role;

grant execute on function public.list_users(text) to authenticated, service_role;
grant execute on function public.my_access() to authenticated, service_role;
grant execute on function public.assign_user_access(uuid, text[], uuid[], uuid, text) to authenticated;
grant execute on function public.admin_assign_user_access(uuid, text[], uuid[], uuid, text, uuid) to service_role;
grant execute on function public.update_user_profile(uuid, text, text) to authenticated;
grant execute on function public.set_user_active(uuid, boolean) to authenticated;
