import { ArrowRight, ArrowRightLeft, Eye, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { fetchVehicles } from '@/features/vehicles/api'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'

import {
  cancelStockTransfer,
  createStockTransfer,
  fetchStockTransfer,
  fetchStockTransfers,
  receiveStockTransfer,
  sendStockTransfer,
  translateTransferError,
} from '../api'
import { TransferFormDialog } from '../components/transfer-form-dialog'
import {
  stockTransferStatusBadge,
  stockTransferStatusLabels,
  type StockTransferDetail,
  type StockTransferInput,
  type StockTransferRecord,
  type StockTransferStatus,
} from '../types'

type StatusFilter = StockTransferStatus | 'all'

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'كل الحالات' },
  { value: 'draft', label: 'المسودات' },
  { value: 'in_transit', label: 'في الطريق' },
  { value: 'received', label: 'المستلَمة' },
  { value: 'cancelled', label: 'الملغاة' },
]

export function TransfersPage() {
  const { appUser, hasPermission } = useAuth()
  const [transfers, setTransfers] = useState<StockTransferRecord[]>([])
  const [products, setProducts] = useState<{ id: string; name: string; code: string }[]>([])
  const [vehicles, setVehicles] = useState<
    { id: string; code: string; chassis_no: string; branch_id: string }[]
  >([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const canManage = hasPermission('products.update')
  const branches = appUser?.branches ?? []
  const defaultBranchId = branches.find((branch) => branch.isDefault)?.id ?? branches[0]?.id ?? ''

  useEffect(() => {
    let active = true
    Promise.all([fetchProducts({ status: 'active' }), fetchVehicles({ status: 'active' })])
      .then(([productRows, vehicleRows]) => {
        if (!active) return
        setProducts(productRows.map((row) => ({ id: row.id, name: row.name, code: row.code })))
        setVehicles(
          vehicleRows.map((row) => ({
            id: row.id,
            code: row.code,
            chassis_no: row.chassis_no,
            branch_id: row.branch_id,
          })),
        )
      })
      .catch((loadError) => {
        if (active) toast.error(translateTransferError(loadError))
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  useEffect(() => {
    let active = true
    fetchStockTransfers({ status: statusFilter })
      .then((rows) => {
        if (!active) return
        setTransfers(rows)
        setError(null)
      })
      .catch((fetchError) => {
        if (active) setError(translateTransferError(fetchError))
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

  async function handleCreate(input: StockTransferInput) {
    await createStockTransfer(input)
    reload()
  }

  async function runAction(action: () => Promise<unknown>, message: string) {
    try {
      await action()
      toast.success(message)
      reload()
    } catch (actionError) {
      toast.error(translateTransferError(actionError))
    }
  }

  return (
    <>
      <PageHeader
        title="التحويلات بين الفروع"
        description="إرسال المخزون بين الفروع ثم إثبات الاستلام — الرصيد لا يتضاعف ولا ينقص."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/inventory">
                <ArrowRight className="size-4" /> المخزون
              </Link>
            </Button>
            {canManage ? (
              <Button onClick={() => setFormOpen(true)}>
                <Plus className="size-4" /> تحويل جديد
              </Button>
            ) : null}
          </div>
        }
      />

      <Card className="gap-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowRightLeft className="size-4" /> التحويلات المتاحة لك في فروعك
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
      ) : transfers.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={ArrowRightLeft}
            title="لا تحويلات بعد"
            description="أنشئ تحويلًا جديدًا لنقل منتجات أو مركبات بين الفروع مع إثبات الاستلام."
          />
        </Card>
      ) : (
        <Card className="m-0 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الرقم</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>من</TableHead>
                <TableHead>إلى</TableHead>
                <TableHead className="hidden sm:table-cell">البنود</TableHead>
                <TableHead className="hidden md:table-cell">القيمة</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="hidden lg:table-cell">الاستلام</TableHead>
                <TableHead className="text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.number}</TableCell>
                  <TableCell className="text-xs">{formatDate(row.transfer_date)}</TableCell>
                  <TableCell className="text-xs">{row.from_branch_name}</TableCell>
                  <TableCell className="text-xs">{row.to_branch_name}</TableCell>
                  <TableCell className="hidden text-xs sm:table-cell">
                    {row.item_count} • {row.total_quantity}
                  </TableCell>
                  <TableCell className="hidden text-xs md:table-cell">
                    {formatCurrency(row.total_value)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={stockTransferStatusBadge[row.status]}>
                      {stockTransferStatusLabels[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-xs lg:table-cell">
                    {row.received_at ? formatDateTime(row.received_at) : '—'}
                  </TableCell>
                  <TableCell className="text-left">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetailId(row.id)}
                        aria-label={`عرض ${row.number}`}
                      >
                        <Eye className="size-4" />
                      </Button>
                      {canManage && row.status === 'draft' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            runAction(
                              () => sendStockTransfer(row.id),
                              `تم إرسال ${row.number} وخصم المخزون من الفرع المصدر.`,
                            )
                          }
                        >
                          إرسال
                        </Button>
                      ) : null}
                      {canManage && row.status === 'in_transit' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            runAction(
                              () => receiveStockTransfer(row.id),
                              `تم استلام ${row.number} وإضافة المخزون للفرع الهدف.`,
                            )
                          }
                        >
                          استلام
                        </Button>
                      ) : null}
                      {canManage && row.status === 'draft' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() =>
                            runAction(() => cancelStockTransfer(row.id), `تم إلغاء ${row.number}.`)
                          }
                        >
                          إلغاء
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <TransferFormDialog
        open={formOpen}
        branches={branches}
        products={products}
        vehicles={vehicles}
        defaultBranchId={defaultBranchId}
        onOpenChange={setFormOpen}
        onClosed={() => setFormOpen(false)}
        onSubmit={handleCreate}
      />

      {detailId ? (
        <TransferDetailDialog
          key={detailId}
          transferId={detailId}
          onClose={() => setDetailId(null)}
        />
      ) : null}
    </>
  )
}

function TransferDetailDialog({
  transferId,
  onClose,
}: {
  transferId: string
  onClose: () => void
}) {
  const [detail, setDetail] = useState<StockTransferDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchStockTransfer(transferId)
      .then((row) => {
        if (active) setDetail(row)
      })
      .catch((loadError) => {
        if (active) setError(translateTransferError(loadError))
      })
    return () => {
      active = false
    }
  }, [transferId])

  return (
    <Dialog open onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{detail ? `تحويل ${detail.transfer.number}` : 'تفاصيل التحويل'}</DialogTitle>
          <DialogDescription>
            {detail
              ? `${detail.transfer.from_branch_name} ← ${detail.transfer.to_branch_name} • ${stockTransferStatusLabels[detail.transfer.status]}`
              : 'جارٍ تحميل بيانات التحويل.'}
          </DialogDescription>
        </DialogHeader>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {!detail && !error ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : null}

        {detail ? (
          <div className="grid gap-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>الصنف</TableHead>
                  <TableHead>الكمية</TableHead>
                  <TableHead>تكلفة الوحدة</TableHead>
                  <TableHead>القيمة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs">{item.line_no}</TableCell>
                    <TableCell className="text-xs">
                      <span className="font-mono">{item.product_code ?? item.vehicle_code}</span>
                      <p className="text-muted-foreground">
                        {item.product_name ?? item.vehicle_chassis ?? 'مركبة'}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs">{item.quantity}</TableCell>
                    <TableCell className="text-xs">{formatCurrency(item.unit_cost)}</TableCell>
                    <TableCell className="text-xs">
                      {formatCurrency(item.quantity * item.unit_cost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {detail.transfer.notes ? (
              <p className="rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                {detail.transfer.notes}
              </p>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
