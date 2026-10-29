import {
  ArrowRight,
  ArrowRightLeft,
  ClipboardCheck,
  History,
  Plus,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'
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
import { formatDateTime } from '@/lib/utils'
import { fetchProducts } from '@/features/products/api'
import { fetchVehicles } from '@/features/vehicles/api'

import {
  fetchProductStock,
  fetchStockMovements,
  recordStockMovement,
  translateStockError,
} from '../api'
import { RecordMovementDialog } from '../components/record-movement-dialog'
import {
  movementTypeLabels,
  type MovementType,
  type ProductStockRecord,
  type StockMovementInput,
  type StockMovementRecord,
} from '../types'

const filterTypes: (MovementType | 'all')[] = [
  'all',
  'opening',
  'purchase',
  'sale',
  'return_in',
  'return_out',
  'transfer_in',
  'transfer_out',
  'adjustment',
  'count',
  'damage',
]

export function MovementsPage() {
  const { hasPermission } = useAuth()
  const [movements, setMovements] = useState<StockMovementRecord[]>([])
  const [stock, setStock] = useState<ProductStockRecord[]>([])
  const [products, setProducts] = useState<{ id: string; name: string; code: string }[]>([])
  const [vehicles, setVehicles] = useState<{ id: string; code: string; chassis_no: string }[]>([])
  const [typeFilter, setTypeFilter] = useState<MovementType | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)

  const canMove = hasPermission('products.update')

  useEffect(() => {
    let active = true
    Promise.all([
      fetchProductStock(),
      fetchProducts({ status: 'all' }),
      fetchVehicles({ status: 'all' }),
    ])
      .then(([stockRows, productRows, vehicleRows]) => {
        if (!active) return
        setStock(stockRows)
        setProducts(productRows.map((row) => ({ id: row.id, name: row.name, code: row.code })))
        setVehicles(
          vehicleRows.map((row) => ({ id: row.id, code: row.code, chassis_no: row.chassis_no })),
        )
      })
      .catch((loadError) => {
        if (active) toast.error(translateStockError(loadError))
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  useEffect(() => {
    let active = true
    fetchStockMovements({ movementType: typeFilter })
      .then((rows) => {
        if (!active) return
        setMovements(rows)
        setError(null)
      })
      .catch((fetchError) => {
        if (!active) return
        setError(translateStockError(fetchError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [typeFilter, reloadKey])

  function reload() {
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  async function handleSubmit(input: StockMovementInput) {
    await recordStockMovement(input)
    reload()
  }

  return (
    <>
      <PageHeader
        title="حركات المخزون"
        description="سجل غير قابل للتعديل لكل زيادة أو نقص، مع أرصدة الفروع الحالية."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/inventory">
                <ArrowRight className="size-4" /> المنتجات
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/inventory/transfers">
                <ArrowRightLeft className="size-4" /> التحويلات
              </Link>
            </Button>
            {hasPermission('inventory_counts.view') ? (
              <Button variant="outline" asChild>
                <Link to="/inventory/counts">
                  <ClipboardCheck className="size-4" /> الجرد
                </Link>
              </Button>
            ) : null}
            {canMove ? (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="size-4" /> حركة جديدة
              </Button>
            ) : null}
          </div>
        }
      />

      <Card className="gap-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <History className="size-4" /> آخر الحركات بالترتيب الزمني
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={typeFilter}
              onChange={(event) => {
                setLoading(true)
                setTypeFilter(event.target.value as MovementType | 'all')
              }}
              className="w-44"
            >
              {filterTypes.map((type) => (
                <option key={type} value={type}>
                  {type === 'all' ? 'كل الأنواع' : movementTypeLabels[type]}
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
      ) : movements.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={History}
            title="لا حركات بعد"
            description="سجّل أول حركة شراء أو رصيد افتتاحي لبدء تتبع المخزون."
          />
        </Card>
      ) : (
        <Card className="m-0 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>التاريخ</TableHead>
                <TableHead>الصنف</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الكمية</TableHead>
                <TableHead className="hidden md:table-cell">الفرع</TableHead>
                <TableHead className="hidden lg:table-cell">تكلفة الوحدة</TableHead>
                <TableHead className="hidden lg:table-cell">بواسطة</TableHead>
                <TableHead className="hidden xl:table-cell">ملاحظات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs">{formatDateTime(row.created_at)}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">
                      {row.product_code ?? row.vehicle_code}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {row.product_name ?? movementTypeLabels[row.movement_type]}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs">{movementTypeLabels[row.movement_type]}</TableCell>
                  <TableCell>
                    <Badge variant={row.quantity > 0 ? 'success' : 'destructive'}>
                      {row.quantity > 0 ? `+${row.quantity}` : row.quantity}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-xs md:table-cell">{row.branch_name}</TableCell>
                  <TableCell className="hidden text-xs lg:table-cell">
                    {row.unit_cost.toLocaleString('ar-EG')}
                  </TableCell>
                  <TableCell className="hidden text-xs lg:table-cell">
                    {row.created_by_name || '—'}
                  </TableCell>
                  <TableCell className="hidden text-xs xl:table-cell">{row.notes || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {stock.length > 0 ? (
        <Card className="gap-3 p-4">
          <h2 className="text-sm font-bold">أرصدة الفروع</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الفرع</TableHead>
                <TableHead>المنتج</TableHead>
                <TableHead>الرصيد</TableHead>
                <TableHead className="hidden sm:table-cell">حد إعادة الطلب</TableHead>
                <TableHead>قيمة المخزون</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.slice(0, 20).map((row) => (
                <TableRow key={`${row.branch_id}-${row.product_id}`}>
                  <TableCell className="text-xs">{row.branch_name}</TableCell>
                  <TableCell className="text-xs">
                    <span className="font-mono">{row.product_code}</span> — {row.product_name}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        row.quantity <= row.reorder_level
                          ? 'font-bold text-destructive'
                          : 'font-bold'
                      }
                    >
                      {row.quantity}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.unit_name ? ` ${row.unit_name}` : ''}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-xs sm:table-cell">
                    {row.reorder_level}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.stock_value.toLocaleString('ar-EG')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      <RecordMovementDialog
        open={dialogOpen}
        products={products}
        vehicles={vehicles}
        onOpenChange={setDialogOpen}
        onClosed={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
      />
    </>
  )
}
