import { FileText, RefreshCw, TriangleAlert, Truck } from 'lucide-react'
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
import { purchasePaymentLabels, purchaseStatusLabels } from '@/features/purchases/types'
import type { PurchasePaymentMethod, PurchaseStatus } from '@/features/purchases/types'
import { fetchSuppliers } from '@/features/suppliers/api'
import type { SupplierRecord } from '@/features/suppliers/types'
import { formatCurrency, formatDate } from '@/lib/utils'

import { fetchPurchasesReport, translateReportError } from '../api'
import type { PurchasesReport } from '../types'

const statusBadgeVariant: Record<string, 'secondary' | 'success' | 'destructive'> = {
  draft: 'secondary',
  approved: 'success',
  cancelled: 'destructive',
}

export function PurchasesReportPanel() {
  const [report, setReport] = useState<PurchasesReport | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchSuppliers({ status: 'all' })
      .then((rows) => {
        if (active) setSuppliers(rows)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    fetchPurchasesReport({ from, to, supplierId: supplierId || null })
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
  }, [from, to, supplierId, reloadKey])

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
        <label className="grid gap-1.5 text-sm">
          <span className="font-semibold">المورد</span>
          <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="">كل الموردين</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.code} — {supplier.full_name}
              </option>
            ))}
          </Select>
        </label>
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
              label="مشتريات معتمدة"
              value={formatCurrency(report.summary.approved_total)}
              hint={`${report.summary.approved_count} فاتورة معتمدة`}
            />
            <Metric
              label="مدفوع"
              value={formatCurrency(report.summary.paid_total)}
              hint={`${report.summary.supplier_count} مورد`}
            />
            <Metric
              label="متبقي"
              value={formatCurrency(report.summary.remaining_total)}
              emphasis={report.summary.remaining_total > 0}
            />
            <Metric
              label="مسودات"
              value={formatCurrency(report.summary.draft_total)}
              hint={`${report.summary.draft_count} مسودة`}
            />
          </div>

          {report.by_supplier.length > 0 ? (
            <Card className="gap-3 p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Truck className="size-4" /> حسب المورد
              </h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المورد</TableHead>
                    <TableHead className="hidden sm:table-cell">الفواتير</TableHead>
                    <TableHead>الإجمالي</TableHead>
                    <TableHead className="hidden sm:table-cell">المدفوع</TableHead>
                    <TableHead>المتبقي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.by_supplier.map((row) => (
                    <TableRow key={row.supplier_id}>
                      <TableCell className="text-xs">
                        <span className="font-mono">{row.supplier_code}</span> — {row.supplier_name}
                      </TableCell>
                      <TableCell className="hidden text-xs sm:table-cell">
                        {row.invoice_count}
                      </TableCell>
                      <TableCell className="text-xs">{formatCurrency(row.total)}</TableCell>
                      <TableCell className="hidden text-xs sm:table-cell">
                        {formatCurrency(row.paid_amount)}
                      </TableCell>
                      <TableCell className="text-xs font-bold">
                        {formatCurrency(row.remaining_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : null}

          {report.invoices.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={FileText}
                title="لا فواتير في هذه الفترة"
                description="جرّب توسيع نطاق التاريخ أو اختيار مورد آخر."
              />
            </Card>
          ) : (
            <Card className="m-0 p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الرقم</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>المورد</TableHead>
                    <TableHead className="hidden md:table-cell">الفرع</TableHead>
                    <TableHead className="hidden md:table-cell">السداد</TableHead>
                    <TableHead>الإجمالي</TableHead>
                    <TableHead className="hidden sm:table-cell">المدفوع</TableHead>
                    <TableHead>المتبقي</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.invoices.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.number}</TableCell>
                      <TableCell className="text-xs">{formatDate(row.invoice_date)}</TableCell>
                      <TableCell className="text-xs">{row.supplier_name}</TableCell>
                      <TableCell className="hidden text-xs md:table-cell">
                        {row.branch_name}
                      </TableCell>
                      <TableCell className="hidden text-xs md:table-cell">
                        {purchasePaymentLabels[row.payment_method as PurchasePaymentMethod] ??
                          row.payment_method}
                      </TableCell>
                      <TableCell className="text-xs">{formatCurrency(row.total)}</TableCell>
                      <TableCell className="hidden text-xs sm:table-cell">
                        {formatCurrency(row.paid_amount)}
                      </TableCell>
                      <TableCell className="text-xs font-semibold">
                        {formatCurrency(row.remaining_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant[row.status] ?? 'secondary'}>
                          {purchaseStatusLabels[row.status as PurchaseStatus] ?? row.status}
                        </Badge>
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
