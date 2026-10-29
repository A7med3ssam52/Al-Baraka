import { Loader2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { translateVehicleError } from '@/features/vehicles/api'
import {
  vehicleTypeLabels,
  type VehicleCreateInput,
  type VehicleRecord,
  type VehicleType,
  type VehicleUpdateInput,
} from '@/features/vehicles/types'

interface Props {
  open: boolean
  vehicle: VehicleRecord | null
  brands: { id: string; name: string }[]
  models: { id: string; brand_id: string; name: string }[]
  suppliers: { id: string; full_name: string }[]
  onOpenChange: (open: boolean) => void
  onClosed: () => void
  onSubmitCreate: (input: VehicleCreateInput) => Promise<void>
  onSubmitUpdate: (vehicleId: string, input: VehicleUpdateInput) => Promise<void>
}

interface FormState {
  chassis_no: string
  engine_no: string
  vehicle_type: VehicleType
  vehicle_class: string
  brand_id: string
  model_id: string
  manufacture_year: string
  color: string
  supplier_id: string
  purchase_date: string
  purchase_price: string
  transport_cost: string
  prep_cost: string
  suggested_price: string
  notes: string
}

const emptyForm: FormState = {
  chassis_no: '',
  engine_no: '',
  vehicle_type: 'motorcycle',
  vehicle_class: '',
  brand_id: '',
  model_id: '',
  manufacture_year: '',
  color: '',
  supplier_id: '',
  purchase_date: '',
  purchase_price: '0',
  transport_cost: '0',
  prep_cost: '0',
  suggested_price: '0',
  notes: '',
}

export function VehicleFormDialog({
  open,
  vehicle,
  brands,
  models,
  suppliers,
  onOpenChange,
  onClosed,
  onSubmitCreate,
  onSubmitUpdate,
}: Props) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEdit = vehicle !== null

  function patch(next: Partial<FormState>) {
    setForm((current) => ({ ...current, ...next }))
  }

  function handleDialogOpenChange(next: boolean) {
    if (next) {
      setForm(
        vehicle
          ? {
              chassis_no: vehicle.chassis_no,
              engine_no: vehicle.engine_no,
              vehicle_type: vehicle.vehicle_type,
              vehicle_class: vehicle.vehicle_class ?? '',
              brand_id: '',
              model_id: '',
              manufacture_year: vehicle.manufacture_year ? String(vehicle.manufacture_year) : '',
              color: vehicle.color ?? '',
              supplier_id: '',
              purchase_date: vehicle.purchase_date ?? '',
              purchase_price: String(vehicle.purchase_price),
              transport_cost: String(vehicle.transport_cost),
              prep_cost: String(vehicle.prep_cost),
              suggested_price: String(vehicle.suggested_price),
              notes: '',
            }
          : emptyForm,
      )
      setError(null)
    }
    onOpenChange(next)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      if (isEdit) {
        await onSubmitUpdate(vehicle.id, {
          vehicle_type: form.vehicle_type,
          vehicle_class: form.vehicle_class || null,
          manufacture_year: form.manufacture_year ? Number(form.manufacture_year) : null,
          color: form.color || null,
          purchase_date: form.purchase_date || null,
          suggested_price: Number(form.suggested_price || 0),
          notes: form.notes || null,
        })
        toast.success('تم حفظ بيانات المركبة.')
      } else {
        await onSubmitCreate({
          chassis_no: form.chassis_no,
          engine_no: form.engine_no,
          vehicle_type: form.vehicle_type,
          vehicle_class: form.vehicle_class || null,
          brand_id: form.brand_id || null,
          model_id: form.model_id || null,
          manufacture_year: form.manufacture_year ? Number(form.manufacture_year) : null,
          color: form.color || null,
          supplier_id: form.supplier_id || null,
          purchase_date: form.purchase_date || null,
          purchase_price: Number(form.purchase_price || 0),
          transport_cost: Number(form.transport_cost || 0),
          prep_cost: Number(form.prep_cost || 0),
          suggested_price: Number(form.suggested_price || 0),
        })
        toast.success('تمت إضافة المركبة بنجاح.')
      }
      onClosed()
    } catch (submitError) {
      setError(translateVehicleError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'تعديل المركبة' : 'مركبة جديدة'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `تعديل بيانات ${vehicle.code} — الشاسيه والموتور غير قابلين للتعديل.`
              : 'تُرقَّم المركبات تلقائيًا VEH-xxxx بعد التحقق من الشاسيه والموتور.'}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-3" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">رقم الشاسيه *</span>
              <Input
                dir="ltr"
                className="text-left font-mono"
                value={form.chassis_no}
                onChange={(event) => patch({ chassis_no: event.target.value })}
                disabled={isEdit}
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">رقم الموتور *</span>
              <Input
                dir="ltr"
                className="text-left font-mono"
                value={form.engine_no}
                onChange={(event) => patch({ engine_no: event.target.value })}
                disabled={isEdit}
                required
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">النوع</span>
              <Select
                value={form.vehicle_type}
                onChange={(event) => patch({ vehicle_type: event.target.value as VehicleType })}
              >
                {(Object.keys(vehicleTypeLabels) as VehicleType[]).map((type) => (
                  <option key={type} value={type}>
                    {vehicleTypeLabels[type]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الفئة</span>
              <Input
                value={form.vehicle_class}
                onChange={(event) => patch({ vehicle_class: event.target.value })}
                placeholder="مثال: 150cc"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">سنة الصنع</span>
              <Input
                type="number"
                min="1950"
                max="2100"
                value={form.manufacture_year}
                onChange={(event) => patch({ manufacture_year: event.target.value })}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الماركة</span>
              <Select
                value={form.brand_id}
                onChange={(event) => patch({ brand_id: event.target.value, model_id: '' })}
                disabled={isEdit}
              >
                <option value="">—</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الموديل</span>
              <Select
                value={form.model_id}
                onChange={(event) => patch({ model_id: event.target.value })}
                disabled={isEdit || !form.brand_id}
              >
                <option value="">—</option>
                {models
                  .filter((model) => model.brand_id === form.brand_id)
                  .map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
              </Select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">اللون</span>
              <Input
                value={form.color}
                onChange={(event) => patch({ color: event.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">المورد</span>
              <Select
                value={form.supplier_id}
                onChange={(event) => patch({ supplier_id: event.target.value })}
                disabled={isEdit}
              >
                <option value="">—</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.full_name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">تاريخ الشراء</span>
              <Input
                type="date"
                value={form.purchase_date}
                onChange={(event) => patch({ purchase_date: event.target.value })}
              />
            </label>
          </div>

          {!isEdit ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1.5 text-sm">
                <span className="font-semibold">سعر الشراء</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.purchase_price}
                  onChange={(event) => patch({ purchase_price: event.target.value })}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-semibold">نقل</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.transport_cost}
                  onChange={(event) => patch({ transport_cost: event.target.value })}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-semibold">تجهيز</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.prep_cost}
                  onChange={(event) => patch({ prep_cost: event.target.value })}
                />
              </label>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">السعر المقترح</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.suggested_price}
                onChange={(event) => patch({ suggested_price: event.target.value })}
              />
            </label>
            {isEdit ? (
              <label className="grid gap-1.5 text-sm">
                <span className="font-semibold">ملاحظات</span>
                <Input
                  value={form.notes}
                  onChange={(event) => patch({ notes: event.target.value })}
                />
              </label>
            ) : null}
          </div>

          {!isEdit ? (
            <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              التكلفة المعتمدة تُحسب تلقائيًا = سعر الشراء + النقل + التجهيز.
            </p>
          ) : null}

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {isEdit ? 'حفظ التعديلات' : 'إضافة المركبة'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
