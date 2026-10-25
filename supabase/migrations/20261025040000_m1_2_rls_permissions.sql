-- M1.2 — Row-level security policies and permission matrix
-- Builds on M1.1. Adds the permission catalog, role matrix, branch-aware
-- helper functions, and read/write policies for every client-visible table.
--
-- Design:
--   * `user_roles` + `user_branches` are the source of truth (D-18).
--   * `owner` is a system role with global access (D-19).
--   * Every check is branch-aware; an inactive user gets no branch access.
--   * Financial tables are read-only to clients. Their writes will be exposed
--     through atomic RPCs in later stages.
--   * `number_sequences`, `roles`, `permissions`, and `role_permissions` are
--     read-only reference data. User/role writes arrive in M1.3 through RPCs.

-- ---------------------------------------------------------------------------
-- Helper functions.
-- ---------------------------------------------------------------------------

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = auth.uid()
      and profile.is_active
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_active_user()
    and exists (
      select 1
      from public.user_roles as user_role
      join public.roles as role on role.id = user_role.role_id
      where user_role.user_id = auth.uid()
        and role.code = 'owner'
        and role.is_active
    );
$$;

create or replace function public.current_branch()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when not public.is_active_user() then null
    else coalesce(
      (
        select membership.branch_id
        from public.user_branches as membership
        join public.branches as branch on branch.id = membership.branch_id
        where membership.user_id = auth.uid()
          and membership.is_default
          and branch.is_active
        limit 1
      ),
      (
        select membership.branch_id
        from public.user_branches as membership
        join public.branches as branch on branch.id = membership.branch_id
        where membership.user_id = auth.uid()
          and branch.is_active
        order by membership.created_at, membership.branch_id
        limit 1
      ),
      (
        select profile.branch_id
        from public.profiles as profile
        join public.branches as branch on branch.id = profile.branch_id
        where profile.id = auth.uid()
          and profile.is_active
          and branch.is_active
        limit 1
      )
    )
  end;
$$;

