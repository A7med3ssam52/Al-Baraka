import { ChevronLeft, Home } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

import { getNavItem } from '@/lib/navigation'

export function Breadcrumbs() {
  const { pathname } = useLocation()
  const current = getNavItem(pathname)
  const isHome = pathname === '/dashboard'
  const fallbackLabels: Record<string, string> = {
    '/403': 'غير مصرح',
    '/loading': 'جارٍ التحميل',
  }
  const currentLabel = current?.label ?? fallbackLabels[pathname] ?? 'صفحة غير موجودة'

  return (
    <nav aria-label="مسار التنقل" className="min-w-0 flex-1 overflow-hidden">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm whitespace-nowrap">
        {isHome ? (
          <li className="flex min-w-0 items-center gap-1.5 font-semibold text-foreground">
            <Home className="size-4 shrink-0 text-accent" />
            <span className="truncate">لوحة التحكم</span>
          </li>
        ) : (
          <>
            <li className="shrink-0">
              <Link
                to="/dashboard"
                aria-label="الرئيسية"
                className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <Home className="size-4" />
                <span className="hidden sm:inline">الرئيسية</span>
              </Link>
            </li>
            <li aria-hidden="true" className="shrink-0">
              <ChevronLeft className="size-3.5 text-muted-foreground/60" />
            </li>
            <li className="min-w-0 flex-1 truncate font-semibold text-foreground">{currentLabel}</li>
          </>
        )}
      </ol>
    </nav>
  )
}
