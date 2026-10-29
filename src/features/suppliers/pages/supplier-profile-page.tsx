import { ArrowRight, FileText, Printer, Receipt, Truck, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { DocumentsPanel } from '@/features/documents/components/documents-panel'
import { purchasePaymentLabels, purchaseStatusLabels } from '@/features/purchases/types'
import type { PurchaseStatus } from '@/features/purchases/types'
import {
  fetchSupplierProfile,
  fetchSupplierStatement,
  translateSupplierError,
} from '@/features/suppliers/api'
import {
  supplierStatusLabels,
  supplierTransactionLabels,
  type SupplierProfile,
  type SupplierStatementRow,
} from '@/features/suppliers/types'
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils'

type ProfileTab = 'data' | 'purchases' | 'statement' | 'documents'

const tabs: { id: ProfileTab; label: string }[] = [
  { id: 'data', label: 'بيانات المورد' },
  { id: 'purchases', label: 'المشتريات' },
  { id: 'statement', label: 'كشف الحساب' },
  { id: 'documents', label: 'المستندات' },
]

const statusBadgeVariant: Record<PurchaseStatus, 'secondary' | 'success' | 'destructive'> = {
  draft: 'secondary',
  approved: 'success',
  cancelled: 'destructive',
}

export function SupplierProfilePage() {
  const { supplierId } = useParams<{ supplierId: string }>()
  const [profile, setProfile] = useState<SupplierProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<ProfileTab>('data')

  useEffect(() => {
    let active = true
    if (!supplierId) return
    fetchSupplierProfile(supplierId)
      .then((row) => {
        if (active) {
          setProfile(row)
          setError(null)
        }
      })
      .catch((loadError) => {
        if (active) setError(translateSupplierError(loadError))
      })
    return () => {
      active = false
    }
  }, [supplierId])

  if (!supplierId) {
    return <Card className="p-6 text-sm text-destructive">معرّف المورد غير موجود في الرابط.</Card>
  }

  if (error) {
    return <Card className="p-6 text-sm text-destructive">{error}</Card>
  }

  if (!profile) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-md" />
          <Skeleton className="h-9 w-64" />
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  const { supplier, totals } = profile
  const currency = 'EGP'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/suppliers"
            className="grid size-8 place-items-center rounded-md hover:bg-muted"
            aria-label="رجوع إلى قائمة الموردين"
          >
            <ArrowRight className="size-4" />
          </Link>
          <span className="font-mono text-sm text-muted-foreground">{supplier.code}</span>
          <span className="text-xl font-extrabold">{supplier.full_name}</span>
          <Badge
            variant={
              supplier.status === 'active'
                ? 'success'
                : supplier.status === 'inactive'
                  ? 'warning'
                  : 'secondary'
            }
          >
            {supplierStatusLabels[supplier.status]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {supplier.branch_name ? `${supplier.branch_name} • ` : ''}
          {supplier.address || 'ملف المورد ومشترياته وكشف حسابه.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={Truck}
          label="إجمالي المشتريات"
          value={formatCurrency(totals.invoiced_total, currency)}
        />
        <SummaryCard
          icon={Wallet}
          label="إجمالي المدفوع"
          value={formatCurrency(totals.paid_total, currency)}
        />
        <SummaryCard
          icon={Receipt}
          label="الرصيد المستحق"
          value={formatCurrency(totals.balance, currency)}
          emphasis
        />
        <SummaryCard
          icon={FileText}
          label="عدد الفواتير"
          value={String(totals.invoice_count)}
          hint={
            totals.last_invoice_date
              ? `آخر فاتورة ${formatDate(totals.last_invoice_date)}`
              : undefined
          }
        />
      </div>

      <nav
        aria-label="تبويبات ملف المورد"
        className="-mx-1 flex gap-1 overflow-x-auto rounded-lg border bg-card px-1 py-1 text-sm"
      >
        {tabs.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              'shrink-0 rounded-md px-3 py-2 font-semibold transition-colors',
              tab === item.id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'data' ? <SupplierDataPanel profile={profile} /> : null}
      {tab === 'purchases' ? <SupplierPurchasesPanel profile={profile} /> : null}
      {tab === 'statement' ? (
        <SupplierStatementPanel supplierId={supplier.id} balance={totals.balance} />
      ) : null}
      {tab === 'documents' ? (
        <DocumentsPanel ownerType="supplier" ownerId={supplier.id} ownerLabel={supplier.code} />
      ) : null}
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  emphasis,
}: {
  icon: typeof Truck
  label: string
  value: string
  hint?: string
  emphasis?: boolean
}) {
  return (
    <Card className={cn('gap-1 p-4', emphasis ? 'border-accent/60 bg-accent/5' : undefined)}>
      <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <p className="text-lg font-extrabold">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  )
}

function SupplierDataPanel({ profile }: { profile: SupplierProfile }) {
  const { supplier } = profile
  const rows: { label: string; value: string | null }[] = [
    { label: 'الاسم بالكامل', value: supplier.full_name },
    { label: 'الكود', value: supplier.code },
    { label: 'جهة الاتصال', value: supplier.contact_name },
    { label: 'الموبايل', value: supplier.phone },
    { label: 'هاتف إضافي', value: supplier.phone2 },
    { label: 'السجل الضريبي', value: supplier.tax_number },
    { label: 'العنوان', value: supplier.address },
    { label: 'الفرع', value: supplier.branch_name },
    { label: 'الحالة', value: supplierStatusLabels[supplier.status] },
    { label: 'ملاحظات', value: supplier.notes },
    { label: 'أُضيف في', value: formatDateTime(supplier.created_at) },
  ]

  return (
    <Card className="p-4">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-xs font-bold text-muted-foreground">{row.label}</dt>
            <dd className="mt-1 truncate font-semibold">{row.value || '—'}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

function SupplierPurchasesPanel({ profile }: { profile: SupplierProfile }) {
  if (profile.invoices.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={FileText}
          title="لا فواتير شراء لهذا المورد"
          description="أنشئ فاتورة شراء من شاشة المشتريات وستظهر هنا بعد الحفظ."
        />
      </Card>
    )
  }

  return (
    <Card className="m-0 p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>الرقم</TableHead>
            <TableHead>التاريخ</TableHead>
            <TableHead>الإجمالي</TableHead>
            <TableHead className="hidden sm:table-cell">المدفوع</TableHead>
            <TableHead className="hidden sm:table-cell">المتبقي</TableHead>
            <TableHead className="hidden md:table-cell">السداد</TableHead>
            <TableHead>الحالة</TableHead>
            <TableHead className="text-left">إجراءات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {profile.invoices.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell className="font-mono text-xs">{invoice.number}</TableCell>
              <TableCell className="text-xs">{formatDate(invoice.invoice_date)}</TableCell>
              <TableCell className="text-xs font-semibold">
                {formatCurrency(invoice.total)}
              </TableCell>
              <TableCell className="hidden text-xs sm:table-cell">
                {formatCurrency(invoice.paid_amount)}
              </TableCell>
              <TableCell className="hidden text-xs sm:table-cell">
                {formatCurrency(invoice.remaining_amount)}
              </TableCell>
              <TableCell className="hidden text-xs md:table-cell">
                {purchasePaymentLabels[invoice.payment_method]}
              </TableCell>
              <TableCell>
                <Badge variant={statusBadgeVariant[invoice.status]}>
                  {purchaseStatusLabels[invoice.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-left">
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/inventory/purchases/${invoice.id}/print`}>
                    <Printer className="size-4" /> طباعة
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

function SupplierStatementPanel({ supplierId, balance }: { supplierId: string; balance: number }) {
  const [rows, setRows] = useState<SupplierStatementRow[] | undefined>(undefined)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchSupplierStatement(supplierId, { from, to })
      .then((result) => {
        if (!active) return
        setRows(result)
        setError(null)
      })
      .catch((loadError) => {
        if (active) setError(translateSupplierError(loadError))
      })
    return () => {
      active = false
    }
  }, [supplierId, from, to, reloadKey])

  const loading = rows === undefined

  function reload() {
    setRows(undefined)
    setReloadKey((key) => key + 1)
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <label className="grid gap-1.5 text-sm">
          <span className="font-semibold">من تاريخ</span>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-semibold">إلى تاريخ</span>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <Button type="button" variant="outline" onClick={reload}>
          تحديث الكشف
        </Button>
        <p className="text-xs text-muted-foreground sm:ms-auto">
          رصيد المورد الحالي:{' '}
          <strong className="text-sm text-foreground">{formatCurrency(balance)}</strong>
        </p>
      </Card>

      {error ? (
        <Card className="p-4 text-sm text-destructive">{error}</Card>
      ) : loading && rows === undefined ? (
        <Card className="p-4">
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : !rows || rows.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Receipt}
            title="لا حركات في هذه الفترة"
            description="تظهر الحركات بعد اعتماد فاتورة شراء أو تسجيل سداد."
          />
        </Card>
      ) : (
        <Card className="m-0 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>التاريخ</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead className="hidden md:table-cell">المرجع</TableHead>
                <TableHead className="hidden lg:table-cell">البيان</TableHead>
                <TableHead>مدين</TableHead>
                <TableHead>دائن</TableHead>
                <TableHead>الرصيد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.transaction_id}>
                  <TableCell className="text-xs">{formatDate(row.transaction_date)}</TableCell>
                  <TableCell className="text-xs">
                    {supplierTransactionLabels[row.transaction_type]}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">
                    {row.reference_number || '—'}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                    {row.description || '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.debit > 0 ? formatCurrency(row.debit) : '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.credit > 0 ? formatCurrency(row.credit) : '—'}
                  </TableCell>
                  <TableCell className="text-xs font-bold">
                    {formatCurrency(row.running_balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
