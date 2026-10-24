import { useState } from 'react'
import { Outlet } from 'react-router-dom'

import { Header } from '@/components/layout/header'
import { Sidebar, SidebarContent } from '@/components/layout/sidebar'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { APP_INFO } from '@/lib/constants'

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
      <Sidebar />

      <div className="flex min-h-screen min-w-0 flex-col">
        <Header onOpenSidebar={() => setMobileOpen(true)} />

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>

        <footer className="border-t border-border/70 px-4 py-4 text-xs text-muted-foreground sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-2">
            <span>
              {APP_INFO.name} — {APP_INFO.branch.name}
            </span>
            <span className="text-accent" aria-hidden="true">
              •
            </span>
            <span className="font-mono">{APP_INFO.branch.code}</span>
            <span className="ms-auto">نسخة التأسيس 0.1.0</span>
          </div>
        </footer>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="start"
          className="w-72 max-w-[85vw] border-0 bg-sidebar p-0 text-sidebar-foreground [&>button]:top-5 [&>button]:end-4 [&>button]:text-sidebar-muted [&>button]:hover:bg-sidebar-accent [&>button]:hover:text-sidebar-foreground"
        >
          <SheetTitle className="sr-only">قائمة التنقل</SheetTitle>
          <SheetDescription className="sr-only">
            انتقل بين شاشات نظام إدارة معرض البركة.
          </SheetDescription>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  )
}
