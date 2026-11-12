import { Loader2 } from 'lucide-react'
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
import { translateInstallmentError, updateInstallment } from '@/features/installments/api'
import type { InstallmentRow } from '@/features/installments/types'

interface UpdateSummary {
  installmentId: string
  amount: number
  dueDate: string
}

interface Props {
  open: boolean
  installment: InstallmentRow | null
  onOpenChange: (open: boolean) => void
  onUpdated: (summary?: UpdateSummary) => void
}

export function EditInstallmentDialog({ open, installment, onOpenChange, onUpdated }: Props) {
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open && installment) {
      setAmount(String(installment.amount))
      setDueDate(installment.due_date)
      setReason('')
    }
  }, [open, installment])

  const locked = installment ? installment.paid_amount > 0 : false

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!installment) return
    setSubmitting(true)
    try {
      const result = await updateInstallment({
        installment_id: installment.id,
        amount: amount ? Number(amount) : null,
        due_date: dueDate || null,
        reason: reason.trim() || undefined,
      })

      const queued = result === null || (Array.isArray(result) && result.length === 0)
      if (queued) {
        // offline save — the toast with «اتحفظت على الجهاز» already appeared from the RPC layer
      } else {
        toast.success('تم حفظ تعديل القسط.')
      }

      onUpdated({
        installmentId: installment.id,
        amount: amount ? Number(amount) : installment.amount,
        dueDate: dueDate || installment.due_date,
      })
      onOpenChange(false)
    } catch (submitError) {
      toast.error(translateInstallmentError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل قسط {installment ? `#${installment.installment_no}` : ''}</DialogTitle>
          <DialogDescription>
            {locked
              ? 'هذا القسط مدفوع جزئيًا ولا يمكن تعديله.'
              : 'التعديل متاح فقط للأقساط غير المدفوعة.'}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">القيمة *</span>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              disabled={locked}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">تاريخ الاستحقاق *</span>
            <Input
              type="date"
              value={dueDate}
              disabled={locked}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">سبب التعديل</span>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="اختياري"
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting || locked}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
