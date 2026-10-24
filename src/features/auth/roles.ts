import type { UserRole } from '@/types'

export const roleLabels: Record<UserRole, string> = {
  owner: 'مالك المعرض',
  manager: 'مدير المعرض',
  accountant: 'محاسب',
  sales: 'مسؤول مبيعات',
  collection: 'مسؤول تحصيل',
  inventory: 'مسؤول مخزون',
  viewer: 'مستخدم',
}

export function getRoleLabel(role?: UserRole | null) {
  return role ? roleLabels[role] : roleLabels.viewer
}
