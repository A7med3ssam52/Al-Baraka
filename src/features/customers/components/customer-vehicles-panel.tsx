import { Bike } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchCustomerVehicles } from '@/features/vehicles/api'
import {
  vehicleStatusBadgeVariant,
  vehicleStatusLabels,
  vehicleTypeLabels,
  type VehicleType,
} from '@/features/vehicles/types'

interface CustomerVehicle {
  id: string
  code: string
  vehicle_type: string
  brand_name: string | null
  model_name: string | null
  manufacture_year: number | null
  color: string | null
  chassis_no: string
  engine_no: string
  status: keyof typeof vehicleStatusLabels
  purchase_date: string | null
}

export function CustomerVehiclesPanel({ customerId }: { customerId: string }) {
  const [vehicles, setVehicles] = useState<CustomerVehicle[] | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    fetchCustomerVehicles(customerId)
      .then((rows) => {
        if (!mounted) return
        setVehicles(rows as CustomerVehicle[])
        setError(null)
      })
      .catch((loadError) => {
        if (!mounted) return
        setVehicles([])
        setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل المركبات.')
      })
    return () => {
      mounted = false
    }
  }, [customerId])

  const loading = vehicles === undefined

  return (
    <Card className="m-0 p-0">
      <div className="grid gap-1 p-4">
        <h2 className="font-bold">المركبات الحالية للعميل</h2>
        <p className="text-xs text-muted-foreground">
          المركبات المسجلة باسم العميل حاليًا — بتتحدث تلقائيًا مع البيع والإرجاع.
        </p>
      </div>
      {error ? (
        <div className="border-t p-4 text-sm text-destructive">{error}</div>
      ) : loading ? (
        <div className="grid gap-2 border-t p-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="border-t p-6">
          <EmptyState
            icon={Bike}
            title="لا مركبات مسجلة للعميل"
            description="أول مركبة تباع للعميل هتتسجل هنا تلقائيًا."
          />
        </div>
      ) : (
        <div className="border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الكود</TableHead>
                <TableHead>المركبة</TableHead>
                <TableHead className="hidden md:table-cell">الشاسيه</TableHead>
                <TableHead className="hidden md:table-cell">الموتور</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell>
                    <span className="font-semibold">
                      {[row.brand_name, row.model_name].filter(Boolean).join(' ') ||
                        vehicleTypeLabels[row.vehicle_type as VehicleType]}
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
                  <TableCell>
                    <Badge variant={vehicleStatusBadgeVariant[row.status]}>
                      {vehicleStatusLabels[row.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  )
}