create or replace function public.is_branch_member(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_active_user()
    and (
      public.is_owner()
      or exists (
        select 1
        from public.user_branches as membership
        join public.branches as branch on branch.id = membership.branch_id
        where membership.user_id = auth.uid()
          and membership.branch_id = target_branch_id
          and branch.is_active
      )
    );
$$;

create or replace function public.has_permission(
  permission_code text,
  target_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when permission_code is null or not public.is_active_user() then false
    when public.is_owner() then true
    else exists (
      select 1
      from public.user_roles as user_role
      join public.roles as role
        on role.id = user_role.role_id
       and role.is_active
      join public.role_permissions as role_permission
        on role_permission.role_id = role.id
      join public.permissions as permission
        on permission.id = role_permission.permission_id
       and permission.is_active
      where user_role.user_id = auth.uid()
        and permission.code = permission_code
        and user_role.branch_id = coalesce(target_branch_id, public.current_branch())
    )
  end;
$$;

create or replace function public.has_permission(permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_permission(permission_code, null::uuid);
$$;

create or replace function public.my_permissions(target_branch_id uuid default null)
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select permission.code
  from public.user_roles as user_role
  join public.roles as role
    on role.id = user_role.role_id
   and role.is_active
  join public.role_permissions as role_permission
    on role_permission.role_id = role.id
  join public.permissions as permission
    on permission.id = role_permission.permission_id
   and permission.is_active
  where user_role.user_id = auth.uid()
    and user_role.branch_id = coalesce(target_branch_id, public.current_branch())
  union
  select permission.code
  from public.permissions as permission
  where public.is_owner()
    and permission.is_active
  order by 1;
$$;

create or replace function public.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_active_user()
    and (
      target_user_id = auth.uid()
      or public.is_owner()
      or exists (
        select 1
        from public.user_branches as target_membership
        where target_membership.user_id = target_user_id
          and public.has_permission('users.view', target_membership.branch_id)
      )
    );
$$;

create or replace function public.can_view_journal_entry(target_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.journal_entries as entry
    where entry.id = target_entry_id
      and public.has_permission('journal_entries.view', entry.branch_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Permission catalog.
-- ---------------------------------------------------------------------------

insert into public.permissions (code, module, action, name_ar, name_en)
values
  ('dashboard.view', 'dashboard', 'view', 'عرض لوحة التحكم', 'View dashboard'),
  ('users.view', 'users', 'view', 'عرض المستخدمين', 'View users'),
  ('users.create', 'users', 'create', 'إضافة مستخدم', 'Create user'),
  ('users.update', 'users', 'update', 'تعديل مستخدم', 'Update user'),
  ('users.deactivate', 'users', 'deactivate', 'تعطيل مستخدم', 'Deactivate user'),
  ('users.reset_password', 'users', 'reset_password', 'إعادة تعيين كلمة المرور', 'Reset password'),
  ('users.assign_role', 'users', 'assign_role', 'إسناد الأدوار والفروع', 'Assign roles and branches'),
  ('roles.view', 'roles', 'view', 'عرض الأدوار', 'View roles'),
  ('roles.manage', 'roles', 'manage', 'إدارة الأدوار والصلاحيات', 'Manage roles and permissions'),
  ('branches.view', 'branches', 'view', 'عرض الفروع', 'View branches'),
  ('branches.manage', 'branches', 'manage', 'إدارة الفروع', 'Manage branches'),
  ('settings.view', 'settings', 'view', 'عرض الإعدادات', 'View settings'),
  ('settings.update', 'settings', 'update', 'تعديل الإعدادات', 'Update settings'),
  ('audit_logs.view', 'audit_logs', 'view', 'عرض سجل المراجعة', 'View audit log'),
  ('audit_logs.export', 'audit_logs', 'export', 'تصدير سجل المراجعة', 'Export audit log'),
  ('customers.view', 'customers', 'view', 'عرض العملاء', 'View customers'),
  ('customers.create', 'customers', 'create', 'إضافة عميل', 'Create customer'),
  ('customers.update', 'customers', 'update', 'تعديل عميل', 'Update customer'),
  ('customers.archive', 'customers', 'archive', 'أرشفة عميل', 'Archive customer'),
  ('customers.export', 'customers', 'export', 'تصدير العملاء', 'Export customers'),
  ('suppliers.view', 'suppliers', 'view', 'عرض الموردين', 'View suppliers'),
  ('suppliers.create', 'suppliers', 'create', 'إضافة مورد', 'Create supplier'),
  ('suppliers.update', 'suppliers', 'update', 'تعديل مورد', 'Update supplier'),
  ('suppliers.archive', 'suppliers', 'archive', 'أرشفة مورد', 'Archive supplier'),
  ('suppliers.export', 'suppliers', 'export', 'تصدير الموردين', 'Export suppliers'),
  ('products.view', 'products', 'view', 'عرض المنتجات', 'View products'),
  ('products.create', 'products', 'create', 'إضافة منتج', 'Create product'),
  ('products.update', 'products', 'update', 'تعديل منتج', 'Update product'),
  ('products.archive', 'products', 'archive', 'أرشفة منتج', 'Archive product'),
  ('vehicles.view', 'vehicles', 'view', 'عرض المركبات', 'View vehicles'),
  ('vehicles.create', 'vehicles', 'create', 'إضافة مركبة', 'Create vehicle'),
  ('vehicles.update', 'vehicles', 'update', 'تعديل مركبة', 'Update vehicle'),
  ('vehicles.archive', 'vehicles', 'archive', 'أرشفة مركبة', 'Archive vehicle'),
  ('inventory_counts.view', 'inventory_counts', 'view', 'عرض الجرد', 'View inventory counts'),
  ('inventory_counts.create', 'inventory_counts', 'create', 'إنشاء جرد', 'Create inventory count'),
  ('inventory_counts.approve', 'inventory_counts', 'approve', 'اعتماد الجرد', 'Approve inventory count'),
  ('inventory_counts.export', 'inventory_counts', 'export', 'تصدير الجرد', 'Export inventory counts'),
  ('purchases.view', 'purchases', 'view', 'عرض المشتريات', 'View purchases'),
  ('purchases.create', 'purchases', 'create', 'إنشاء مشتريات', 'Create purchase'),
  ('purchases.update', 'purchases', 'update', 'تعديل مشتريات', 'Update purchase'),
  ('purchases.approve', 'purchases', 'approve', 'اعتماد مشتريات', 'Approve purchase'),
  ('purchases.cancel', 'purchases', 'cancel', 'إلغاء مشتريات', 'Cancel purchase'),
  ('purchases.export', 'purchases', 'export', 'تصدير المشتريات', 'Export purchases'),
  ('sales.view', 'sales', 'view', 'عرض المبيعات', 'View sales'),
  ('sales.create', 'sales', 'create', 'إنشاء بيع', 'Create sale'),
  ('sales.update', 'sales', 'update', 'تعديل بيع', 'Update sale'),
  ('sales.approve', 'sales', 'approve', 'اعتماد بيع', 'Approve sale'),
  ('sales.cancel', 'sales', 'cancel', 'إلغاء بيع', 'Cancel sale'),
  ('sales.discount_approve', 'sales', 'discount_approve', 'اعتماد الخصومات', 'Approve discounts'),
  ('sales.export', 'sales', 'export', 'تصدير المبيعات', 'Export sales'),
  ('contracts.view', 'contracts', 'view', 'عرض العقود', 'View contracts'),
  ('contracts.create', 'contracts', 'create', 'إنشاء عقد', 'Create contract'),
  ('contracts.update', 'contracts', 'update', 'تعديل عقد', 'Update contract'),
  ('contracts.cancel', 'contracts', 'cancel', 'إلغاء عقد', 'Cancel contract'),
  ('contracts.reschedule_approve', 'contracts', 'reschedule_approve', 'اعتماد إعادة الجدولة', 'Approve rescheduling'),
  ('contracts.export', 'contracts', 'export', 'تصدير العقود', 'Export contracts'),
  ('installments.view', 'installments', 'view', 'عرض الأقساط', 'View installments'),
  ('installments.collect', 'installments', 'collect', 'تحصيل الأقساط', 'Collect installments'),
  ('installments.reschedule', 'installments', 'reschedule', 'طلب إعادة جدولة', 'Request rescheduling'),
  ('installments.waive', 'installments', 'waive', 'إعفاء من قسط', 'Waive installment'),
  ('installments.export', 'installments', 'export', 'تصدير الأقساط', 'Export installments'),
  ('collections.view', 'collections', 'view', 'عرض التحصيلات', 'View collections'),
  ('collections.create', 'collections', 'create', 'تسجيل تحصيل', 'Record collection'),
  ('collections.cancel', 'collections', 'cancel', 'إلغاء تحصيل', 'Cancel collection'),
  ('collections.print', 'collections', 'print', 'طباعة إيصال قبض', 'Print receipt'),
  ('collections.export', 'collections', 'export', 'تصدير التحصيلات', 'Export collections'),
  ('cashboxes.view', 'cashboxes', 'view', 'عرض الخزائن', 'View cashboxes'),
  ('cashboxes.create', 'cashboxes', 'create', 'إضافة خزنة', 'Create cashbox'),
  ('cashboxes.update', 'cashboxes', 'update', 'تعديل خزنة', 'Update cashbox'),
  ('cashboxes.transfer', 'cashboxes', 'transfer', 'تحويل بين الخزائن', 'Transfer between cashboxes'),
  ('cashboxes.close_shift', 'cashboxes', 'close_shift', 'إغلاق الوردية', 'Close shift'),
  ('cashboxes.export', 'cashboxes', 'export', 'تصدير حركات الخزائن', 'Export cashbox movements'),
  ('banks.view', 'banks', 'view', 'عرض الحسابات البنكية', 'View bank accounts'),
  ('banks.manage', 'banks', 'manage', 'إدارة الحسابات البنكية', 'Manage bank accounts'),
  ('banks.export', 'banks', 'export', 'تصدير الحسابات البنكية', 'Export bank accounts'),
  ('expenses.view', 'expenses', 'view', 'عرض المصروفات', 'View expenses'),
  ('expenses.create', 'expenses', 'create', 'إضافة مصروف', 'Create expense'),
  ('expenses.update', 'expenses', 'update', 'تعديل مصروف', 'Update expense'),
  ('expenses.approve', 'expenses', 'approve', 'اعتماد مصروف', 'Approve expense'),
  ('expenses.cancel', 'expenses', 'cancel', 'إلغاء مصروف', 'Cancel expense'),
  ('expenses.export', 'expenses', 'export', 'تصدير المصروفات', 'Export expenses'),
  ('journal_entries.view', 'journal_entries', 'view', 'عرض القيود', 'View journal entries'),
  ('journal_entries.create', 'journal_entries', 'create', 'إنشاء قيد', 'Create journal entry'),
  ('journal_entries.post', 'journal_entries', 'post', 'ترحيل قيد', 'Post journal entry'),
  ('journal_entries.reverse', 'journal_entries', 'reverse', 'عكس قيد', 'Reverse journal entry'),
  ('journal_entries.export', 'journal_entries', 'export', 'تصدير القيود', 'Export journal entries'),
  ('accounts.view', 'accounts', 'view', 'عرض دليل الحسابات', 'View chart of accounts'),
  ('accounts.manage', 'accounts', 'manage', 'إدارة دليل الحسابات', 'Manage chart of accounts'),
  ('transactions.view', 'transactions', 'view', 'عرض الحركات المالية', 'View financial transactions'),
  ('reports.view', 'reports', 'view', 'عرض التقارير', 'View reports'),
  ('reports.export', 'reports', 'export', 'تصدير التقارير', 'Export reports'),
  ('documents.view', 'documents', 'view', 'عرض المستندات', 'View documents'),
  ('documents.upload', 'documents', 'upload', 'رفع مستند', 'Upload document'),
  ('documents.download_sensitive', 'documents', 'download_sensitive', 'تنزيل مستند حساس', 'Download sensitive document'),
  ('documents.delete', 'documents', 'delete', 'حذف مستند', 'Delete document'),
  ('notifications.view', 'notifications', 'view', 'عرض التنبيهات', 'View notifications'),
  ('notifications.manage', 'notifications', 'manage', 'إدارة التنبيهات', 'Manage notifications')
on conflict (code) do update
set module = excluded.module,
    action = excluded.action,
    name_ar = excluded.name_ar,
    name_en = excluded.name_en,
    is_active = true;

-- ---------------------------------------------------------------------------
-- Role matrix.
--   owner     : every permission (plus a runtime bypass in has_permission).
--   manager   : every operational permission except editing the role catalog.
--   accountant: financial operations, reporting, and sensitive documents.
--   sales     : customers, sales, contracts, and read-only inventory.
--   collection: installments, receipts, and read-only cash/bank data.
--   inventory : products, vehicles, purchases, suppliers, and counts.
--   viewer    : read-only access to operational data in the current branch.
-- ---------------------------------------------------------------------------

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.code = 'owner'
   or (role.code = 'manager' and permission.code <> 'roles.manage')
   or (
     role.code = 'accountant'
     and permission.code in (
       'dashboard.view',
       'settings.view',
       'branches.view',
       'audit_logs.view',
       'audit_logs.export',
       'customers.view',
       'customers.export',
       'suppliers.view',
       'suppliers.export',
       'products.view',
       'vehicles.view',
       'inventory_counts.view',
       'inventory_counts.export',
       'purchases.view',
       'purchases.export',
       'sales.view',
       'sales.export',
       'contracts.view',
       'contracts.export',
       'installments.view',
       'installments.export',
       'collections.view',
       'collections.create',
       'collections.cancel',
       'collections.print',
       'collections.export',
       'cashboxes.view',
       'cashboxes.create',
       'cashboxes.update',
       'cashboxes.transfer',
       'cashboxes.close_shift',
       'cashboxes.export',
       'banks.view',
       'banks.manage',
       'banks.export',
       'expenses.view',
       'expenses.create',
       'expenses.update',
       'expenses.approve',
       'expenses.cancel',
       'expenses.export',
       'journal_entries.view',
       'journal_entries.create',
       'journal_entries.post',
       'journal_entries.reverse',
       'journal_entries.export',
       'accounts.view',
       'accounts.manage',
       'transactions.view',
       'reports.view',
       'reports.export',
       'documents.view',
       'documents.upload',
       'documents.download_sensitive',
       'notifications.view'
     )
   )
   or (
     role.code = 'sales'
     and permission.code in (
       'dashboard.view',
       'settings.view',
       'branches.view',
       'customers.view',
       'customers.create',
       'customers.update',
       'customers.archive',
       'customers.export',
       'products.view',
       'vehicles.view',
       'sales.view',
       'sales.create',
       'sales.update',
       'sales.export',
       'contracts.view',
       'contracts.create',
       'contracts.update',
       'contracts.export',
       'installments.view',
       'collections.view',
       'cashboxes.view',
       'documents.view',
       'documents.upload',
       'reports.view',
       'notifications.view'
     )
   )
   or (
     role.code = 'collection'
     and permission.code in (
       'dashboard.view',
       'settings.view',
       'branches.view',
       'customers.view',
       'contracts.view',
       'installments.view',
       'installments.collect',
       'installments.reschedule',
       'collections.view',
       'collections.create',
       'collections.print',
       'cashboxes.view',
       'banks.view',
       'transactions.view',
       'documents.view',
       'documents.upload',
       'reports.view',
       'notifications.view'
     )
   )
   or (
     role.code = 'inventory'
     and permission.code in (
       'dashboard.view',
       'settings.view',
       'branches.view',
       'suppliers.view',
       'suppliers.create',
       'suppliers.update',
       'suppliers.archive',
       'suppliers.export',
       'products.view',
       'products.create',
       'products.update',
       'products.archive',
       'vehicles.view',
       'vehicles.create',
       'vehicles.update',
       'vehicles.archive',
       'purchases.view',
       'purchases.create',
       'purchases.update',
       'purchases.export',
       'inventory_counts.view',
       'inventory_counts.create',
       'inventory_counts.export',
       'documents.view',
       'documents.upload',
       'reports.view',
       'notifications.view'
     )
   )
   or (
     role.code = 'viewer'
     and permission.code in (
       'dashboard.view',
       'settings.view',
       'branches.view',
       'customers.view',
       'suppliers.view',
       'products.view',
       'vehicles.view',
       'purchases.view',
       'sales.view',
       'contracts.view',
       'installments.view',
       'collections.view',
       'cashboxes.view',
       'reports.view',
       'documents.view',
       'notifications.view'
     )
   )
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- Policies. Old M0.3/M1.1 policies are replaced with branch-aware versions.
-- ---------------------------------------------------------------------------

drop policy if exists branches_select_authenticated on public.branches;
drop policy if exists branches_select_member on public.branches;
drop policy if exists branches_insert_owner on public.branches;
drop policy if exists branches_update_manage on public.branches;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_authorized on public.profiles;

drop policy if exists system_settings_select_authenticated on public.system_settings;
drop policy if exists system_settings_update_manage on public.system_settings;

drop policy if exists roles_select_authorized on public.roles;
drop policy if exists permissions_select_authorized on public.permissions;
drop policy if exists role_permissions_select_authorized on public.role_permissions;
drop policy if exists user_roles_select_authorized on public.user_roles;
drop policy if exists user_branches_select_authorized on public.user_branches;
drop policy if exists audit_logs_select_authorized on public.audit_logs;
drop policy if exists accounts_select_authorized on public.accounts;
drop policy if exists cashboxes_select_authorized on public.cashboxes;
drop policy if exists bank_accounts_select_authorized on public.bank_accounts;
drop policy if exists journal_entries_select_authorized on public.journal_entries;
drop policy if exists journal_entry_lines_select_authorized on public.journal_entry_lines;
drop policy if exists cash_transactions_select_authorized on public.cash_transactions;

create policy branches_select_member
on public.branches
for select
to authenticated
using (public.has_permission('branches.view', id));

create policy branches_insert_owner
on public.branches
for insert
to authenticated
with check (public.is_owner());

create policy branches_update_manage
on public.branches
for update
to authenticated
using (public.has_permission('branches.manage', id))
with check (public.has_permission('branches.manage', id));

create policy profiles_select_authorized
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.can_view_profile(id));

create policy system_settings_select_authenticated
on public.system_settings
for select
to authenticated
using (true);

create policy system_settings_update_manage
on public.system_settings
for update
to authenticated
using (public.has_permission('settings.update'))
with check (public.has_permission('settings.update'));

create policy roles_select_authorized
on public.roles
for select
to authenticated
using (public.has_permission('roles.view'));

create policy permissions_select_authorized
on public.permissions
for select
to authenticated
using (public.has_permission('roles.view'));

create policy role_permissions_select_authorized
on public.role_permissions
for select
to authenticated
using (public.has_permission('roles.view'));

create policy user_roles_select_authorized
on public.user_roles
for select
to authenticated
using (user_id = auth.uid() or public.has_permission('users.view', branch_id));

create policy user_branches_select_authorized
on public.user_branches
for select
to authenticated
using (user_id = auth.uid() or public.has_permission('users.view', branch_id));

create policy audit_logs_select_authorized
on public.audit_logs
for select
to authenticated
using (public.has_permission('audit_logs.view', branch_id));

create policy accounts_select_authorized
on public.accounts
for select
to authenticated
using (public.has_permission('accounts.view'));

create policy cashboxes_select_authorized
on public.cashboxes
for select
to authenticated
using (public.has_permission('cashboxes.view', branch_id));

create policy bank_accounts_select_authorized
on public.bank_accounts
for select
to authenticated
using (public.has_permission('banks.view', branch_id));

create policy journal_entries_select_authorized
on public.journal_entries
for select
to authenticated
using (public.has_permission('journal_entries.view', branch_id));

create policy journal_entry_lines_select_authorized
on public.journal_entry_lines
for select
to authenticated
using (public.can_view_journal_entry(journal_entry_id));

create policy cash_transactions_select_authorized
on public.cash_transactions
for select
to authenticated
using (public.has_permission('transactions.view', branch_id));

-- ---------------------------------------------------------------------------
-- Grants. Financial tables are SELECT-only for clients; writes arrive through
-- security-definer RPCs in later stages. number_sequences stays closed.
-- ---------------------------------------------------------------------------

revoke all on public.branches, public.profiles, public.system_settings
from anon, authenticated;

grant select on public.branches, public.profiles, public.system_settings
to authenticated;

grant insert, update on public.branches to authenticated;
grant update on public.system_settings to authenticated;

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

grant select on
  public.roles,
  public.permissions,
  public.role_permissions,
  public.user_roles,
  public.user_branches,
  public.audit_logs,
  public.accounts,
  public.cashboxes,
  public.bank_accounts,
  public.journal_entries,
  public.journal_entry_lines,
  public.cash_transactions
to authenticated;

-- ---------------------------------------------------------------------------
-- Function execution is restricted to signed-in users. Trigger helpers stay
-- closed because they are only invoked by the database.
-- ---------------------------------------------------------------------------

revoke all on function public.is_active_user() from public, anon;
revoke all on function public.is_owner() from public, anon;
revoke all on function public.current_branch() from public, anon;
revoke all on function public.is_branch_member(uuid) from public, anon;
revoke all on function public.has_permission(text, uuid) from public, anon;
revoke all on function public.has_permission(text) from public, anon;
revoke all on function public.my_permissions(uuid) from public, anon;
revoke all on function public.can_view_profile(uuid) from public, anon;
revoke all on function public.can_view_journal_entry(uuid) from public, anon;

grant execute on function public.is_active_user() to authenticated, service_role;
grant execute on function public.is_owner() to authenticated, service_role;
grant execute on function public.current_branch() to authenticated, service_role;
grant execute on function public.is_branch_member(uuid) to authenticated, service_role;
grant execute on function public.has_permission(text, uuid) to authenticated, service_role;
grant execute on function public.has_permission(text) to authenticated, service_role;
grant execute on function public.my_permissions(uuid) to authenticated, service_role;
grant execute on function public.can_view_profile(uuid) to authenticated, service_role;
grant execute on function public.can_view_journal_entry(uuid) to authenticated, service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.protect_launch_branch() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Safety check: every public table must have RLS enabled.
-- ---------------------------------------------------------------------------

do $$
declare
  unprotected_tables text;
begin
  select string_agg(class.relname, ', ' order by class.relname)
  into unprotected_tables
  from pg_class as class
  join pg_namespace as namespace on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relkind = 'r'
    and not class.relrowsecurity;

  if unprotected_tables is not null then
    raise exception 'RLS is not enabled on: %', unprotected_tables;
  end if;
end;
$$;

comment on function public.has_permission(text, uuid) is
  'Branch-aware permission check. owner bypasses the matrix; inactive users always fail.';
comment on function public.my_permissions(uuid) is
  'Permission codes for the signed-in user in the given or current branch.';
comment on table public.number_sequences is
  'Internal counters. Closed to clients; consumed by security-definer RPCs.';
comment on table public.accounts is
  'Chart of accounts. Read-only to clients; writes are exposed through RPCs.';
comment on table public.cashboxes is
  'Cashboxes. Read-only to clients; movements and balances are managed by RPCs.';
comment on table public.bank_accounts is
  'Bank accounts. Read-only to clients; writes are exposed through RPCs.';
comment on table public.journal_entries is
  'Journal headers. Read-only to clients; posting and reversal use RPCs.';
comment on table public.journal_entry_lines is
  'Journal lines. Read-only to clients; written together with their header.';
comment on table public.cash_transactions is
  'Cash and bank movements. Read-only to clients; written by financial RPCs.';
