import { Loader2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { fetchProductBrands, fetchProductModels, saveProductBrand, saveProductModel } from '@/features/products/api'
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
  onOpenChange: (open: boolean) => void
  onClosed: () => void
  onSubmitCreate: (input: VehicleCreateInput) => Promise<void>
  onSubmitUpdate: (vehicleId: string, input: VehicleUpdateInput) => Promise<void>
}

interface FormState {
  chassis_no: string
  engine_no: string
  vehicle_type: VehicleType
  brand_name: string
  model_name: string
  manufacture_year: string
  color: string
  purchase_date: string
  purchase_price: string
  notes: string
}

const emptyForm: FormState = {
  chassis_no: '',
  engine_no: '',
  vehicle_type: 'motorcycle',
  brand_name: '',
  model_name: '',
  manufacture_year: '',
  color: '',
  purchase_date: '',
  purchase_price: '0',
  notes: '',
}

export function VehicleFormDialog({
  open,
  vehicle,
  brands,
  models,
  onOpenChange,
  onClosed,
  onSubmitCreate,
  onSubmitUpdate,
}: Props) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serialNote, setSerialNote] = useState('')
  const [confirmSerialsOpen, setConfirmSerialsOpen] = useState(false)
  const isEdit = vehicle !== null
  const serialDirty =
    isEdit && vehicle !== null
      ? form.chassis_no.trim() !== vehicle.chassis_no || form.engine_no.trim() !== vehicle.engine_no
      : false

  useEffect(() => {
    if (!open) return
    setForm(
      vehicle
        ? {
            chassis_no: vehicle.chassis_no,
            engine_no: vehicle.engine_no,
            vehicle_type: vehicle.vehicle_type,
            brand_name: vehicle.brand_name ?? '',
            model_name: vehicle.model_name ?? '',
            manufacture_year: vehicle.manufacture_year ? String(vehicle.manufacture_year) : '',
            color: vehicle.color ?? '',
            purchase_date: vehicle.purchase_date ?? '',
            purchase_price: String(vehicle.purchase_price),
            notes: '',
          }
        : emptyForm,
    )
    setError(null)
    setSerialNote('')
    setConfirmSerialsOpen(false)
  }, [open, vehicle])

  function patch(next: Partial<FormState>) {
    setForm((current) => ({ ...current, ...next }))
  }

  function handleDialogOpenChange(next: boolean) {
    onOpenChange(next)
  }

  async function resolveBrandModelIds(): Promise<{ brand_id: string | null; model_id: string | null }> {
    const brandText = form.brand_name.trim()
    const modelText = form.model_name.trim()
    if (!brandText) return { brand_id: null, model_id: null }

    let brandId =
      brands.find((b) => b.name.trim().toLowerCase() === brandText.toLowerCase())?.id ?? null

    if (!brandId) {
      const created = (await saveProductBrand(brandText)) as { id: string } | null
      brandId = created?.id ?? null
      if (!brandId) {
        const fresh = await fetchProductBrands()
        brandId = fresh.find((b) => b.name.trim().toLowerCase() === brandText.toLowerCase())?.id ?? null
      }
    }

    if (!brandId || !modelText) return { brand_id: brandId, model_id: null }

    const freshModels = await fetchProductModels(brandId).catch(() => models)
    let modelId =
      freshModels.find(
        (m) => m.brand_id === brandId && m.name.trim().toLowerCase() === modelText.toLowerCase(),
      )?.id ?? null

    if (!modelId) {
      const createdModel = (await saveProductModel(brandId, modelText)) as { id: string } | null
      modelId = createdModel?.id ?? null
    }

    return { brand_id: brandId, model_id: modelId }
  }

  async function doSubmit() {
    setSubmitting(true)
    setError(null)

    try {
      const ids = isEdit ? { brand_id: null, model_id: null } : await resolveBrandModelIds()

      if (isEdit) {
        let notesPayload = form.notes.trim() ? form.notes : null
        if (serialDirty && serialNote.trim()) {
          const stamp = new Date().toISOString().slice(0, 10)
          notesPayload = `تغيير الشاسيه/الموتور (${stamp}): ${serialNote.trim()}${
            notesPayload ? ' — ' + notesPayload : ''
          }`
        }

        await onSubmitUpdate(vehicle.id, {
          vehicle_type: form.vehicle_type,
          manufacture_year: form.manufacture_year ? Number(form.manufacture_year) : null,
          color: form.color || null,
          purchase_date: form.purchase_date || null,
          notes: notesPayload,
          chassis_no: form.chassis_no,
          engine_no: form.engine_no,
        })
        toast.success('تم حفظ بيانات المركبة.')
      } else {
        await onSubmitCreate({
          chassis_no: form.chassis_no,
          engine_no: form.engine_no,
          vehicle_type: form.vehicle_type,
          brand_id: ids.brand_id,
          model_id: ids.model_id,
          manufacture_year: form.manufacture_year ? Number(form.manufacture_year) : null,
          color: form.color || null,
          purchase_date: form.purchase_date || null,
          purchase_price: Number(form.purchase_price || 0),
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (isEdit && serialDirty) {
      setConfirmSerialsOpen(true)
      return
    }
    await doSubmit()
  }

  return (
    <>
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'تعديل المركبة' : 'مركبة جديدة'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `تعديل بيانات ${vehicle.code} — الشاسيه والموتور قابلين للتعديل بحذر، ويتسجل التغيير في سجل المراقبة.`
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
                required
              />
            </label>
          </div>

          {serialDirty ? (
            <div className="grid gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  هتغيّر رقم <strong>الشاسيه/الموتور</strong> — التغيير بيتسجل في سجل المراقبة،
                  والفواتير والعقود بتفضل متسجلة على نفس المركبة. الأرقام لازم تكون فريدة.
                </span>
              </div>
              <Input
                value={serialNote}
                onChange={(event) => setSerialNote(event.target.value)}
                placeholder="سبب التغيير (اختياري) — مثال: تصحيح خطأ إدخال من الدفتر القديم"
                aria-label="سبب تغيير رقم الشاسيه/الموتور"
              />
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
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
              <Input
                value={form.brand_name}
                onChange={(event) => patch({ brand_name: event.target.value })}
                placeholder="اكتب اسم الماركة"
                disabled={isEdit}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الموديل</span>
              <Input
                value={form.model_name}
                onChange={(event) => patch({ model_name: event.target.value })}
                placeholder="اكتب اسم الموديل"
                disabled={isEdit}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">اللون</span>
              <Input
                value={form.color}
                onChange={(event) => patch({ color: event.target.value })}
              />
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

          <div className="grid gap-3 sm:grid-cols-2">
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
    <ConfirmActionDialog
      open={confirmSerialsOpen}
      onOpenChange={setConfirmSerialsOpen}
      title="تغيير رقم الشاسيه/الموتور"
      description="هيتم تغيير أرقام الشاسيه/الموتور وتسجيلها في سجل المراقبة. الفواتير والعقود الخاصة بالمركبة هتفضل محفوظة بأرقامها — مفيش حاجة هتتمسح."
      confirmLabel="تأكيد التغيير"
      requireReason={false}
      onConfirm={async () => {
        await doSubmit()
      }}
    />
    </>
  )
}
