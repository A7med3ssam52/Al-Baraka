import { Bell, CircleAlert, Info, Palette, Plus, Table2 } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

const colors = [
  { name: 'Primary', value: 'var(--primary)' },
  { name: 'Accent', value: 'var(--accent)' },
  { name: 'Success', value: 'var(--success)' },
  { name: 'Warning', value: 'var(--warning)' },
  { name: 'Destructive', value: 'var(--destructive)' },
  { name: 'Muted', value: 'var(--muted)' },
]

const buttonVariants = [
  'default',
  'accent',
  'outline',
  'secondary',
  'ghost',
  'destructive',
] as const
const badgeVariants = [
  'default',
  'secondary',
  'outline',
  'success',
  'warning',
  'destructive',
] as const

const sampleRows = [
  { name: 'أحمد محمود', type: 'بيع تقسيط', amount: '145,000 ج.م', status: 'مكتمل' },
  { name: 'شركة النور', type: 'بيع نقدي', amount: '210,000 ج.م', status: 'مكتمل' },
  { name: 'محمد السيد', type: 'حجز', amount: '35,000 ج.م', status: 'معلق' },
]

export function DesignSystemPage() {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="M0.2 — Design System"
        title="النظام التصميمي"
        description="مرجع سريع للألوان والخطوط والمكونات الأساسية. الهدف هو توحيد شكل الشاشات قبل بناء وحدات العمل."
        actions={
          <Badge variant="accent">
            <Palette className="size-3" />
            نسخة مبدئية
          </Badge>
        }
      />

      <Section title="الألوان" description="ألوان الهوية المؤقتة: كحلي داكن، ذهبي، وخلفية رملية.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {colors.map((color) => (
            <div
              key={color.name}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              <div className="h-16" style={{ backgroundColor: color.value }} />
              <div className="p-3">
                <p className="text-xs font-bold">{color.name}</p>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{color.value}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="الخطوط"
        description="خط Cairo بأوزان متعددة، مع اتجاه RTL وتباعد مناسب للعربية."
      >
        <Card>
          <CardContent className="space-y-4">
            <h1 className="text-3xl font-extrabold">عنوان رئيسي — 30px</h1>
            <h2 className="text-2xl font-bold">عنوان فرعي — 24px</h2>
            <h3 className="text-lg font-bold">عنوان قسم — 18px</h3>
            <p className="text-sm leading-8 text-muted-foreground">
              نص عادي بمسافة مريحة للقراءة: يبدأ النظام من لوحة تحكم واضحة، ثم ينتقل إلى العملاء
              والمخزون والمبيعات والأقساط. كل شاشة يجب أن تحافظ على نفس الإيقاع البصري.
            </p>
            <p className="text-xs text-muted-foreground">نص مساعد — 12px</p>
          </CardContent>
        </Card>
      </Section>

      <Section title="الأزرار" description="ستة أنماط أساسية بأحجام مختلفة للاستخدامات اليومية.">
        <Card>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {buttonVariants.map((variant) => (
                <Button key={variant} variant={variant}>
                  زر {variant}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">صغير</Button>
              <Button>افتراضي</Button>
              <Button size="lg">كبير</Button>
              <Button size="icon" aria-label="إضافة">
                <Plus />
              </Button>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="الشارات" description="حالات مختصرة للأقساط والمخزون والعمليات.">
        <div className="flex flex-wrap gap-2">
          {badgeVariants.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="الحقول" description="حقول الإدخال مع الحالة العادية والمعطلة.">
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-bold">اسم العميل</span>
              <Input placeholder="اكتب اسم العميل..." />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-bold">رقم الهاتف</span>
              <Input placeholder="01xxxxxxxxx" inputMode="tel" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-bold">حقل معطل</span>
              <Input placeholder="غير متاح حاليًا" disabled />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-bold">حقل به خطأ</span>
              <Input
                defaultValue="قيمة غير صحيحة"
                className="border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20"
              />
              <span className="text-[11px] font-semibold text-destructive">
                هذه القيمة غير مقبولة.
              </span>
            </label>
          </CardContent>
        </Card>
      </Section>

      <Section title="البطاقات والجداول" description="استخدام موحد للمحتوى والبيانات.">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>بطاقة تجريبية</CardTitle>
                <CardDescription className="mt-1.5">وصف مختصر للمحتوى</CardDescription>
              </div>
              <Badge variant="success">نشط</Badge>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sampleRows.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-bold">{row.name}</TableCell>
                      <TableCell className="text-muted-foreground">{row.type}</TableCell>
                      <TableCell>{row.amount}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === 'مكتمل' ? 'success' : 'warning'}>
                          {row.status}
                        </Badge>
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
                <CardTitle>تنبيه</CardTitle>
                <CardDescription className="mt-1.5">رسالة معلوماتية للمستخدم</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-warning">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <p className="text-xs leading-6">
                  يوجد 3 أقساط تحتاج متابعة خلال الأيام السبعة القادمة.
                </p>
              </div>
              <div className="flex gap-3 rounded-lg border border-border bg-muted/50 p-3 text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-xs leading-6">هذه بيانات تجريبية وليست عمليات حقيقية.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="التفاعل" description="نافذة تأكيد، رسائل Toast، وتلميحات Tooltip.">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">فتح نافذة تأكيد</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>تأكيد العملية</DialogTitle>
                  <DialogDescription>
                    هذه نافذة تجريبية لتأكيد إجراء قبل تنفيذه. لن يتم حفظ أي بيانات.
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-lg bg-muted/60 p-4 text-sm leading-7 text-muted-foreground">
                  تأكد من مراجعة بيانات العميل والمبلغ قبل المتابعة.
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    إلغاء
                  </Button>
                  <Button
                    variant="accent"
                    onClick={() => {
                      setDialogOpen(false)
                      toast.success('تم تأكيد العملية التجريبية.')
                    }}
                  >
                    تأكيد
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button variant="outline" onClick={() => toast.success('تم حفظ البيانات بنجاح.')}>
              Toast نجاح
            </Button>
            <Button variant="outline" onClick={() => toast.info('هذه رسالة معلوماتية.')}>
              Toast معلومات
            </Button>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" aria-label="التنبيهات">
                  <Bell />
                </Button>
              </TooltipTrigger>
              <TooltipContent>مركز التنبيهات</TooltipContent>
            </Tooltip>
          </CardContent>
        </Card>
      </Section>

      <Section
        title="التحميل والحالات الفارغة"
        description="شاشات الانتظار والحالات التي لا توجد فيها بيانات."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Loading Skeleton</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-44" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </CardContent>
          </Card>

          <EmptyState
            icon={Table2}
            title="لا توجد عمليات بعد"
            description="عند إضافة أول عملية بيع أو تحصيل، ستظهر هنا تلقائيًا."
            action={
              <Button
                variant="outline"
                onClick={() => toast.info('هذا زر تجريبي داخل النظام التصميمي.')}
              >
                <Plus />
                إضافة أول عملية
              </Button>
            }
          />
        </div>
      </Section>
    </div>
  )
}
