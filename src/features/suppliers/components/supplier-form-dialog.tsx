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
import { Input } from '@/components/ui/input'
import { translateSupplierError } from '@/features/suppliers/api'
import type { SupplierRecord } from '@/features/suppliers/types'

interface Props {
  open: boolean
  supplier: SupplierRecord | null
  onOpenChange: (open: boolean) => void
  onClosed: () => void
  onSubmit: (input: {
    full_name: string
    phone: string
    contact_name: string
    tax_number: string
    address: string
    notes: string
  }) => Promise<void>
}

interface FormState {
  full_name: string
  phone: string
  contact_name: string
  tax_number: string
  address: string
  notes: string
}

const emptyForm: FormState = {
  full_name: '',
  phone: '',
  contact_name: '',
  tax_number: '',
  address: '',
  notes: '',
}

export function SupplierFormDialog({ open, supplier, onOpenChange, onClosed, onSubmit }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEdit = supplier !== null

  useEffect(() => {
    if (!open) return
    setForm(
      supplier
        ? {
            full_name: supplier.full_name,
            phone: supplier.phone,
            contact_name: supplier.contact_name ?? '',
            tax_number: supplier.tax_number ?? '',
            address: supplier.address ?? '',
            notes: supplier.notes ?? '',
          }
        : emptyForm,
    )
    setError(null)
  }, [open, supplier])

  function handleDialogOpenChange(next: boolean) {
    onOpenChange(next)
  }

  function patch(patchData: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patchData }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (form.full_name.trim().length < 2) {
      toast.error('اسم المورد مطلوب (حرفان على الأقل).')
      return
    }
    if (!/^0?1[0125][0-9]{8}$/.test(form.phone.replace(/[\s-]/g, ''))) {
      toast.error('رقم الموبايل يجب أن يكون رقمًا مصريًا صحيحًا (010/011/012/015).')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        full_name: form.full_name,
        phone: form.phone,
        contact_name: form.contact_name,
        tax_number: form.tax_number,
        address: form.address,
        notes: form.notes,
      })
      onClosed()
      toast.success(isEdit ? 'تم حفظ بيانات المورد.' : 'تم إضافة المورد بنجاح.')
    } catch (submitError) {
      setError(translateSupplierError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'تعديل المورد' : 'مورد جديد'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `تعديل بيانات المورد ${supplier?.code}`
              : 'بيانات المورد المطلوبة: الاسم والموبايل الأساسي.'}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-3" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">اسم المورد *</span>
            <Input
              value={form.full_name}
              onChange={(event) => patch({ full_name: event.target.value })}
              placeholder="مثال: مورد الركن الصلب"
              required
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">موبايل أساسي *</span>
              <Input
                dir="ltr"
                className="text-left"
                value={form.phone}
                onChange={(event) => patch({ phone: event.target.value })}
                placeholder="01012345678"
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">جهة اتصال</span>
              <Input
                value={form.contact_name}
                onChange={(event) => patch({ contact_name: event.target.value })}
                placeholder="اسم المسؤول للتواصل"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الرقم الضريبي</span>
              <Input
                dir="ltr"
                className="text-left"
                value={form.tax_number}
                onChange={(event) => patch({ tax_number: event.target.value })}
                placeholder="اختياري"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">العنوان</span>
              <Input
                value={form.address}
                onChange={(event) => patch({ address: event.target.value })}
                placeholder="اختياري"
              />
            </label>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">ملاحظات</span>
            <Input
              value={form.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              placeholder="اختياري"
            />
          </label>

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
              onClick={() => handleDialogOpenChange(false)}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {isEdit ? 'حفظ التعديلات' : 'إضافة المورد'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
