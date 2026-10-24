import {
  ArrowDownRight,
  ArrowUpRight,
  Bike,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  Package,
  Plus,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, formatCurrency } from '@/lib/utils'

interface Stat {
  label: string
  value: string
  delta: string
  hint: string
  icon: LucideIcon
  tone: 'positive' | 'neutral'
}

const stats: Stat[] = [
  {
    label: 'مبيعات الشهر',
    value: formatCurrency(1_250_000),
    delta: '+12.5%',
    hint: 'مقارنة بالشهر السابق',
    icon: CircleDollarSign,
    tone: 'positive',
  },
  {
    label: 'مبيعات اليوم',
    value: formatCurrency(85_000),
    delta: '+3 عمليات',
    hint: 'بيع نقدي وتقسيط',
    icon: ShoppingCart,
    tone: 'positive',
  },
  {
    label: 'أقساط مستحقة',
    value: formatCurrency(32_000),
    delta: '4 عملاء',
    hint: 'خلال الأيام السبعة القادمة',
    icon: CreditCard,
    tone: 'neutral',
  },
  {
    label: 'مخزون متاح',
    value: '18 وحدة',
    delta: '4 فئات',
    hint: 'تكاتك وموتوسيكلات ومركبات وسكوتر',
    icon: Package,
    tone: 'neutral',
  },
]

const salesChart = [
  { day: 'السبت', value: 46 },
  { day: 'الأحد', value: 68 },
  { day: 'الاثنين', value: 54 },
  { day: 'الثلاثاء', value: 82 },
  { day: 'الأربعاء', value: 61 },
  { day: 'الخميس', value: 94 },
  { day: 'الجمعة', value: 38 },
]

const installmentAlerts = [
  { name: 'محمد السيد', amount: 8_500, due: 'غدًا', severity: 'مرتفع' },
  { name: 'سارة حسن', amount: 4_200, due: 'بعد يومين', severity: 'متوسط' },
  { name: 'شركة النور', amount: 15_000, due: 'بعد 4 أيام', severity: 'مرتفع' },
]

const recentOperations = [
  {
    customer: 'أحمد محمود',
    type: 'بيع تقسيط',
    amount: 145_000,
    status: 'مكتمل',
    date: '24 أكتوبر',
  },
  {
    customer: 'شركة النور',
    type: 'بيع نقدي',
    amount: 210_000,
    status: 'مكتمل',
    date: '24 أكتوبر',
  },
  {
    customer: 'محمد السيد',
    type: 'حجز مركبة',
    amount: 35_000,
    status: 'معلق',
    date: '23 أكتوبر',
  },
  {
    customer: 'سارة حسن',
    type: 'تحصيل قسط',
    amount: 8_500,
    status: 'مكتمل',
    date: '23 أكتوبر',
  },
]

const inventorySummary = [
  { label: 'تكاتك', count: 8, total: 12, tone: 'bg-primary' },
  { label: 'موتوسيكلات', count: 6, total: 10, tone: 'bg-chart-2' },
  { label: 'مركبات', count: 3, total: 6, tone: 'bg-chart-3' },
  { label: 'سكوتر', count: 1, total: 4, tone: 'bg-chart-4' },
]

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="M0.2 — الهوية البصرية"
        title="لوحة التحكم"
        description="نظرة سريعة على حركة المعرض. البيانات المعروضة تجريبية حتى يتم ربط قاعدة البيانات في المراحل القادمة."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => toast.info('فلاتر الفترة ستتوفر مع تقارير المبيعات.')}
            >
              <CalendarDays />
              آخر 30 يومًا
            </Button>
            <Button
              variant="accent"
              onClick={() => toast.info('شاشة البيع ستتوفر في المرحلة M4.1.')}
            >
              <Plus />
              بيع جديد
            </Button>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="المؤشرات">
        {stats.map((stat) => (
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
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>حركة المبيعات</CardTitle>
              <CardDescription className="mt-1.5">آخر 7 أيام — قيمة تقريبية</CardDescription>
            </div>
            <Badge variant="success">
              <TrendingUp className="size-3" />
              +8.4%
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="flex h-56 items-end gap-2.5">
              {salesChart.map((item) => (
                <div key={item.day} className="flex h-full flex-1 flex-col items-center gap-2">
                  <div className="flex h-44 w-full items-end rounded-lg bg-muted/60 p-1">
                    <div
                      className="w-full rounded-md bg-primary/80 transition-colors hover:bg-accent"
                      style={{ height: `${item.value}%` }}
                      title={`${item.day}: ${item.value}%`}
                    />
                  </div>
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {item.day}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
              <span>إجمالي الأسبوع</span>
              <span className="font-bold text-foreground">{formatCurrency(443_000)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>تنبيهات الأقساط</CardTitle>
              <CardDescription className="mt-1.5">أقساط تحتاج متابعة</CardDescription>
            </div>
            <Badge variant="warning">3 تنبيهات</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {installmentAlerts.map((alert) => (
              <div
                key={alert.name}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{alert.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">يستحق {alert.due}</p>
                </div>
                <div className="text-end">
                  <p className="text-sm font-extrabold">{formatCurrency(alert.amount)}</p>
                  <Badge
                    variant={alert.severity === 'مرتفع' ? 'destructive' : 'warning'}
                    className="mt-1"
                  >
                    {alert.severity}
                  </Badge>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => toast.info('شاشة الأقساط ستتوفر في المرحلة M5.1.')}
            >
              عرض كل الأقساط
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>أحدث العمليات</CardTitle>
              <CardDescription className="mt-1.5">آخر 4 عمليات مسجلة</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toast.info('سجل العمليات الكامل سيتوفر في المرحلة M4.1.')}
            >
              عرض الكل
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>العميل</TableHead>
                  <TableHead className="hidden sm:table-cell">النوع</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="hidden md:table-cell">التاريخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOperations.map((operation) => (
                  <TableRow key={`${operation.customer}-${operation.date}`}>
                    <TableCell className="font-bold">{operation.customer}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {operation.type}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(operation.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={operation.status === 'مكتمل' ? 'success' : 'warning'}>
                        {operation.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {operation.date}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>ملخص المخزون</CardTitle>
              <CardDescription className="mt-1.5">توزيع الوحدات المتاحة</CardDescription>
            </div>
            <span className="grid size-9 place-items-center rounded-lg bg-accent/15 text-accent-foreground">
              <Bike className="size-4" />
            </span>
          </CardHeader>
          <CardContent className="space-y-5">
            {inventorySummary.map((item) => (
              <div key={item.label}>
                <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className={cn('size-2 rounded-full', item.tone)} />
                    {item.label}
                  </span>
                  <span className="text-muted-foreground">
                    <strong className="text-foreground">{item.count}</strong> من {item.total}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full', item.tone)}
                    style={{ width: `${(item.count / item.total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <Users className="size-4 shrink-0 text-primary" />
              <span>إجمالي 18 وحدة متاحة في فرع صان الحجر.</span>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
