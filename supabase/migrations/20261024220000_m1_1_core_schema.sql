-- M1.1 — Core security, branch, settings, and accounting schema
-- Builds on M0.3. Adds normalized roles/permissions, branch membership,
-- settings, document sequences, audit logs, chart of accounts, cash/bank
-- accounts, and the double-entry journal foundation.
--
-- RLS is enabled on every new table with no permissive policies yet.
-- M1.2 will add the permission matrix, helper functions, and policies.
-- Financial tables remain closed to the browser until their owning stages.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings: rename the M0.3 app_settings table without losing its row.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.app_settings') is not null
     and to_regclass('public.system_settings') is null then
    alter table public.app_settings rename to system_settings;
  end if;
end;
$$;

create table if not exists public.system_settings (
  id boolean primary key default true check (id),
  app_name text not null default 'معرض البركة',
  branch_code text not null default 'SNH-01',
  currency text not null default 'EGP',
  timezone text not null default 'Africa/Cairo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.app_settings') is not null
     and to_regclass('public.system_settings') is not null then
    insert into public.system_settings (id, app_name, branch_code, currency, timezone, created_at, updated_at)
    select id, app_name, branch_code, currency, timezone, created_at, updated_at
    from public.app_settings
    on conflict (id) do nothing;
  end if;
end;
$$;

alter table public.system_settings
  add column if not exists logo_url text,
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists tax_number text,
  add column if not exists document_prefixes jsonb not null default '{}'::jsonb,
  add column if not exists default_discount_limit numeric(14, 2) not null default 0,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

-- ---------------------------------------------------------------------------
-- Branches and profiles: standard audit fields and launch-branch protection.
-- ---------------------------------------------------------------------------

alter table public.branches
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

alter table public.profiles
  add column if not exists phone text,
  add column if not exists avatar_url text,
  add column if not exists is_active boolean not null default true,
  add column if not exists last_login_at timestamptz,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

create or replace function public.protect_launch_branch()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.code = 'SNH-01' then
    raise exception 'Launch branch SNH-01 cannot be deleted';
  end if;

  if tg_op = 'UPDATE' and old.code = 'SNH-01' and new.code <> old.code then
    raise exception 'Launch branch code SNH-01 is immutable';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists branches_protect_launch_branch on public.branches;
create trigger branches_protect_launch_branch
before update or delete on public.branches
for each row execute function public.protect_launch_branch();

-- ---------------------------------------------------------------------------
-- Roles and permissions.
-- ---------------------------------------------------------------------------

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_ar text not null,
  name_en text,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_.]*$'),
  module text not null,
  action text not null,
  name_ar text not null,
  name_en text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (module, action)
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (role_id, permission_id)
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete restrict,
  branch_id uuid not null references public.branches (id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (user_id, role_id, branch_id)
);

create unique index if not exists user_roles_one_primary_per_user
  on public.user_roles (user_id)
  where is_primary;

create table if not exists public.user_branches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (user_id, branch_id)
);

create unique index if not exists user_branches_one_default_per_user
  on public.user_branches (user_id)
  where is_default;

-- ---------------------------------------------------------------------------
-- Document numbering.
-- ---------------------------------------------------------------------------

create table if not exists public.number_sequences (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  document_type text not null,
  year integer not null check (year between 2000 and 2200),
  prefix text not null default '',
  next_number bigint not null default 1 check (next_number > 0),
  padding smallint not null default 5 check (padding between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (branch_id, document_type, year)
);

-- ---------------------------------------------------------------------------
-- Audit log. Triggers arrive in M1.5; this table is intentionally append-only
-- in practice and closed to the browser until then.
-- ---------------------------------------------------------------------------

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  branch_id uuid references public.branches (id) on delete set null,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

-- ---------------------------------------------------------------------------
-- Chart of accounts and cash/bank accounts.
-- ---------------------------------------------------------------------------

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null,
  name_en text,
  account_type text not null
    check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  normal_balance text not null check (normal_balance in ('debit', 'credit')),
  parent_id uuid references public.accounts (id) on delete restrict,
  is_group boolean not null default false,
  is_active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  check (parent_id is null or parent_id <> id)
);

