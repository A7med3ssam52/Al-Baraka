import { Bike, Coins, History, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

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
import { movementTypeLabels } from '@/features/stock/types'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'

import {
  fetchVehicleCostBreakdown,
  fetchVehicleMovements,
  fetchVehiclesReport,
  translateReportError,
} from '../api'
import { vehicleStatusLabels, type VehicleCostBreakdown, type VehiclesReport } from '../types'

interface Props {
  branches: { id: string; code: string; name: string }[]
}

const statusOptions = [
  { value: 'all', label: 'كل الحالات' },
  { value: 'available', label: 'متاح' },
  { value: 'reserved', label: 'محجوز' },
  { value: 'sold', label: 'مباع' },
  { value: 'returned', label: 'مرتجع' },
  { value: 'maintenance', label: 'تحت الصيانة' },
  { value: 'damaged', label: 'تالف' },
  { value: 'archived', label: 'مؤرشف' },
]

const statusBadgeVariant: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  available: 'success',
  reserved: 'warning',
  sold: 'secondary',
  returned: 'warning',
  maintenance: 'warning',
  damaged: 'destructive',
  archived: 'secondary',
}

export function VehiclesReportPanel({ branches }: Props) {
  const [report, setReport] = useState<VehiclesReport | null>(null)
  const [branchId, setBranchId] = useState('')
  const [status, setStatus] = useState('all')
  const [reloadKey, setReloadKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [costVehicleId, setCostVehicleId] = useState<string | null>(null)
  const [movementVehicleId, setMovementVehicleId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchVehiclesReport({ branchId: branchId || null, status })
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
  }, [branchId, status, reloadKey])

  function reload() {
    setReport(null)
    setReloadKey((key) => key + 1)
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
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
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="w-full sm:w-48"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
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
            <Card className="gap-1 p-4">
              <p className="text-xs font-bold text-muted-foreground">عدد المركبات</p>
              <p className="text-lg font-extrabold">{report.summary.vehicle_count}</p>
              <p className="text-xs text-muted-foreground">
                متاح {report.summary.available_count} • محجوز {report.summary.reserved_count} • مباع{' '}
                {report.summary.sold_count}
              </p>
            </Card>
            <Card className="gap-1 p-4">
              <p className="text-xs font-bold text-muted-foreground">التكلفة المعتمدة</p>
              <p className="text-lg font-extrabold">
                {formatCurrency(report.summary.total_approved_cost)}
              </p>
            </Card>
            <Card className="gap-1 p-4">
              <p className="text-xs font-bold text-muted-foreground">تكلفة القسط المقترحة</p>
              <p className="text-lg font-extrabold">
                {formatCurrency(report.summary.total_suggested_price)}
              </p>
            </Card>
            <Card className="gap-1 border-accent/60 bg-accent/5 p-4">
              <p className="text-xs font-bold text-muted-foreground">هامش متوقع</p>
              <p className="text-lg font-extrabold">
                {formatCurrency(report.summary.expected_margin)}
              </p>
            </Card>
          </div>

          {report.rows.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={Bike}
                title="لا مركبات مطابقة"
                description="جرّب تغيير الفرع أو الحالة."
              />
            </Card>
          ) : (
            <Card className="m-0 p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الكود</TableHead>
                    <TableHead>الشاسيه</TableHead>
                    <TableHead>الفرع</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className="hidden md:table-cell">التكلفة المعتمدة</TableHead>
                    <TableHead className="hidden md:table-cell">تكلفة القسط</TableHead>
                    <TableHead className="hidden lg:table-cell">الهامش</TableHead>
                    <TableHead className="text-left">تقارير</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.vehicle_id}>
                      <TableCell className="font-mono text-xs">{row.vehicle_code}</TableCell>
                      <TableCell className="text-xs">{row.chassis_no}</TableCell>
                      <TableCell className="text-xs">{row.branch_name}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant[row.status] ?? 'secondary'}>
                          {vehicleStatusLabels[row.status] ?? row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-xs md:table-cell">
                        {formatCurrency(row.approved_cost)}
                      </TableCell>
                      <TableCell className="hidden text-xs md:table-cell">
                        {formatCurrency(row.suggested_price)}
                      </TableCell>
                      <TableCell className="hidden text-xs lg:table-cell">
                        {formatCurrency(row.expected_margin)}
                      </TableCell>
                      <TableCell className="text-left">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCostVehicleId(row.vehicle_id)}
                          >
                            <Coins className="size-4" /> التكلفة
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setMovementVehicleId(row.vehicle_id)}
                          >
                            <History className="size-4" /> الحركة
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      {costVehicleId ? (
        <VehicleCostDialog
          key={costVehicleId}
          vehicleId={costVehicleId}
          onClose={() => setCostVehicleId(null)}
        />
      ) : null}

      {movementVehicleId ? (
        <VehicleMovementsDialog
          key={movementVehicleId}
          vehicleId={movementVehicleId}
          onClose={() => setMovementVehicleId(null)}
        />
      ) : null}
    </div>
  )
}

