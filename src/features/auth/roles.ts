import type { UserRole } from '@/types'

export const userRoles: UserRole[] = [
  'owner',
  'manager',
  'accountant',
  'sales',
  'collection',
  'inventory',
  'viewer',
]

export const roleLabels: Record<UserRole, string> = {
  owner: 'مالك المعرض',
  manager: 'مدير المعرض',
  accountant: 'المحاسب',
  sales: 'موظف المبيعات',
  collection: 'موظف التحصيل',
  inventory: 'مسؤول المخزون',
  viewer: 'مستخدم مشاهدة',
}

export const roleDescriptions: Record<UserRole, string> = {
  owner: 'صلاحية نظامية عليا لكل الوحدات والإعدادات.',
  manager: 'إدارة التشغيل اليومي وكل الوحدات عدا إدارة الأدوار.',
  accountant: 'الخزنة والبنوك والمصروفات والقيود والتقارير المالية.',
  sales: 'العملاء والمخزون وفواتير البيع والعقود.',
  collection: 'متابعة الأقساط والتحصيلات والملاحظات.',
  inventory: 'المنتجات والمركبات والمشتريات والجرد.',
  viewer: 'عرض البيانات المصرح بها فقط دون تعديل.',
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (userRoles as string[]).includes(value)
}

export function getRoleLabel(role?: UserRole | null) {
  return role ? roleLabels[role] : roleLabels.viewer
}

export function getRoleDescription(role?: UserRole | null) {
  return role ? roleDescriptions[role] : roleDescriptions.viewer
}
