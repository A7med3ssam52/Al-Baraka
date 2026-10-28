export interface AuditLogEntry {
  id: string
  user_id: string | null
  user_name: string
  branch_id: string | null
  branch_name: string | null
  action: string
  table_name: string
  record_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  created_at: string
  total_count: number
}

export interface AuditUserOption {
  id: string
  name: string
}

export interface AuditBranchOption {
  id: string
  name: string
}

export interface AuditFilterOptions {
  users: AuditUserOption[]
  actions: string[]
  tables: string[]
  branches: AuditBranchOption[]
}

export interface AuditFilters {
  search: string
  action: string
  table: string
  userId: string
  branchId: string
  from: string
  to: string
}

export const emptyAuditFilters: AuditFilters = {
  search: '',
  action: '',
  table: '',
  userId: '',
  branchId: '',
  from: '',
  to: '',
}

export const auditActionLabels: Record<string, string> = {
  insert: 'إضافة',
  update: 'تعديل',
  delete: 'حذف',
  user: 'مستخدم',
  user_access: 'وصول',
  user_access_assigned: 'إسناد وصول',
  user_created: 'إنشاء مستخدم',
  user_updated: 'تعديل مستخدم',
  user_deactivated: 'تعطيل مستخدم',
  user_activated: 'تفعيل مستخدم',
  invitation_created: 'إنشاء دعوة',
  invitation_cancelled: 'إلغاء دعوة',
  invitation_regenerated: 'إعادة توليد دعوة',
  invitation_accepted: 'قبول دعوة',
}

export const auditTableLabels: Record<string, string> = {
  branches: 'الفروع',
  system_settings: 'إعدادات النظام',
  profiles: 'ملفات المستخدمين',
  user_roles: 'أدوار المستخدمين',
  user_branches: 'فروع المستخدمين',
  staff_invitations: 'دعوات الموظفين',
  staff_signup_claims: 'طلبات التسجيل',
  roles: 'الأدوار',
  role_permissions: 'صلاحيات الأدوار',
  accounts: 'دليل الحسابات',
  cashboxes: 'الخزائن',
  bank_accounts: 'الحسابات البنكية',
}
