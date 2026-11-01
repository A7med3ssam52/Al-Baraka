import { ArrowRight, ClipboardCheck, Eye, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
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
import { fetchProducts } from '@/features/products/api'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'

import { createStockCount, fetchStockCounts, translateCountError } from '../api'
import { CountFormDialog } from '../components/count-form-dialog'
import {
  stockCountStatusBadge,
  stockCountStatusLabels,
  type StockCountInput,
  type StockCountRecord,
  type StockCountStatus,
} from '../types'

type StatusFilter = StockCountStatus | 'all'

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'كل الحالات' },
  { value: 'draft', label: 'المسودات' },
  { value: 'approved', label: 'المعتمدة' },
  { value: 'cancelled', label: 'الملغاة' },
]

export function CountsPage() {
  const { appUser, hasPermission } = useAuth()
  const [counts, setCounts] = useState<StockCountRecord[]>([])
  const [products, setProducts] = useState<{ id: string; name: string; code: string }[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [formOpen, setFormOpen] = useState(false)

  const canCreate = hasPermission('inventory_counts.create')
  const branches = appUser?.branches ?? []
  const defaultBranchId = branches.find((branch) => branch.isDefault)?.id ?? branches[0]?.id ?? ''

  useEffect(() => {
    let active = true
    fetchProducts({ status: 'active' })
      .then((rows) => {
        if (!active) return
        setProducts(rows.map((row) => ({ id: row.id, name: row.name, code: row.code })))
      })
      .catch((loadError) => {
        if (active) toast.error(translateCountError(loadError))
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  useEffect(() => {
    let active = true
    fetchStockCounts({ status: statusFilter })
      .then((rows) => {
        if (!active) return
        setCounts(rows)
        setError(null)
      })
      .catch((fetchError) => {
        if (active) setError(translateCountError(fetchError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [statusFilter, reloadKey])

  function reload() {
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  async function handleCreate(input: StockCountInput) {
    await createStockCount(input)
    reload()
  }

  return (
    <>
      <PageHeader
        title="الجرد الفعلي"
        description="جلسات الجرد بالفروق بين كمية النظام والكمية الفعلية — المخزون لا يتغير قبل الاعتماد."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/inventory">
                <ArrowRight className="size-4" /> المخزون
              </Link>
            </Button>
            {canCreate ? (
              <Button onClick={() => setFormOpen(true)}>
                <Plus className="size-4" /> جرد جديد
              </Button>
            ) : null}
          </div>
        }
      />

      <Card className="gap-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardCheck className="size-4" /> كل جلسة تحتفظ بصورة كمية النظام لحظة إنشائها
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onChange={(event) => {
                setLoading(true)
                setStatusFilter(event.target.value as StatusFilter)
              }}
              className="w-full sm:w-40"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button variant="ghost" size="icon" onClick={reload} aria-label="تحديث">
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </div>
      </Card>

      {error ? (
        <Card className="p-4 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-4" />
            {error}
          </div>
        </Card>
      ) : loading ? (
        <Card className="p-4">
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : counts.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={ClipboardCheck}
            title="لا جلسات جرد بعد"
            description="ابدأ جردًا جديدًا لفرعك، أدخل الكميات الفعلية، ثم اعتمد الفروق لتسوية المخزون."
          />
        </Card>
      ) : (
        <Card className="m-0 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الرقم</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>الفرع</TableHead>
                <TableHead className="hidden sm:table-cell">البنود</TableHead>
                <TableHead className="hidden sm:table-cell">فروق</TableHead>
                <TableHead className="hidden md:table-cell">قيمة الفرق</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="hidden lg:table-cell">الاعتماد</TableHead>
                <TableHead className="text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {counts.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.number}</TableCell>
                  <TableCell className="text-xs">{formatDate(row.count_date)}</TableCell>
                  <TableCell className="text-xs">{row.branch_name}</TableCell>
                  <TableCell className="hidden text-xs sm:table-cell">{row.item_count}</TableCell>
                  <TableCell className="hidden text-xs sm:table-cell">
                    <Badge variant={row.difference_count > 0 ? 'warning' : 'secondary'}>
                      {row.difference_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-xs md:table-cell">
                    {formatCurrency(row.total_difference_value)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={stockCountStatusBadge[row.status]}>
                      {stockCountStatusLabels[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-xs lg:table-cell">
                    {row.approved_at ? formatDateTime(row.approved_at) : '—'}
                  </TableCell>
                  <TableCell className="text-left">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/inventory/counts/${row.id}`}>
                        <Eye className="size-4" /> فتح
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <CountFormDialog
        open={formOpen}
        branches={branches}
        products={products}
        defaultBranchId={defaultBranchId}
        onOpenChange={setFormOpen}
        onClosed={() => setFormOpen(false)}
        onSubmit={handleCreate}
      />
    </>
  )
}
