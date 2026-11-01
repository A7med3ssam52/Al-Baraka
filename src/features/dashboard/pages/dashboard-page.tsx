import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bike,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  FileText,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/features/auth/use-auth'
import { fetchDashboardOverview } from '@/features/dashboard/api'
import type { DashboardOverview } from '@/features/dashboard/api'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

interface Stat {
  label: string
  value: string
  delta: string
  hint: string
  icon: typeof CircleDollarSign | typeof ShoppingCart | typeof CreditCard | typeof Package
  tone: 'positive' | 'neutral' | 'warning'
}

const saleTypeLabels: Record<string, string> = {
  cash: 'بيع نقدي',
  installment: 'بيع تقسيط',
}

export function DashboardPage() {
  const { hasPermission } = useAuth()
  const [overview, setOverview] = useState<DashboardOverview | null>(null)

  const loading = overview === null

  const canViewReports = hasPermission('reports.view')
  const canViewVehicles = hasPermission('vehicles.view')
  const canViewInstallments = hasPermission('installments.view')
  const canViewCollections = hasPermission('collections.view')

  const load = useCallback(() => {
    fetchDashboardOverview({
      includeReports: canViewReports,
      includeVehicles: canViewVehicles,
      includeInstallments: canViewInstallments || canViewCollections,
    })
      .then((result) => setOverview(result))
      .catch(() => undefined)
  }, [canViewReports, canViewVehicles, canViewInstallments, canViewCollections])

  useEffect(load, [load])

  const sales = overview?.sales ?? null
  const collections = overview?.collections ?? null
  const inventory = overview?.inventory ?? null
  const vehicles = overview?.vehicles ?? null
  const overdue = overview?.overdue ?? null
  const counts = overview?.counts

  const approvedInvoices = (sales?.invoices ?? []).filter((row) => row.status === 'approved')
  const monthSales = sales ? sales.summary.total_amount : null
  const monthCollections = collections ? collections.summary.total_collected : null
  const overdueAmount = overdue ? overdue.reduce((sum, row) => sum + row.remaining_amount, 0) : null
  const availableUnits = vehicles ? vehicles.summary.available_count : null

  const stats: Stat[] = [
    {
      label: 'مبيعات آخر 30 يومًا',
      value: monthSales === null ? '—' : formatCurrency(monthSales),
      delta: `${sales?.summary.approved_count ?? 0} فاتورة معتمدة`,
      hint: `نقدي ${sales?.summary.cash_count ?? 0} — تقسيط ${sales?.summary.installment_count ?? 0}`,
      icon: CircleDollarSign,
      tone: (sales?.summary.total_amount ?? 0) > 0 ? 'positive' : 'neutral',
    },
    {
      label: 'مقبوضات آخر 30 يومًا',
      value: monthCollections === null ? '—' : formatCurrency(monthCollections),
      delta: `${collections?.summary.payment_count ?? 0} إيصال`,
      hint: 'أقساط ومقدمات العقود',
      icon: CreditCard,
      tone: (collections?.summary.total_collected ?? 0) > 0 ? 'positive' : 'neutral',
    },
    {
      label: 'أقساط تحتاج متابعة',
      value: overdueAmount === null ? '—' : formatCurrency(overdueAmount),
      delta: `${overdue?.length ?? 0} قسط`,
      hint: 'متأخر أو مستحق أو مدفوع جزئيًا',
      icon: AlertTriangle,
      tone: overdue && overdue.length > 0 ? 'warning' : 'neutral',
    },
    {
      label: 'مخزون متاح',
      value: availableUnits === null ? '—' : `${availableUnits} مركبة متاح`,
      delta: `${vehicles?.summary.vehicle_count ?? 0} مركبة مسجلة`,
      hint: inventory
        ? `${inventory.summary.total_quantity} صنف كمية — ${inventory.summary.low_stock_count} تحت حد الطلب`
        : 'المركبات المتاحة للبيع',
      icon: Package,
      tone: 'neutral',
    },
  ]

  const salesChart = buildWeeklyChart(approvedInvoices)
  const chartTotal = salesChart.reduce((sum, day) => sum + day.value, 0)
  const maxChartValue = Math.max(...salesChart.map((item) => item.value), 1)

  const alerts = (overdue ?? []).slice(0, 4)
  const recentOperations = approvedInvoices.slice(0, 4)
  const topStock = (inventory?.rows ?? [])
    .slice()
    .sort((a, b) => b.stock_value - a.stock_value)
    .slice(0, 4)
  const maxStockValue = Math.max(...(inventory?.rows ?? []).map((row) => row.stock_value), 1)

  return (
    <div className="space-y-6">
      <PageHeader
        title="لوحة التحكم"
        description="أرقام حقيقية من العمليات المسجلة: الفواتير، المقبوضات، والتنبيهات المشتقة من جداول الأقساط."
        actions={
          <>
            <Button variant="outline" onClick={load}>
              <RefreshCw />
              تحديث
            </Button>
            <Button variant="outline" onClick={() => (window.location.href = '/reports')}>
              <CalendarDays />
              فتح التقارير
            </Button>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="المؤشرات">
        {loading ? renderStatSkeletons() : stats.map((stat) => renderStat(stat))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>حركة المبيعات</CardTitle>
              <CardDescription className="mt-1.5">
                المبيعات المعتمدة — آخر 7 أيام حسب تاريخ الفاتورة
              </CardDescription>
            </div>
            <Badge variant="success">
              <TrendingUp className="size-3" />
              {salesChart.length > 0 ? 'نشطة' : '—'}
            </Badge>
          </CardHeader>
          <CardContent>
            {sales === null && !loading ? (
              <Card className="p-4">
                <EmptyState
                  icon={FileText}
                  title="لا توجد بيانات مبيعات"
                  description="ظهرت الأرقام هنا بعد اعتماد أول فاتورة بيع، أو إن كانت صلاحية التقارير غير متاحة اعرضها من شاشة التقارير."
                />
              </Card>
            ) : salesChart.length === 0 ? (
              <div className="flex h-56 items-center justify-center rounded-lg bg-muted/60 text-sm text-muted-foreground">
                لا مبيعات في آخر سبعة أيام
              </div>
            ) : (
              <div className="flex h-56 items-end gap-2.5">
                {salesChart.map((item) => (
                  <div key={item.day} className="flex h-full flex-1 flex-col items-center gap-2">
                    <div className="flex h-44 w-full items-end rounded-lg bg-muted/60 p-1">
                      <div
                        className="w-full rounded-md bg-primary/80 transition-colors hover:bg-accent"
                        style={{ height: `${Math.max((item.value / maxChartValue) * 100, 4)}%` }}
                        title={`${item.label}: ${formatCurrency(item.value)}`}
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {item.day}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
              <span>إجمالي الأسبوع</span>
              <span className="font-bold text-foreground">{formatCurrency(chartTotal)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>تنبيهات الأقساط</CardTitle>
              <CardDescription className="mt-1.5">
                أقدم الأقساط المستحقة والمتأخرة والمدفوعة جزئيًا
              </CardDescription>
            </div>
            <Badge variant={alerts.length > 0 ? 'warning' : 'success'}>
              {overdue ? `${overdue.length} قسط` : '—'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? <Skeleton className="h-40 w-full" /> : null}
            {!loading && overdue !== null && alerts.length === 0 ? (
              <div className="rounded-lg border border-border bg-background/60 p-4 text-center text-sm text-muted-foreground">
                لا توجد أقساط متأخرة حاليًا.
              </div>
            ) : null}
            {!loading
              ? alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{alert.customer_name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        قسط {alert.installment_no} — استحقاق {formatDate(alert.due_date)}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="text-sm font-extrabold">
                        {formatCurrency(alert.remaining_amount)}
                      </p>
                      <Badge variant="warning" className="mt-1">
                        متبقٍ
                      </Badge>
                    </div>
                  </div>
                ))
              : null}
            {hasPermission('installments.view') ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => (window.location.href = '/installments')}
              >
                شاشة الأقساط والتحصيل
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>أحدث فواتير البيع</CardTitle>
              <CardDescription className="mt-1.5">أحدث 4 فواتير معتمدة</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => (window.location.href = '/reports')}>
              كل الفواتير
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : recentOperations.length === 0 ? (
              <div className="rounded-lg bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                لا فواتير بيع معتمدة بعد.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الرقم</TableHead>
                    <TableHead className="hidden sm:table-cell">النوع</TableHead>
                    <TableHead>العميل</TableHead>
                    <TableHead>الإجمالي</TableHead>
                    <TableHead className="hidden md:table-cell">التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOperations.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono text-xs">{invoice.number}</TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {saleTypeLabels[invoice.sale_type] ?? invoice.sale_type}
                      </TableCell>
                      <TableCell className="font-bold">{invoice.customer_name}</TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(invoice.total)}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {formatDate(invoice.invoice_date)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>أعلى الأصناف قيمة في المخزون</CardTitle>
              <CardDescription className="mt-1.5">
                من تقرير المخزون الحالي{' '}
                {counts?.customers !== null && counts?.customers !== undefined
                  ? `— ${counts.customers} عميل مسجل`
                  : ''}
              </CardDescription>
            </div>
            <span className="grid size-9 place-items-center rounded-lg bg-accent/15 text-accent-foreground">
              <Bike className="size-4" />
            </span>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : topStock.length === 0 ? (
              <div className="rounded-lg bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                لا رصيد مخزون كمية مسجل.
              </div>
            ) : (
              topStock.map((item) => (
                <div key={item.product_id}>
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2 font-semibold">
                      <span className="size-2 rounded-full bg-primary" />
                      {item.product_name}
                    </span>
                    <span className="text-muted-foreground">
                      <strong className="text-foreground">{item.quantity}</strong> وحدة
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        item.is_low ? 'bg-destructive' : 'bg-primary',
                      )}
                      style={{ width: `${Math.max((item.stock_value / maxStockValue) * 100, 3)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <ShoppingCart className="size-4 shrink-0 text-primary" />
              <span>
                قيمة المخزون الكمي:{' '}
                {inventory ? formatCurrency(inventory.summary.total_value) : '—'}
              </span>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function renderStat(stat: Stat) {
  return (
    <Card key={stat.label} className="gap-3">
      <CardHeader className="items-center">
        <CardDescription className="font-semibold">{stat.label}</CardDescription>
        <span className="grid size-9 place-items-center rounded-lg bg-primary/5 text-primary">
          <stat.icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-extrabold tracking-tight">{stat.value}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[11px] font-bold',
              stat.tone === 'positive' ? 'text-success' : 'text-muted-foreground',
            )}
          >
            {stat.tone === 'positive' ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {stat.delta}
          </span>
          <span className="truncate text-[10px] text-muted-foreground">{stat.hint}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function renderStatSkeletons() {
  return Array.from({ length: 4 }).map((_, index) => (
    <Card key={`stat-skeleton-${index}`} className="gap-3">
      <CardHeader className="items-center">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-3 h-3 w-24" />
      </CardContent>
    </Card>
  ))
}

function buildWeeklyChart(
  invoices: Array<{ invoice_date: string; total: number; status: string }>,
): Array<{ day: string; label: string; value: number }> {
  const dayNames = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']

  const days: Array<{ day: string; label: string; value: number }> = []
  const today = new Date()
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - offset)
    const iso = date.toISOString().slice(0, 10)
    days.push({
      day: dayNames[(date.getDay() + 1) % 7],
      label: iso,
      value: 0,
    })
  }

  const totals = new Map(days.map((day) => [day.label, day.value]))
  for (const invoice of invoices) {
    const iso = String(invoice.invoice_date).slice(0, 10)
    if (totals.has(iso)) {
      totals.set(iso, (totals.get(iso) ?? 0) + Number(invoice.total ?? 0))
    }
  }

  return days.map((day) => ({ ...day, value: totals.get(day.label) ?? 0 }))
}