create table if not exists public.cashboxes (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  code text not null,
  name_ar text not null,
  name_en text,
  account_id uuid not null references public.accounts (id) on delete restrict,
  responsible_user_id uuid references public.profiles (id) on delete set null,
  currency text not null default 'EGP',
  opening_balance numeric(14, 2) not null default 0 check (opening_balance >= 0),
  current_balance numeric(14, 2) not null default 0 check (current_balance >= 0),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (branch_id, code)
);

create unique index if not exists cashboxes_one_default_per_branch
  on public.cashboxes (branch_id)
  where is_default;

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  code text not null,
  bank_name text not null,
  account_name text not null,
  account_number text,
  iban text,
  swift_code text,
  account_id uuid not null references public.accounts (id) on delete restrict,
  responsible_user_id uuid references public.profiles (id) on delete set null,
  currency text not null default 'EGP',
  opening_balance numeric(14, 2) not null default 0,
  current_balance numeric(14, 2) not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (branch_id, code)
);

create unique index if not exists bank_accounts_one_default_per_branch
  on public.bank_accounts (branch_id)
  where is_default;

-- ---------------------------------------------------------------------------
-- Double-entry journal.
-- ---------------------------------------------------------------------------

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  entry_number text not null,
  entry_date date not null default current_date,
  description text not null,
  source_type text,
  source_id uuid,
  status text not null default 'draft'
    check (status in ('draft', 'posted', 'reversed')),
  reversal_of_id uuid references public.journal_entries (id) on delete restrict,
  posted_at timestamptz,
  posted_by uuid references public.profiles (id) on delete set null,
  total_debit numeric(14, 2) not null default 0 check (total_debit >= 0),
  total_credit numeric(14, 2) not null default 0 check (total_credit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (branch_id, entry_number),
  check (reversal_of_id is null or reversal_of_id <> id),
  check (status <> 'posted' or total_debit = total_credit)
);

create table if not exists public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries (id) on delete cascade,
  line_number smallint not null check (line_number > 0),
  account_id uuid not null references public.accounts (id) on delete restrict,
  description text,
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (journal_entry_id, line_number),
  check (debit = 0 or credit = 0),
  check (debit + credit > 0)
);

create table if not exists public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  cashbox_id uuid references public.cashboxes (id) on delete restrict,
  bank_account_id uuid references public.bank_accounts (id) on delete restrict,
  journal_entry_id uuid references public.journal_entries (id) on delete set null,
  transaction_type text not null
    check (transaction_type in ('opening', 'receipt', 'payment', 'transfer_in', 'transfer_out', 'adjustment')),
  transaction_date date not null default current_date,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'EGP',
  reference_type text,
  reference_id uuid,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  check (num_nonnulls(cashbox_id, bank_account_id) = 1)
);

-- ---------------------------------------------------------------------------
-- Indexes for foreign keys and common filters.
-- ---------------------------------------------------------------------------

create index if not exists role_permissions_permission_id_idx
  on public.role_permissions (permission_id);

create index if not exists user_roles_user_id_idx
  on public.user_roles (user_id);

create index if not exists user_roles_role_id_idx
  on public.user_roles (role_id);

create index if not exists user_roles_branch_id_idx
  on public.user_roles (branch_id);

create index if not exists user_branches_user_id_idx
  on public.user_branches (user_id);

create index if not exists user_branches_branch_id_idx
  on public.user_branches (branch_id);

create index if not exists number_sequences_branch_id_idx
  on public.number_sequences (branch_id);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

create index if not exists audit_logs_user_id_idx
  on public.audit_logs (user_id);

create index if not exists audit_logs_table_record_idx
  on public.audit_logs (table_name, record_id);

create index if not exists accounts_parent_id_idx
  on public.accounts (parent_id);

create index if not exists accounts_type_idx
  on public.accounts (account_type);

create index if not exists cashboxes_branch_id_idx
  on public.cashboxes (branch_id);

create index if not exists cashboxes_account_id_idx
  on public.cashboxes (account_id);

