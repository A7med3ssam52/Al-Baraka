import { CreditCard, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
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
import { formatCurrency, formatDate } from '@/lib/utils'

import { fetchCollectionsReport, translateReportError } from '../api'
import type { CollectionsReport } from '../types'

const paymentMethodLabels: Record<string, string> = {
  cash: 'نقدًا',
  bank: 'تحويل بنكي',
}

const paymentTypeLabels: Record<string, string> = {
  down_payment: 'مقدّم عقد',
  installment: 'قسط',
}

export function CollectionsReportPanel({ branches }: { branches: { id: string; name: string }[] }) {
  const { hasPermission } = useAuth()
  const [report, setReport] = useState<CollectionsReport | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [branchId, setBranchId] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchCollectionsReport({ from, to, branchId: branchId || null })
      .then((result) => {
        if (!active) return
        setReport(result)
        setError(null)
      })
      .catch((loadError) => {
        if (active) setError(translateReportError(loadError))
      })
    return () => {
      active = false
    }
  }, [from, to, branchId, reloadKey])

  function reload() {
    setReport(null)
    setReloadKey((key) => key + 1)
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1.5 text-sm">
          <span className="font-semibold">من تاريخ</span>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-semibold">إلى تاريخ</span>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        {hasPermission('settings.view') && branches.length > 0 ? (
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">الفرع</span>
            <Select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">كل الفروع</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <div className="flex items-end">
          <Button type="button" variant="outline" className="w-full" onClick={reload}>
            <RefreshCw className="size-4" /> تحديث
          </Button>
        </div>
      </Card>

      {error ? (
        <Card className="flex items-center gap-2 p-4 text-sm text-destructive">
          <TriangleAlert className="size-4" />
          {error}
        </Card>
      ) : !report ? (
        <Card className="p-4">
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="إجمالي المحصّل"
              value={formatCurrency(report.summary.total_collected)}
              hint={`${report.summary.payment_count} عملية تحصيل`}
            />
            <Metric
              label="تحصيل نقدي"
              value={formatCurrency(report.summary.cash_total)}
              hint="من الخزائن النقدية"
            />
            <Metric
              label="تحصيل بنكي"
              value={formatCurrency(report.summary.bank_total)}
              hint="تحويلات وحسابات بنكية"
            />
            <Metric
              label="أقساط ومقدمات"
              value={formatCurrency(report.summary.installment_total)}
              hint={`مقدمات: ${formatCurrency(report.summary.down_payment_total)}`}
            />
          </div>

          {report.payments.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={CreditCard}
                title="لا تحصيلات في هذه الفترة"
                description="جرّب توسيع نطاق التاريخ أو إلغاء فلتر الفرع."
              />
            </Card>
          ) : (
            <Card className="m-0 p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الإيصال</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>العميل</TableHead>
                    <TableHead className="hidden md:table-cell">الفرع</TableHead>
                    <TableHead className="hidden sm:table-cell">العقد</TableHead>
                    <TableHead className="hidden sm:table-cell">الطريقة</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>المبلغ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.payments.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">
                        {row.receipt_number ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(row.payment_date)}</TableCell>
                      <TableCell className="text-xs">
                        <span className="font-mono">{row.customer_code}</span> — {row.customer_name}
                      </TableCell>
                      <TableCell className="hidden text-xs md:table-cell">
                        {row.branch_name}
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs sm:table-cell">
                        {row.contract_number ?? '—'}
                      </TableCell>
                      <TableCell className="hidden text-xs sm:table-cell">
                        {paymentMethodLabels[row.payment_method] ?? row.payment_method}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {paymentTypeLabels[row.payment_type] ?? row.payment_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-bold">
                        {formatCurrency(row.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string
  value: string
  hint?: string
  emphasis?: boolean
}) {
  return (
    <Card className={emphasis ? 'gap-1 border-destructive/40 bg-destructive/5 p-4' : 'gap-1 p-4'}>
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="text-lg font-extrabold">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  )
}
