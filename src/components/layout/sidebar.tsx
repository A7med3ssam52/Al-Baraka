import { Building2, MoreHorizontal, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { mainNavigation, secondaryNavigation } from '@/lib/navigation'
import { APP_INFO } from '@/lib/constants'
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
          {mainNavigation.map((item) => (
            <li key={item.href}>
              <SidebarLink {...item} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>

        <p className="px-3 pt-5 pb-2 text-[10px] font-bold tracking-[0.18em] text-sidebar-muted">
          النظام
        </p>
        <ul className="space-y-1">
          {secondaryNavigation.map((item) => (
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
          <p className="mt-1 text-sm font-bold">M0.3 — Supabase وتسجيل الدخول</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-3/5 rounded-full bg-sidebar-active" />
          </div>
          <p className="mt-2 text-[10px] text-sidebar-muted">3 من 5 مراحل في M0</p>
        </div>

        <div className="mt-3 flex items-center gap-3 px-1">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-sidebar-active text-xs font-extrabold text-sidebar-active-foreground">
            أ
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold">أحمد عبد الهادي</p>
            <p className="truncate text-[10px] text-sidebar-muted">مدير المعرض</p>
          </div>
          <MoreHorizontal className="ms-auto size-4 shrink-0 text-sidebar-muted" />
        </div>
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
