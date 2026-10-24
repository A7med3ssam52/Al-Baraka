import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Bike,
  CreditCard,
  FileText,
  LayoutDashboard,
  Palette,
  Settings,
  ShoppingCart,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  description?: string
}

export const mainNavigation: NavItem[] = [
  {
    label: 'لوحة التحكم',
    href: '/',
    icon: LayoutDashboard,
    description: 'نظرة عامة على حركة المعرض',
  },
  {
    label: 'العملاء',
    href: '/customers',
    icon: Users,
    description: 'ملفات العملاء وجهات الاتصال',
  },
  {
    label: 'المخزون',
    href: '/inventory',
    icon: Bike,
    description: 'المركبات والمنتجات والقطع',
  },
  {
    label: 'المبيعات',
    href: '/sales',
    icon: ShoppingCart,
    description: 'البيع النقدي والتقسيط والعقود',
  },
  {
    label: 'الأقساط والتحصيل',
    href: '/installments',
    icon: CreditCard,
    description: 'جداول الأقساط والتحصيلات',
  },
  {
    label: 'الخزنة والمصروفات',
    href: '/treasury',
    icon: Wallet,
    description: 'الخزنة والبنوك والمصروفات',
  },
  {
    label: 'المستندات',
    href: '/documents',
    icon: FileText,
    description: 'الصور والعقود والمستندات',
  },
  {
    label: 'التقارير',
    href: '/reports',
    icon: BarChart3,
    description: 'تقارير المبيعات والأرباح',
  },
]

export const secondaryNavigation: NavItem[] = [
  {
    label: 'النظام التصميمي',
    href: '/design-system',
    icon: Palette,
    description: 'مكونات الواجهة والألوان',
  },
  {
    label: 'الإعدادات',
    href: '/settings',
    icon: Settings,
    description: 'إعدادات المعرض والمستخدمين',
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
