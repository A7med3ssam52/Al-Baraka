import { ChevronLeft, Home } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

import { getNavItem } from '@/lib/navigation'

export function Breadcrumbs() {
  const { pathname } = useLocation()
  const current = getNavItem(pathname)
  const isHome = pathname === '/'
  const fallbackLabels: Record<string, string> = {
    '/403': 'غير مصرح',
    '/loading': 'جارٍ التحميل',
  }
  const currentLabel = current?.label ?? fallbackLabels[pathname] ?? 'صفحة غير موجودة'

  return (
    <nav aria-label="مسار التنقل" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-sm">
        {isHome ? (
          <li className="flex items-center gap-1.5 font-semibold text-foreground">
            <Home className="size-4 text-accent" />
            <span className="truncate">لوحة التحكم</span>
          </li>
        ) : (
          <>
            <li>
              <Link
                to="/"
                aria-label="الرئيسية"
                className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <Home className="size-4" />
                <span className="hidden sm:inline">الرئيسية</span>
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronLeft className="size-3.5 text-muted-foreground/60" />
            </li>
            <li className="truncate font-semibold text-foreground">{currentLabel}</li>
          </>
        )}
      </ol>
    </nav>
  )
}