create index if not exists bank_accounts_branch_id_idx
  on public.bank_accounts (branch_id);

create index if not exists bank_accounts_account_id_idx
  on public.bank_accounts (account_id);

create index if not exists journal_entries_branch_date_idx
  on public.journal_entries (branch_id, entry_date desc);

create index if not exists journal_entries_source_idx
  on public.journal_entries (source_type, source_id);

create index if not exists journal_entries_status_idx
  on public.journal_entries (status);

create index if not exists journal_entry_lines_entry_id_idx
  on public.journal_entry_lines (journal_entry_id);

create index if not exists journal_entry_lines_account_id_idx
  on public.journal_entry_lines (account_id);

create index if not exists cash_transactions_branch_date_idx
  on public.cash_transactions (branch_id, transaction_date desc);

create index if not exists cash_transactions_cashbox_id_idx
  on public.cash_transactions (cashbox_id);

create index if not exists cash_transactions_bank_account_id_idx
  on public.cash_transactions (bank_account_id);

create index if not exists cash_transactions_journal_entry_id_idx
  on public.cash_transactions (journal_entry_id);

create index if not exists cash_transactions_reference_idx
  on public.cash_transactions (reference_type, reference_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers.
-- ---------------------------------------------------------------------------

drop trigger if exists app_settings_set_updated_at on public.system_settings;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'system_settings',
    'branches',
    'profiles',
    'roles',
    'permissions',
    'role_permissions',
    'user_roles',
    'user_branches',
    'number_sequences',
    'audit_logs',
    'accounts',
    'cashboxes',
    'bank_accounts',
    'journal_entries',
    'journal_entry_lines',
    'cash_transactions'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      target_table || '_set_updated_at',
      target_table
    );
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      target_table || '_set_updated_at',
      target_table
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: deny by default. M1.2 adds read/write policies.
-- ---------------------------------------------------------------------------

alter table public.system_settings enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_branches enable row level security;
alter table public.number_sequences enable row level security;
alter table public.audit_logs enable row level security;
alter table public.accounts enable row level security;
alter table public.cashboxes enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entry_lines enable row level security;
alter table public.cash_transactions enable row level security;

drop policy if exists app_settings_select_authenticated on public.system_settings;
drop policy if exists system_settings_select_authenticated on public.system_settings;
create policy system_settings_select_authenticated
on public.system_settings
for select
to authenticated
using (true);

revoke all on public.system_settings from anon;
grant select on public.system_settings to authenticated;

revoke all on
  public.roles,
  public.permissions,
  public.role_permissions,
  public.user_roles,
  public.user_branches,
  public.number_sequences,
  public.audit_logs,
  public.accounts,
  public.cashboxes,
  public.bank_accounts,
  public.journal_entries,
  public.journal_entry_lines,
  public.cash_transactions
from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed: operational roles, initial settings, chart of accounts, cashbox,
-- and document sequences. The permission matrix is seeded in M1.2.
-- ---------------------------------------------------------------------------

insert into public.roles (code, name_ar, name_en, description, is_system)
values
  ('owner', 'مالك المعرض', 'Owner', 'صلاحية نظامية عليا لإدارة كل شيء', true),
  ('manager', 'مدير المعرض', 'Manager', 'إدارة الوحدات واعتماد العمليات الحساسة', false),
  ('accountant', 'المحاسب', 'Accountant', 'الحسابات والخزنة والمصروفات والتقارير المالية', false),
  ('sales', 'موظف المبيعات', 'Sales', 'العملاء والمخزون وفواتير البيع', false),
  ('collection', 'موظف التحصيل', 'Collection', 'الأقساط والتحصيلات وملاحظات المتابعة', false),
  ('inventory', 'مسؤول المخزون', 'Inventory', 'المنتجات والمركبات والمشتريات والجرد', false),
  ('viewer', 'مستخدم مشاهدة', 'Viewer', 'عرض البيانات المصرح بها فقط', false)
on conflict (code) do update
set name_ar = excluded.name_ar,
    name_en = excluded.name_en,
    description = excluded.description,
    is_system = excluded.is_system,
    is_active = true;