function VehicleCostDialog({ vehicleId, onClose }: { vehicleId: string; onClose: () => void }) {
  const [data, setData] = useState<VehicleCostBreakdown | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchVehicleCostBreakdown(vehicleId)
      .then((result) => {
        if (active) setData(result)
      })
      .catch((loadError) => {
        if (active) setError(translateReportError(loadError))
      })
    return () => {
      active = false
    }
  }, [vehicleId])

  return (
    <Dialog open onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>مراجعة تكلفة المركبة</DialogTitle>
          <DialogDescription>
            من سطر فاتورة الشراء إلى التكلفة المعتمدة، مع نصيب النقل والتجهيز.
          </DialogDescription>
        </DialogHeader>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {!data && !error ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : null}

        {data ? (
          <div className="grid gap-3 text-sm">
            <div className="rounded-lg border p-3">
              <p className="font-mono text-xs text-muted-foreground">
                {data.vehicle.code} — {data.vehicle.chassis_no}
              </p>
              <p className="font-bold">{data.vehicle.branch_name}</p>
              <p className="text-xs text-muted-foreground">
                المورد: {data.vehicle.supplier_name ?? '—'}
              </p>
            </div>

            <dl className="grid gap-1 rounded-lg border p-3 text-xs">
              <Row label="سعر الشراء" value={formatCurrency(data.vehicle.purchase_price)} />
              {data.purchase ? (
                <>
                  <Row label="فاتورة الشراء" value={data.purchase.number} mono />
                  <Row label="تاريخ الفاتورة" value={formatDate(data.purchase.invoice_date)} />
                  <Row
                    label="نقل موزَّع"
                    value={formatCurrency(data.purchase.allocated_transport)}
                  />
                  <Row label="تجهيز موزَّع" value={formatCurrency(data.purchase.allocated_prep)} />
                  <Row
                    label="تكلفة الوحدة الواردة"
                    value={formatCurrency(data.purchase.landed_unit_cost)}
                  />
                </>
              ) : (
                <>
                  <Row label="نقل مباشر" value={formatCurrency(data.direct_costs.transport_cost)} />
                  <Row label="تجهيز مباشر" value={formatCurrency(data.direct_costs.prep_cost)} />
                </>
              )}
              <div className="my-1 border-t" />
              <Row label="التكلفة المحسوبة" value={formatCurrency(data.recomputed_cost)} />
              <Row label="التكلفة المعتمدة" value={formatCurrency(data.approved_cost)} bold />
              <div className="mt-1 flex items-center justify-between">
                <dt className="font-bold">الفرق</dt>
                <dd>
                  <Badge variant={data.difference === 0 ? 'success' : 'destructive'}>
                    {formatCurrency(data.difference)}
                  </Badge>
                </dd>
              </div>
            </dl>

            {data.vehicle.suggested_price > 0 ? (
              <p className="rounded-lg bg-muted/40 p-3 text-xs">
                الهامش المتوقع عند البيع بالسعر المقترح:{' '}
                <strong>{formatCurrency(data.vehicle.suggested_price - data.approved_cost)}</strong>
              </p>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function VehicleMovementsDialog({
  vehicleId,
  onClose,
}: {
  vehicleId: string
  onClose: () => void
}) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchVehicleMovements>> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchVehicleMovements({ vehicleId })
      .then((result) => {
        if (active) setRows(result)
      })
      .catch((loadError) => {
        if (active) setError(translateReportError(loadError))
      })
    return () => {
      active = false
    }
  }, [vehicleId])

  return (
    <Dialog open onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>حركة المركبة</DialogTitle>
          <DialogDescription>
            كل حركة مخزون مرتبطة بالمركبة مع مرجعها (شراء، تحويل، جرد).
          </DialogDescription>
        </DialogHeader>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {!rows && !error ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : null}

        {rows && rows.length === 0 ? (
          <EmptyState
            icon={History}
            title="لا حركات لهذه المركبة"
            description="ستظهر الحركة بعد اعتماد فاتورة شراء أو تحويل أو جرد."
          />
        ) : null}

        {rows && rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>التاريخ</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الفرع</TableHead>
                <TableHead>المرجع</TableHead>
                <TableHead className="hidden sm:table-cell">التكلفة</TableHead>
                <TableHead className="hidden md:table-cell">بواسطة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.movement_id}>
                  <TableCell className="text-xs">{formatDateTime(row.created_at)}</TableCell>
                  <TableCell className="text-xs">
                    {movementTypeLabels[row.movement_type as keyof typeof movementTypeLabels] ??
                      row.movement_type}
                  </TableCell>
                  <TableCell className="text-xs">{row.branch_name}</TableCell>
                  <TableCell className="font-mono text-xs">{row.reference_number ?? '—'}</TableCell>
                  <TableCell className="hidden text-xs sm:table-cell">
                    {formatCurrency(row.unit_cost)}
                  </TableCell>
                  <TableCell className="hidden text-xs md:table-cell">
                    {row.created_by_name ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Row({
  label,
  value,
  bold,
  mono,
}: {
  label: string
  value: string
  bold?: boolean
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={bold ? 'font-bold' : undefined}>{label}</dt>
      <dd
        className={[bold ? 'font-extrabold' : 'font-semibold', mono ? 'font-mono' : ''].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}
