-- M1.3 — Authentication hardening (D-26)
--
-- This migration closes every automatic path that could turn a public signup
-- into a usable staff account:
--
--   1. New auth users are only accepted when the Auth Admin API marks them as
--      staff (`app_metadata.account_type = 'staff'`). Public email signups are
--      rejected at the auth.users boundary even if signup is re-enabled by
--      mistake.
--   2. `handle_new_user` is fail-closed. It creates a bare profile for staff
--      users only. It never grants a role, a branch membership, or owner
--      access. Access is assigned explicitly by a manager through M1.3 RPCs.
--   3. `system_settings` is no longer readable by every authenticated account;
--      it requires `settings.view`.
--   4. `my_access()` now reports whether the signed-in account has an active
--      staff profile and at least one role, so the frontend can reject orphan
--      Auth accounts.
--
-- The local `supabase/config.toml` and the hosted project must also keep
-- public signup disabled. Those are configuration controls, not SQL.

-- ---------------------------------------------------------------------------
-- 1. Reject auth users that were not created by the staff invitation flow.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_staff_signup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'account_type', '') <> 'staff' then
    raise exception 'public_signup_disabled' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_staff_signup() is
  'Rejects auth.users inserts that are not explicitly marked as staff by the invitation flow.';

drop trigger if exists enforce_staff_signup on auth.users;
create trigger enforce_staff_signup
before insert on auth.users
for each row execute function public.enforce_staff_signup();

-- ---------------------------------------------------------------------------
-- 2. Fail-closed profile provisioning. No roles, no branches, no owner.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'account_type', '') <> 'staff' then
    return new;
  end if;

  insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'موظف'
    ),
    nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g'), ''),
    'viewer',
    null,
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates a bare profile for staff auth users only. Never grants roles or branches.';

-- ---------------------------------------------------------------------------
-- 3. Settings are only readable with settings.view.
-- ---------------------------------------------------------------------------

drop policy if exists system_settings_select_authenticated on public.system_settings;
drop policy if exists system_settings_select_settings_view on public.system_settings;

create policy system_settings_select_settings_view
on public.system_settings
for select
to authenticated
using (public.has_permission('settings.view'));

comment on policy system_settings_select_settings_view on public.system_settings is
  'Settings require settings.view; M1.2 previously exposed them to every authenticated user.';

-- ---------------------------------------------------------------------------
-- 4. Self-access payload used by the frontend guard.
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
    'has_profile', exists (
      select 1 from public.profiles as profile where profile.id = auth.uid()
    ),
    'has_role', exists (
      select 1
      from public.user_roles as assignment
      join public.roles as role on role.id = assignment.role_id and role.is_active
      where assignment.user_id = auth.uid()
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
  'Returns the signed-in user''s profile, staff state, permissions, roles, and branches.';

-- ---------------------------------------------------------------------------
-- Grants: trigger helpers are never callable by clients.
-- ---------------------------------------------------------------------------

revoke all on function public.enforce_staff_signup() from public, anon, authenticated, service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated, service_role;