insert into public.accounts (code, name_ar, name_en, account_type, normal_balance, is_group)
values
  ('1000', 'الأصول', 'Assets', 'asset', 'debit', true),
  ('1100', 'النقدية وما يعادلها', 'Cash and cash equivalents', 'asset', 'debit', true),
  ('1101', 'الخزنة الرئيسية', 'Main cashbox', 'asset', 'debit', false),
  ('1102', 'الحسابات البنكية', 'Bank accounts', 'asset', 'debit', true),
  ('1103', 'الحساب البنكي الرئيسي', 'Main bank account', 'asset', 'debit', false),
  ('1200', 'المدينون', 'Receivables', 'asset', 'debit', true),
  ('1201', 'عملاء', 'Customers', 'asset', 'debit', false),
  ('1300', 'المخزون', 'Inventory', 'asset', 'debit', false),
  ('2000', 'الالتزامات', 'Liabilities', 'liability', 'credit', true),
  ('2100', 'الدائنون', 'Payables', 'liability', 'credit', true),
  ('2101', 'موردون', 'Suppliers', 'liability', 'credit', false),
  ('3000', 'حقوق الملكية', 'Equity', 'equity', 'credit', true),
  ('3100', 'رأس المال', 'Capital', 'equity', 'credit', false),
  ('4000', 'الإيرادات', 'Revenue', 'revenue', 'credit', true),
  ('4100', 'إيرادات المبيعات', 'Sales revenue', 'revenue', 'credit', false),
  ('5000', 'المصروفات', 'Expenses', 'expense', 'debit', true),
  ('5100', 'تكلفة البضاعة المباعة', 'Cost of goods sold', 'expense', 'debit', false),
  ('5200', 'المصروفات التشغيلية', 'Operating expenses', 'expense', 'debit', true),
  ('5201', 'الإيجار', 'Rent', 'expense', 'debit', false),
  ('5202', 'الكهرباء والمياه', 'Utilities', 'expense', 'debit', false),
  ('5203', 'المرتبات', 'Payroll', 'expense', 'debit', false),
  ('5204', 'مصروفات إدارية', 'Administrative expenses', 'expense', 'debit', false),
  ('5300', 'فروق وتسويات', 'Differences and adjustments', 'expense', 'debit', false)
on conflict (code) do update
set name_ar = excluded.name_ar,
    name_en = excluded.name_en,
    account_type = excluded.account_type,
    normal_balance = excluded.normal_balance,
    is_group = excluded.is_group,
    is_active = true;

update public.accounts as child
set parent_id = parent.id
from (values
  ('1100', '1000'),
  ('1101', '1100'),
  ('1102', '1100'),
  ('1103', '1102'),
  ('1200', '1000'),
  ('1201', '1200'),
  ('1300', '1000'),
  ('2000', null),
  ('2100', '2000'),
  ('2101', '2100'),
  ('3000', null),
  ('3100', '3000'),
  ('4000', null),
  ('4100', '4000'),
  ('5000', null),
  ('5100', '5000'),
  ('5200', '5000'),
  ('5201', '5200'),
  ('5202', '5200'),
  ('5203', '5200'),
  ('5204', '5200'),
  ('5300', '5000')
) as mapping(child_code, parent_code)
join public.accounts as parent on parent.code = mapping.parent_code
where child.code = mapping.child_code;

insert into public.system_settings as settings (
  id,
  app_name,
  branch_code,
  currency,
  timezone,
  address,
  phone,
  document_prefixes
)
values (
  true,
  'معرض البركة',
  'SNH-01',
  'EGP',
  'Africa/Cairo',
  'محافظة الشرقية — مركز صان الحجر — بجوار مركز الشرطة',
  '01000172840',
  jsonb_build_object(
    'sales_invoice', 'SAL',
    'purchase_invoice', 'PUR',
    'contract', 'CON',
    'receipt', 'REC',
    'payment', 'PAY',
    'journal_entry', 'JV'
  )
)
on conflict (id) do update
set app_name = settings.app_name,
    branch_code = settings.branch_code,
    currency = settings.currency,
    timezone = settings.timezone,
    address = coalesce(settings.address, excluded.address),
    phone = coalesce(settings.phone, excluded.phone),
    document_prefixes = case
      when settings.document_prefixes = '{}'::jsonb then excluded.document_prefixes
      else settings.document_prefixes
    end;

