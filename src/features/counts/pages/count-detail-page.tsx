import {
  ArrowRight,
  ClipboardCheck,
  CheckCircle2,
  RefreshCw,
  Save,
  Search,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'

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
import { useAuth } from '@/features/auth/use-auth'
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils'

import {
  approveStockCount,
  cancelStockCount,
  fetchStockCount,
  translateCountError,
  updateStockCount,
} from '../api'
import {
  stockCountStatusBadge,
  stockCountStatusLabels,
  type StockCountDetail,
  type StockCountItem,
} from '../types'

export function CountDetailPage() {
  const { countId } = useParams<{ countId: string }>()
  const { hasPermission } = useAuth()
  const [detail, setDetail] = useState<StockCountDetail | null>(null)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'approve' | 'cancel' | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const canEdit = hasPermission('inventory_counts.create')
  const canApprove = hasPermission('inventory_counts.approve')

  useEffect(() => {
    let active = true
    if (!countId) return
    fetchStockCount(countId)
      .then((row) => {
        if (!active) return
        setDetail(row)
        setQuantities(
          Object.fromEntries(row.items.map((item) => [item.product_id, String(item.counted_qty)])),
        )
        setError(null)
      })
      .catch((loadError) => {
        if (active) setError(translateCountError(loadError))
      })
    return () => {
      active = false
    }
  }, [countId, reloadKey])

  const isDraft = detail?.count.status === 'draft'
  const editable = Boolean(isDraft && canEdit)

  const rows = useMemo(() => {
    if (!detail) return []
    const term = search.trim().toLowerCase()
    if (!term) return detail.items
    return detail.items.filter(
      (item) =>
        item.product_code.toLowerCase().includes(term) ||
        item.product_name.toLowerCase().includes(term),
    )
  }, [detail, search])

  const liveDifference = useMemo(() => {
    if (!detail) return { count: 0, value: 0 }
    return detail.items.reduce(
      (acc, item) => {
        const counted = Number(quantities[item.product_id] ?? item.counted_qty)
        const difference = counted - item.system_qty
        if (difference !== 0) {
          acc.count += 1
          acc.value += difference * item.unit_cost
        }
        return acc
      },
      { count: 0, value: 0 },
    )
  }, [detail, quantities])

  function buildLines() {
    if (!detail) return []
    return detail.items.map((item) => ({
      product_id: item.product_id,
      counted_qty: Number(quantities[item.product_id] ?? item.counted_qty),
    }))
  }

  async function handleSave() {
    if (!countId) return
    setBusy('save')
    try {
      await updateStockCount(countId, buildLines())
      toast.success('تم حفظ الكميات الفعلية على المسودة.')
      setReloadKey((key) => key + 1)
    } catch (saveError) {
      toast.error(translateCountError(saveError))
    } finally {
      setBusy(null)
    }
  }

  async function handleApprove() {
    if (!countId) return
    setBusy('approve')
    try {
      await updateStockCount(countId, buildLines())
      await approveStockCount(countId)
      toast.success('تم اعتماد الجرد وترحيل فروق التسوية إلى المخزون.')
      setReloadKey((key) => key + 1)
    } catch (approveError) {
      toast.error(translateCountError(approveError))
    } finally {
      setBusy(null)
    }
  }

  async function handleCancel() {
    if (!countId) return
    setBusy('cancel')
    try {
      await cancelStockCount(countId)
      toast.success('تم إلغاء جلسة الجرد.')
      setReloadKey((key) => key + 1)
    } catch (cancelError) {
      toast.error(translateCountError(cancelError))
    } finally {
      setBusy(null)
    }
  }

  if (!countId) {
    return <Card className="p-6 text-sm text-destructive">معرّف الجرد غير موجود في الرابط.</Card>
  }

  if (error) {
    return (
      <Card className="flex items-center gap-2 p-6 text-sm text-destructive">
        <TriangleAlert className="size-4" />
        {error}
      </Card>
    )
  }

  if (!detail) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  const { count, items } = detail
  const sameSystemTotal = items.reduce((sum, item) => sum + item.system_qty, 0)
  const countedTotal = items.reduce(
    (sum, item) => sum + Number(quantities[item.product_id] ?? item.counted_qty),
    0,
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/inventory/counts"
            className="grid size-8 place-items-center rounded-md hover:bg-muted"
            aria-label="رجوع إلى قائمة الجرد"
          >
            <ArrowRight className="size-4" />
          </Link>
          <span className="font-mono text-sm text-muted-foreground">{count.number}</span>
          <span className="text-xl font-extrabold">جرد {count.branch_name}</span>
          <Badge variant={stockCountStatusBadge[count.status]}>
            {stockCountStatusLabels[count.status]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          تاريخ الجرد {formatDate(count.count_date)}
          {count.approved_at ? ` • اعتُمد ${formatDateTime(count.approved_at)}` : ''}
          {count.notes ? ` • ${count.notes}` : ''}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="بنود الجرد" value={String(items.length)} />
        <SummaryTile label="كمية النظام" value={String(sameSystemTotal)} />
        <SummaryTile label="الكمية الفعلية" value={String(countedTotal)} />
        <SummaryTile
          label="فروق (بنود / قيمة)"
          value={`${liveDifference.count} / ${formatCurrency(liveDifference.value)}`}
          emphasis={liveDifference.count > 0}
        />
      </div>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث بالكود أو اسم المنتج"
            className="pr-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setReloadKey((key) => key + 1)}
            aria-label="تحديث"
          >
            <RefreshCw className="size-4" />
          </Button>
          {editable ? (
            <Button variant="outline" onClick={handleSave} disabled={busy !== null}>
              <Save className="size-4" /> حفظ الكميات
            </Button>
          ) : null}
          {isDraft && canApprove ? (
            <Button onClick={handleApprove} disabled={busy !== null}>
              <CheckCircle2 className="size-4" /> اعتماد الجرد
            </Button>
          ) : null}
          {isDraft && canEdit ? (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={handleCancel}
              disabled={busy !== null}
            >
              <XCircle className="size-4" /> إلغاء الجلسة
            </Button>
          ) : null}
        </div>
      </Card>

      {items.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={ClipboardCheck}
            title="لا بنود في هذا الجرد"
            description="أنشئ جلسة جرد جديدة واختر المنتجات المطلوبة."
          />
        </Card>
      ) : (
        <Card className="m-0 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>المنتج</TableHead>
                <TableHead>كمية النظام</TableHead>
                <TableHead>الكمية الفعلية</TableHead>
                <TableHead>الفرق</TableHead>
                <TableHead className="hidden md:table-cell">تكلفة الوحدة</TableHead>
                <TableHead>قيمة الفرق</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => (
                <CountRow
                  key={item.id}
                  item={item}
                  value={quantities[item.product_id] ?? String(item.counted_qty)}
                  editable={editable}
                  onChange={(value) =>
                    setQuantities((current) => ({ ...current, [item.product_id]: value }))
                  }
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}

function SummaryTile({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <Card className={cn('gap-1 p-4', emphasis ? 'border-accent/60 bg-accent/5' : undefined)}>
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="text-lg font-extrabold">{value}</p>
    </Card>
  )
}

function CountRow({
  item,
  value,
  editable,
  onChange,
}: {
  item: StockCountItem
  value: string
  editable: boolean
  onChange: (value: string) => void
}) {
  const counted = Number(value || 0)
  const difference = counted - item.system_qty

  return (
    <TableRow>
      <TableCell className="text-xs">{item.line_no}</TableCell>
      <TableCell className="text-xs">
        <span className="font-mono">{item.product_code}</span> — {item.product_name}
        {item.unit_name ? <span className="text-muted-foreground"> ({item.unit_name})</span> : null}
      </TableCell>
      <TableCell className="text-xs">{item.system_qty}</TableCell>
      <TableCell>
        {editable ? (
          <Input
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-8 w-24"
            aria-label={`الكمية الفعلية لـ ${item.product_name}`}
          />
        ) : (
          <span className="text-xs">{item.counted_qty}</span>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant={difference === 0 ? 'secondary' : difference > 0 ? 'success' : 'destructive'}
        >
          {difference > 0 ? `+${difference}` : difference}
        </Badge>
      </TableCell>
      <TableCell className="hidden text-xs md:table-cell">
        {formatCurrency(item.unit_cost)}
      </TableCell>
      <TableCell className="text-xs">{formatCurrency(difference * item.unit_cost)}</TableCell>
    </TableRow>
  )
}
