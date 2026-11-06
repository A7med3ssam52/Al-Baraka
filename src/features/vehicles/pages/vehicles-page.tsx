import { ArrowRight, Bike, Plus, RefreshCw, Search, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { fetchProductBrands, fetchProductModels } from '@/features/products/api'

import {
  createVehicle,
  fetchVehicles,
  setVehicleStatus,
  translateVehicleError,
  updateVehicle,
} from '../api'
import { VehicleFormDialog } from '../components/vehicle-form-dialog'
import {
  vehicleStatusBadgeVariant,
  vehicleStatusLabels,
  vehicleTransitions,
  vehicleTypeLabels,
  type VehicleCreateInput,
  type VehicleRecord,
  type VehicleStatus,
  type VehicleUpdateInput,
} from '../types'

type StatusFilter = VehicleStatus | 'active' | 'all'

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'المتاحة والشغالة' },
  { value: 'available', label: 'متاحة' },
  { value: 'reserved', label: 'محجوزة' },
  { value: 'sold', label: 'مباعة' },
  { value: 'returned', label: 'مرتجعة' },
  { value: 'maintenance', label: 'في الصيانة' },
  { value: 'damaged', label: 'تالفة' },
  { value: 'archived', label: 'مؤرشفة' },
  { value: 'all', label: 'كل الحالات' },
]

export function VehiclesPage() {
  const { hasPermission } = useAuth()
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([])
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([])
  const [models, setModels] = useState<{ id: string; brand_id: string; name: string }[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [formDialog, setFormDialog] = useState<{ open: boolean; vehicle: VehicleRecord | null }>({
    open: false,
    vehicle: null,
  })
  const lastSearchSubmit = useRef('')

  const canCreate = hasPermission('vehicles.create')
  const canUpdate = hasPermission('vehicles.update')
  const canArchive = hasPermission('vehicles.archive')

  const vehicle = formDialog.vehicle

  useEffect(() => {
    let active = true
    Promise.all([fetchProductBrands(), fetchProductModels()])
      .then(([brandRows, modelRows]) => {
        if (!active) return
        setBrands(brandRows)
        setModels(modelRows)
      })
      .catch((loadError) => {
        if (active) toast.error(translateVehicleError(loadError))
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  useEffect(() => {
    let active = true
    fetchVehicles({ status: statusFilter, search: lastSearchSubmit.current })
      .then((rows) => {
        if (!active) return
        setVehicles(rows)
        setError(null)
      })
      .catch((fetchError) => {
        if (!active) return
        setError(translateVehicleError(fetchError))
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

  async function handleStatusChange(row: VehicleRecord, status: VehicleStatus) {
    try {
      await setVehicleStatus(row.id, status)
      toast.success(`تم تحويل المركبة إلى: ${vehicleStatusLabels[status]}.`)
      reload()
    } catch (statusError) {
      toast.error(translateVehicleError(statusError))
    }
  }

  async function handleCreate(input: VehicleCreateInput) {
    await createVehicle(input)
    reload()
  }

  async function handleUpdate(vehicleId: string, input: VehicleUpdateInput) {
    await updateVehicle(vehicleId, input)
    reload()
  }

  function allowedTransitions(row: VehicleRecord) {
    return vehicleTransitions[row.status].filter((status) => {
      if (status === 'archived') return canArchive
      return canUpdate
    })
  }

  return (
    <>
      <PageHeader
        title="المركبات"
        description="سجل المركبات التسلسلي: الشاسيه والموتور والتكلفة المعتمدة وحالة كل مركبة."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/inventory">
                <ArrowRight className="size-4" /> المنتجات
              </Link>
            </Button>
            {canCreate ? (
              <Button onClick={() => setFormDialog({ open: true, vehicle: null })}>
                <Plus className="size-4" /> مركبة جديدة
              </Button>
            ) : null}
          </div>
        }
      />

      <Card className="gap-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form
            className="relative min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault()
              lastSearchSubmit.current = searchInput
              reload()
            }}
          >
            <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="بحث بالكود أو الشاسيه أو الموتور"
              className="pr-9"
            />
          </form>
          <Select
            value={statusFilter}
            onChange={(event) => {
              setLoading(true)
              setStatusFilter(event.target.value as StatusFilter)
            }}
            className="w-full sm:w-48"
          >
            {statusFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Button variant="ghost" size="icon" onClick={reload} aria-label="تحديث">
            <RefreshCw className="size-4" />
          </Button>
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
      ) : vehicles.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Bike}
            title="لا مركبات بعد"
            description="أضف أول مركبة برقم شاسيه وموتور فريدين لبدء المتابعة."
          />
        </Card>
      ) : (
        <Card className="m-0 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الكود</TableHead>
                <TableHead>المركبة</TableHead>
                <TableHead className="hidden md:table-cell">الشاسيه</TableHead>
                <TableHead className="hidden md:table-cell">الموتور</TableHead>
                <TableHead>التكلفة المعتمدة</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.map((row) => {
                const transitions = allowedTransitions(row)
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.code}</TableCell>
                    <TableCell>
                      <span className="font-semibold">
                        {[row.brand_name, row.model_name].filter(Boolean).join(' ') ||
                          vehicleTypeLabels[row.vehicle_type]}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {[row.manufacture_year, row.color].filter(Boolean).join(' • ') || '—'}
                      </p>
                    </TableCell>
                    <TableCell className="dir-ltr hidden font-mono text-xs md:table-cell">
                      {row.chassis_no}
                    </TableCell>
                    <TableCell className="dir-ltr hidden font-mono text-xs md:table-cell">
                      {row.engine_no}
                    </TableCell>
                    <TableCell className="text-xs font-semibold">
                      {row.approved_cost.toLocaleString('ar-EG')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={vehicleStatusBadgeVariant[row.status]}>
                        {vehicleStatusLabels[row.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-left">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`إجراءات ${row.code}`}>
                            <RefreshCw className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {canUpdate && row.status !== 'sold' && row.status !== 'archived' ? (
                            <DropdownMenuItem
                              onClick={() => setFormDialog({ open: true, vehicle: row })}
                            >
                              تعديل البيانات
                            </DropdownMenuItem>
                          ) : null}
                          {transitions.length > 0 ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel>تغيير الحالة</DropdownMenuLabel>
                              {transitions.map((status) => (
                                <DropdownMenuItem
                                  key={status}
                                  onClick={() => handleStatusChange(row, status)}
                                >
                                  {vehicleStatusLabels[status]}
                                </DropdownMenuItem>
                              ))}
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <VehicleFormDialog
        open={formDialog.open}
        vehicle={vehicle}
        brands={brands}
        models={models}
        onOpenChange={(open) => setFormDialog((current) => ({ ...current, open }))}
        onClosed={() => setFormDialog({ open: false, vehicle: null })}
        onSubmitCreate={handleCreate}
        onSubmitUpdate={handleUpdate}
      />
    </>
  )
}
