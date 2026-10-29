import { Boxes, RefreshCw, Search, TriangleAlert } from 'lucide-react'
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
import { formatCurrency } from '@/lib/utils'

import { fetchInventoryReport, translateReportError } from '../api'
import type { InventoryReport } from '../types'

interface Props {
  branches: { id: string; code: string; name: string }[]
}

export function InventoryReportPanel({ branches }: Props) {
  const [report, setReport] = useState<InventoryReport | null>(null)
  const [branchId, setBranchId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchInventoryReport({ branchId: branchId || null, search })
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
  }, [branchId, search, reloadKey])

  function reload() {
    setReport(null)
    setReloadKey((key) => key + 1)
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <form
          className="relative flex-1"
          onSubmit={(event) => {
            event.preventDefault()
            setSearch(searchInput.trim())
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="بحث بالكود أو اسم المنتج"
            className="pr-9"
          />
        </form>
        <Select
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
          className="w-full sm:w-52"
        >
          <option value="">كل فروعي</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name} ({branch.code})
            </option>
          ))}
        </Select>
        <Button type="button" variant="outline" onClick={reload}>
          <RefreshCw className="size-4" /> تحديث
        </Button>
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
            <Metric label="قيمة المخزون" value={formatCurrency(report.summary.total_value)} />
            <Metric label="إجمالي الكميات" value={String(report.summary.total_quantity)} />
            <Metric label="أصناف" value={String(report.summary.product_count)} hint="منتج × فرع" />
            <Metric
              label="أصناف تحت حد الطلب"
              value={String(report.summary.low_stock_count)}
              emphasis={report.summary.low_stock_count > 0}
            />
          </div>

          {report.rows.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={Boxes}
                title="لا أرصدة مطابقة"
                description="جرّب تغيير الفرع أو كلمة البحث."
              />
            </Card>
          ) : (
            <Card className="m-0 p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الفرع</TableHead>
                    <TableHead>الصنف</TableHead>
                    <TableHead>الرصيد</TableHead>
                    <TableHead className="hidden sm:table-cell">حد الطلب</TableHead>
                    <TableHead className="hidden md:table-cell">تكلفة الوحدة</TableHead>
                    <TableHead>قيمة المخزون</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={`${row.branch_id}-${row.product_id}`}>
                      <TableCell className="text-xs">{row.branch_name}</TableCell>
                      <TableCell className="text-xs">
                        <span className="font-mono">{row.product_code}</span> — {row.product_name}
                        {row.unit_name ? (
                          <span className="text-muted-foreground"> ({row.unit_name})</span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <span className={row.is_low ? 'font-bold text-destructive' : 'font-bold'}>
                          {row.quantity}
                        </span>
                        {row.is_low ? (
                          <Badge variant="warning" className="ms-2">
                            تحت الحد
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden text-xs sm:table-cell">
                        {row.reorder_level}
                      </TableCell>
                      <TableCell className="hidden text-xs md:table-cell">
                        {formatCurrency(row.unit_cost)}
                      </TableCell>
                      <TableCell className="text-xs font-semibold">
                        {formatCurrency(row.stock_value)}
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
