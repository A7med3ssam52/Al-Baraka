import { CalendarClock, Loader2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
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
import { formatCurrency, formatDate } from '@/lib/utils'

import { addDaysIsoDate, todayIsoDate, translateInstallmentError } from '../api'
import type { InstallmentRow, RescheduleInstallmentInput } from '../types'

interface Props {
  open: boolean
  installment: InstallmentRow | null
  onOpenChange: (open: boolean) => void
  onRescheduled: () => void
  onSubmit: (input: RescheduleInstallmentInput) => Promise<void>
}

export function RescheduleInstallmentDialog({
  open,
  installment,
  onOpenChange,
  onRescheduled,
  onSubmit,
}: Props) {
  const [newDueDate, setNewDueDate] = useState(addDaysIsoDate(30))
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setNewDueDate(addDaysIsoDate(30))
      setReason('')
      setError(null)
    }
    onOpenChange(next)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!installment) return

    if (!newDueDate) {
      setError('اختر تاريخ الاستحقاق الجديد.')
      return
    }

    if (newDueDate <= todayIsoDate()) {
      setError('تاريخ الاستحقاق الجديد يجب أن يكون بعد تاريخ اليوم.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        installment_id: installment.id,
        new_due_date: newDueDate,
        reason: reason.trim() || null,
      })
      toast.success('تمت إعادة جدولة القسط وتحديث تاريخ الاستحقاق.')
      onRescheduled()
    } catch (submitError) {
      setError(translateInstallmentError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>إعادة جدولة القسط</DialogTitle>
          <DialogDescription>
            تغيير تاريخ الاستحقاق فقط؛ قيمة القسط والمدفوع منه لا تتغير. يُسجَّل السبب في سجل
            المتابعة.
          </DialogDescription>
        </DialogHeader>

        {installment ? (
          <div className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{installment.customer_name}</span>
              <Badge variant="outline">{installment.customer_code}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span>العقد: {installment.contract_number}</span>
              <span>القسط: {installment.installment_no}</span>
              <span>الاستحقاق الحالي: {formatDate(installment.due_date)}</span>
              <span>الفرع: {installment.branch_name}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs">
              <span>
                قيمة القسط: <strong>{formatCurrency(installment.amount)}</strong>
              </span>
              <span>
                المتبقي: <strong>{formatCurrency(installment.remaining_amount)}</strong>
              </span>
            </div>
          </div>
        ) : null}

        <form className="grid gap-3" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">تاريخ الاستحقاق الجديد *</span>
            <Input
              type="date"
              value={newDueDate}
              min={addDaysIsoDate(1)}
              onChange={(event) => setNewDueDate(event.target.value)}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">سبب إعادة الجدولة</span>
            <Input
              value={reason}
              placeholder="مثال: طلب العميل تأجيل الدفعة"
              onChange={(event) => setReason(event.target.value)}
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
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting || !installment}>
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarClock className="size-4" />
              )}
              حفظ الموعد الجديد
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
