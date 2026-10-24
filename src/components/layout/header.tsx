import {
  Bell,
  Building2,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  Settings,
  UserRound,
} from 'lucide-react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { APP_INFO } from '@/lib/constants'

interface HeaderProps {
  onOpenSidebar: () => void
}

export function Header({ onOpenSidebar }: HeaderProps) {
  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    toast.info('البحث الموحد سيتوفر في مرحلة لاحقة.')
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onOpenSidebar}
          aria-label="فتح قائمة التنقل"
        >
          <Menu />
        </Button>

        <Breadcrumbs />

        <form
          className="ms-auto hidden w-full max-w-64 md:block"
          onSubmit={handleSearch}
          role="search"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="search"
              aria-label="بحث سريع"
              placeholder="بحث سريع..."
              className="h-9 border-transparent bg-muted/70 ps-9 shadow-none focus-visible:bg-card"
            />
          </div>
        </form>

        <div className="ms-auto flex items-center gap-1.5 md:ms-0">
          <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold shadow-sm sm:flex">
            <Building2 className="size-3.5 text-accent-foreground" />
            <span className="font-mono tracking-wide">{APP_INFO.branch.code}</span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative"
                aria-label="التنبيهات"
                onClick={() => toast.info('مركز التنبيهات سيتوفر في M8.5.')}
              >
                <Bell />
                <span className="absolute top-2 end-2 size-2 rounded-full bg-accent ring-2 ring-background" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>التنبيهات</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" className="h-10 gap-2 px-1.5 sm:px-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
                  أ
                </span>
                <span className="hidden text-start sm:block">
                  <span className="block text-xs font-bold">أحمد عبد الهادي</span>
                  <span className="block text-[10px] text-muted-foreground">مدير المعرض</span>
                </span>
                <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>الحساب</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => toast.info('الملف الشخصي سيتوفر في M1.3.')}>
                <UserRound className="size-4" />
                الملف الشخصي
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings className="size-4" />
                  الإعدادات
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => toast.info('تسجيل الدخول والخروج سيتوفر في M0.3.')}
              >
                <LogOut className="size-4" />
                تسجيل الخروج
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