insert into public.cashboxes (
  branch_id,
  code,
  name_ar,
  name_en,
  account_id,
  currency,
  is_default,
  is_active
)
select
  branch.id,
  'CASH-01',
  'الخزنة الرئيسية',
  'Main cashbox',
  account.id,
  'EGP',
  true,
  true
from public.branches as branch
join public.accounts as account on account.code = '1101'
where branch.code = 'SNH-01'
on conflict (branch_id, code) do update
set name_ar = excluded.name_ar,
    name_en = excluded.name_en,
    account_id = excluded.account_id,
    is_default = true,
    is_active = true;

insert into public.number_sequences (
  branch_id,
  document_type,
  year,
  prefix,
  next_number,
  padding
)
select
  branch.id,
  sequence.document_type,
  extract(year from current_date)::integer,
  sequence.prefix,
  1,
  5
from public.branches as branch
cross join (values
  ('sales_invoice', 'SAL'),
  ('purchase_invoice', 'PUR'),
  ('contract', 'CON'),
  ('receipt', 'REC'),
  ('payment', 'PAY'),
  ('journal_entry', 'JV')
) as sequence(document_type, prefix)
where branch.code = 'SNH-01'
on conflict (branch_id, document_type, year) do nothing;

-- ---------------------------------------------------------------------------
-- Backfill existing users into the normalized membership tables.
-- ---------------------------------------------------------------------------

insert into public.user_branches (user_id, branch_id, is_default)
select
  profile.id,
  coalesce(profile.branch_id, launch_branch.id),
  true
from public.profiles as profile
left join public.branches as launch_branch on launch_branch.code = 'SNH-01'
where coalesce(profile.branch_id, launch_branch.id) is not null
on conflict (user_id, branch_id) do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select
  profile.id,
  role.id,
  coalesce(profile.branch_id, launch_branch.id),
  not exists (
    select 1
    from public.user_roles as existing
    where existing.user_id = profile.id
      and existing.is_primary
  )
from public.profiles as profile
join public.roles as role on role.code = profile.role
left join public.branches as launch_branch on launch_branch.code = 'SNH-01'
where coalesce(profile.branch_id, launch_branch.id) is not null
on conflict (user_id, role_id, branch_id) do nothing;

-- ---------------------------------------------------------------------------
-- New auth users receive a profile, branch membership, and viewer role.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_branch_id uuid;
  viewer_role_id uuid;
begin
  select id into default_branch_id
  from public.branches
  where code = 'SNH-01'
  limit 1;

  select id into viewer_role_id
  from public.roles
  where code = 'viewer'
  limit 1;

  insert into public.profiles (id, full_name, role, branch_id, is_active)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    'viewer',
    default_branch_id,
    true
  )
  on conflict (id) do nothing;

  if default_branch_id is not null then
    insert into public.user_branches (user_id, branch_id, is_default)
    values (new.id, default_branch_id, true)
    on conflict do nothing;

    if viewer_role_id is not null then
      insert into public.user_roles (user_id, role_id, branch_id, is_primary)
      values (new.id, viewer_role_id, default_branch_id, true)
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Helpful documentation for the next stages.
comment on table public.user_roles is
  'Role assignments are scoped to a branch. M1.2 uses these rows for permission checks.';
comment on table public.user_branches is
  'Branches a user may access. One row per user/branch; is_default marks the landing branch.';
comment on table public.number_sequences is
  'Atomic document counters per branch, document type, and year; consumed by M1.4.';
comment on table public.journal_entries is
  'Double-entry header. Lines live in journal_entry_lines; totals must balance before posting.';
comment on table public.cash_transactions is
  'Cash or bank movement. Exactly one of cashbox_id or bank_account_id is set.';
