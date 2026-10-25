import { Building2, MoreHorizontal, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'

import { getRoleLabel } from '@/features/auth/roles'
import { useAuth } from '@/features/auth/use-auth'
import { mainNavigation, secondaryNavigation } from '@/lib/navigation'
import { APP_INFO, STAGE } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface SidebarLinkProps {
  href: string
  label: string
  icon: LucideIcon
  onNavigate?: () => void
}

function SidebarLink({ href, label, icon: Icon, onNavigate }: SidebarLinkProps) {
  return (
    <NavLink
      to={href}
      end={href === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
          isActive
            ? 'bg-sidebar-active text-sidebar-active-foreground shadow-sm'
            : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground',
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      <span>{label}</span>
    </NavLink>
  )
}

interface SidebarContentProps {
  onNavigate?: () => void
}

export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const { appUser, hasPermission } = useAuth()
  const displayName = appUser?.name ?? 'مستخدم'
  const roleLabel = getRoleLabel(appUser?.role)
  const initial = displayName.trim().charAt(0) || 'م'

  const visibleMainNavigation = mainNavigation.filter(
    (item) => !item.permission || hasPermission(item.permission),
  )
  const visibleSecondaryNavigation = secondaryNavigation.filter(
    (item) => !item.permission || hasPermission(item.permission),
  )
  const progress = Math.round((STAGE.completedInMain / STAGE.totalInMain) * 100)

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-sidebar-active/40 bg-sidebar-accent text-lg font-extrabold text-sidebar-active">
          ب
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-[0.22em] text-sidebar-muted">AL BARAKA</p>
          <p className="truncate text-base font-extrabold">{APP_INFO.name}</p>
        </div>
      </div>

      <div className="mx-4 rounded-xl border border-sidebar-border bg-white/5 p-3">
        <div className="flex items-center gap-2 text-[10px] font-semibold text-sidebar-muted">
          <Building2 className="size-3.5" />
          الفرع الحالي
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="truncate text-sm font-bold">{APP_INFO.branch.name}</span>
          <span className="rounded bg-sidebar-active/15 px-2 py-0.5 text-[10px] font-bold text-sidebar-active">
            {APP_INFO.branch.code}
          </span>
        </div>
      </div>

      <nav className="scrollbar-thin mt-6 flex-1 overflow-y-auto px-3 pb-4">
        <p className="px-3 pb-2 text-[10px] font-bold tracking-[0.18em] text-sidebar-muted">
          إدارة المعرض
        </p>
        <ul className="space-y-1">
          {visibleMainNavigation.map((item) => (
            <li key={item.href}>
              <SidebarLink {...item} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>

        <p className="px-3 pt-5 pb-2 text-[10px] font-bold tracking-[0.18em] text-sidebar-muted">
          النظام
        </p>
        <ul className="space-y-1">
          {visibleSecondaryNavigation.map((item) => (
            <li key={item.href}>
              <SidebarLink {...item} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="rounded-xl bg-sidebar-accent/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold text-sidebar-active">المرحلة الحالية</p>
            <Settings className="size-3.5 text-sidebar-muted" />
          </div>
          <p className="mt-1 text-sm font-bold">
            {STAGE.current} — {STAGE.currentTitle}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-sidebar-active"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-[10px] text-sidebar-muted">
            {STAGE.completedInMain} من {STAGE.totalInMain} مراحل في {STAGE.mainStage}
          </p>
        </div>

        <Link
          to="/profile"
          onClick={onNavigate}
          className="mt-3 flex items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-white/5"
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-sidebar-active text-xs font-extrabold text-sidebar-active-foreground">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold">{displayName}</p>
            <p className="truncate text-[10px] text-sidebar-muted">{roleLabel}</p>
          </div>
          <MoreHorizontal className="ms-auto size-4 shrink-0 text-sidebar-muted" />
        </Link>
      </div>
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 lg:block">
      <SidebarContent />
    </aside>
  )
}
