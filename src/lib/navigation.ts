import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Bike,
  CreditCard,
  FileText,
  History,
  LayoutDashboard,
  Settings,
  Truck,
  UserCog,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  description?: string
  permission?: string
}

export const mainNavigation: NavItem[] = [
  {
    label: 'لوحة التحكم',
    href: '/',
    icon: LayoutDashboard,
    description: 'نظرة عامة على حركة المعرض',
    permission: 'dashboard.view',
  },
  {
    label: 'العملاء',
    href: '/customers',
    icon: Users,
    description: 'ملفات العملاء وجهات الاتصال',
    permission: 'customers.view',
  },
  {
    label: 'الأقساط والتحصيل',
    href: '/installments',
    icon: CreditCard,
    description: 'جداول الأقساط والتحصيلات',
    permission: 'installments.view',
  },
  {
    label: 'الموردون',
    href: '/suppliers',
    icon: Truck,
    description: 'سجل الموردين والتواصل',
    permission: 'suppliers.view',
  },
  {
    label: 'المخزون',
    href: '/inventory',
    icon: Bike,
    description: 'المركبات والمنتجات والقطع',
    permission: 'products.view',
  },
  {
    label: 'الخزنة والمصروفات',
    href: '/treasury',
    icon: Wallet,
    description: 'الخزنة والبنوك والمصروفات',
    permission: 'cashboxes.view',
  },
  {
    label: 'المستندات',
    href: '/documents',
    icon: FileText,
    description: 'الصور والعقود والمستندات',
    permission: 'documents.view',
  },
  {
    label: 'التقارير',
    href: '/reports',
    icon: BarChart3,
    description: 'تقارير المبيعات والأرباح',
    permission: 'reports.view',
  },
]

export const secondaryNavigation: NavItem[] = [
  {
    label: 'المستخدمون',
    href: '/users',
    icon: UserCog,
    description: 'الحسابات والأدوار والدعوات',
    permission: 'users.view',
  },
  {
    label: 'سجل المراجعة',
    href: '/audit-logs',
    icon: History,
    description: 'العمليات الحساسة على النظام',
    permission: 'audit_logs.view',
  },
  {
    label: 'الإعدادات',
    href: '/settings',
    icon: Settings,
    description: 'إعدادات المعرض والفروع والترقيم',
    permission: 'settings.view',
  },
]

export const accountNavigation: NavItem[] = [
  {
    label: 'الملف الشخصي',
    href: '/profile',
    icon: UserRound,
    description: 'بيانات الحساب وتغيير كلمة المرور',
  },
]

export const allNavigation = [...mainNavigation, ...secondaryNavigation, ...accountNavigation]

export function getNavItem(pathname: string) {
  if (pathname === '/') return mainNavigation[0]
  return allNavigation.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  )
}
