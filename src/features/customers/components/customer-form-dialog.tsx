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
import { checkCustomerDuplicates, translateCustomerError } from '@/features/customers/api'
import {
  formatMobileInput,
  formatNationalId,
  type CustomerDuplicates,
  type CustomerRecord,
} from '@/features/customers/types'

interface Props {
  open: boolean
  customer: CustomerRecord | null
  onOpenChange: (open: boolean) => void
  onClosed: () => void
  onSubmit: (input: {
    full_name: string
    national_id: string
    mobile: string
    phone2: string
    job: string
    address: string
    notes: string
  }) => Promise<void>
}

interface FormState {
  full_name: string
  national_id: string
  mobile: string
  phone2: string
  job: string
  address: string
  notes: string
}

const emptyForm: FormState = {
  full_name: '',
  national_id: '',
  mobile: '',
  phone2: '',
  job: '',
  address: '',
  notes: '',
}

export function CustomerFormDialog({ open, customer, onOpenChange, onClosed, onSubmit }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [duplicates, setDuplicates] = useState<CustomerDuplicates | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState(false)
  const isEdit = customer !== null

  const dialogDescription = isEdit
    ? `تعديل بيانات العميل ${customer?.code}`
    : 'أدخل بيانات العميل مرة واحدة؛ الاسم والرقم القومي والموبايل مطلوبة.'

  function handleDialogOpenChange(next: boolean) {
    if (next) {
      setForm(
        customer
          ? {
              full_name: customer.full_name,
              national_id: customer.national_id,
              mobile: customer.mobile,
              phone2: customer.phone2 ?? '',
              job: customer.job ?? '',
              address: customer.address ?? '',
              notes: customer.notes ?? '',
            }
          : emptyForm,
      )
      setDuplicates(null)
      setPendingConfirm(false)
    }
    onOpenChange(next)
  }

  function patch(patchData: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patchData }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      let duplicatesBefore: CustomerDuplicates | null = null
      try {
        duplicatesBefore = await checkCustomerDuplicates(
          form.national_id,
          form.mobile,
          customer?.id,
        )
      } catch {
        duplicatesBefore = null
      }

      const hasNidDuplicate = duplicatesBefore?.national_id !== null
      const hasMobileDuplicates = (duplicatesBefore?.mobiles?.length ?? 0) > 0

      if (isEdit && hasNidDuplicate) {
        setDuplicates(duplicatesBefore)
        setPendingConfirm(false)
        toast.error('الرقم القومي مستخدم بالفعل من عميل آخر ولا يمكن تعديله إلى قيمة موجودة.')
        return
      }

      if (
        (isEdit && hasMobileDuplicates && !pendingConfirm) ||
        (!isEdit && (hasNidDuplicate || hasMobileDuplicates) && !pendingConfirm)
      ) {
        setDuplicates(duplicatesBefore)
        setPendingConfirm(true)
        return
      }

      await onSubmit({
        full_name: form.full_name,
        national_id: form.national_id.replace(/\D/g, ''),
        mobile: form.mobile,
        phone2: form.phone2,
        job: form.job,
        address: form.address,
        notes: form.notes,
      })
      toast.success(
        isEdit ? `تحديث ${customer?.code} بواسطة النظام تلقائيًا.` : 'تم إنشاء العميل بنجاح.',
      )
      onClosed()
    } catch (submitError) {
      toast.error(translateCustomerError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  const isFormValid =
    form.full_name.trim().length >= 3 &&
    form.national_id.replace(/\D/g, '').length === 14 &&
    form.mobile.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'تعديل بيانات العميل' : 'عميل جديد'}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <label className="text-sm font-bold" htmlFor="customer-full-name">
              الاسم بالكامل
            </label>
            <Input
              id="customer-full-name"
              value={form.full_name}
              onChange={(event) => patch({ full_name: event.target.value })}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-bold" htmlFor="customer-national-id">
                {isEdit ? 'الرقم القومي (لا يُعدل)' : 'الرقم القومي'}
              </label>
              <Input
                id="customer-national-id"
                className="dir-ltr font-mono"
                value={form.national_id}
                onChange={(event) => patch({ national_id: formatNationalId(event.target.value) })}
                required
                disabled={isEdit}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-bold" htmlFor="customer-mobile">
                الموبايل
              </label>
              <Input
                id="customer-mobile"
                className="dir-ltr font-mono"
                value={form.mobile}
                onChange={(event) => patch({ mobile: formatMobileInput(event.target.value) })}
                placeholder="01012345678"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-bold" htmlFor="customer-phone2">
                هاتف إضافي
              </label>
              <Input
                id="customer-phone2"
                className="dir-ltr font-mono"
                value={form.phone2}
                onChange={(event) => patch({ phone2: formatMobileInput(event.target.value) })}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-bold" htmlFor="customer-job">
                المهنة
              </label>
              <Input
                id="customer-job"
                value={form.job}
                onChange={(event) => patch({ job: event.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-bold" htmlFor="customer-address">
              العنوان
            </label>
            <Input
              id="customer-address"
              value={form.address}
              onChange={(event) => patch({ address: event.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-bold" htmlFor="customer-notes">
              ملاحظات
            </label>
            <Input
              id="customer-notes"
              value={form.notes}
              onChange={(event) => patch({ notes: event.target.value })}
            />
          </div>

          {duplicates && (pendingConfirm || isEdit) ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-semibold text-warning">
                <TriangleAlert className="size-4" />
                تنبيهات التكرار
              </div>
              {duplicates.national_id ? (
                <p className="mt-1 text-foreground">
                  عميل بنفس الرقم القومي: {duplicates.national_id.name} (
                  {duplicates.national_id.code})
                </p>
              ) : null}
              {duplicates.mobiles.length > 0 ? (
                <p className="mt-1 text-foreground">
                  نفس الموبايل موجود لعملاء آخرين:{' '}
                  {duplicates.mobiles.map((duplicate) => duplicate.name).join('، ')}
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting || !isFormValid}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {submitting ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة العميل'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
