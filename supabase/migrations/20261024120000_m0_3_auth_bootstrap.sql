-- M0.3 — Supabase Auth bootstrap
-- Minimal, intentional subset of the future M1.1 schema: branches, profiles, settings.
-- M1.1 will expand this schema (roles, permissions, user_branches, system_settings...).

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'viewer'
    check (role in ('owner', 'manager', 'accountant', 'sales', 'collection', 'inventory', 'viewer')),
  branch_id uuid references public.branches (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  app_name text not null default 'معرض البركة',
  branch_code text not null default 'SNH-01',
  currency text not null default 'EGP',
  timezone text not null default 'Africa/Cairo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists branches_set_updated_at on public.branches;
create trigger branches_set_updated_at
before update on public.branches
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_branch_id uuid;
begin
  select id into default_branch_id
  from public.branches
  where code = 'SNH-01'
  limit 1;

  insert into public.profiles (id, full_name, role, branch_id)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    'viewer',
    default_branch_id
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill profiles for users created before this migration.
insert into public.profiles (id, full_name, role, branch_id)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1)),
  'viewer',
  b.id
from auth.users u
left join public.branches b on b.code = 'SNH-01'
on conflict (id) do nothing;

alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists branches_select_authenticated on public.branches;
create policy branches_select_authenticated
on public.branches
for select
to authenticated
using (is_active);

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists app_settings_select_authenticated on public.app_settings;
create policy app_settings_select_authenticated
on public.app_settings
for select
to authenticated
using (true);

revoke all on public.branches, public.profiles, public.app_settings from anon;
grant usage on schema public to authenticated;
grant select on public.branches, public.profiles, public.app_settings to authenticated;

insert into public.branches (code, name, address, is_active)
values (
  'SNH-01',
  'فرع صان الحجر',
  'محافظة الشرقية — مركز صان الحجر — بجوار مركز الشرطة',
  true
)
on conflict (code) do update
set name = excluded.name,
    address = excluded.address,
    is_active = excluded.is_active;

-- M0.3 launch branch: attach any profile created before the branch seed.
update public.profiles
set branch_id = b.id
from public.branches b
where b.code = 'SNH-01'
  and public.profiles.branch_id is null;

insert into public.app_settings (id, app_name, branch_code, currency, timezone)
values (true, 'معرض البركة', 'SNH-01', 'EGP', 'Africa/Cairo')
on conflict (id) do update
set app_name = excluded.app_name,
    branch_code = excluded.branch_code,
    currency = excluded.currency,
    timezone = excluded.timezone;
