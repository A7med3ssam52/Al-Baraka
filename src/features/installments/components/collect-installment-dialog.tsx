import { Loader2, TriangleAlert, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { Select } from '@/components/ui/select'
import { formatCurrency, formatDate } from '@/lib/utils'

import { todayIsoDate, translateInstallmentError } from '../api'
import type { CollectInstallmentInput, InstallmentRow, PaymentMethod } from '../types'
import { paymentMethodLabels } from '../types'

interface Props {
  open: boolean
  installment: InstallmentRow | null
  onOpenChange: (open: boolean) => void
  onCollected: () => void
  onSubmit: (input: CollectInstallmentInput) => Promise<void>
}

export function CollectInstallmentDialog({
  open,
  installment,
  onOpenChange,
  onCollected,
  onSubmit,
}: Props) {
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentDate, setPaymentDate] = useState(todayIsoDate())
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setAmount(installment ? String(installment.remaining_amount) : '')
    setPaymentMethod('cash')
    setPaymentDate(todayIsoDate())
    setNotes('')
    setError(null)
  }, [open, installment])

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!installment) return

    const value = Number(amount)

    if (!Number.isFinite(value) || value <= 0) {
      setError('أدخل مبلغًا صحيحًا أكبر من صفر.')
      return
    }

    if (value > installment.remaining_amount) {
      setError(
        `المبلغ أكبر من المتبقي على القسط (${formatCurrency(installment.remaining_amount)}).`,
      )
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        installment_id: installment.id,
        amount: value,
        payment_method: paymentMethod,
        payment_date: paymentDate,
        notes: notes.trim() || null,
      })
      toast.success('تم تسجيل التحصيل وتحديث رصيد القسط والخزنة.')
      onCollected()
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
          <DialogTitle>تحصيل قسط</DialogTitle>
          <DialogDescription>
            يُسجَّل التحصيل كدفعة على العقد ويُحدَّث رصيد الخزنة أو البنك. يدعم السداد الجزئي.
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
              <span>الاستحقاق: {formatDate(installment.due_date)}</span>
              <span>الفرع: {installment.branch_name}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs">
              <span>
                قيمة القسط: <strong>{formatCurrency(installment.amount)}</strong>
              </span>
              <span>
                المسدد: <strong>{formatCurrency(installment.paid_amount)}</strong>
              </span>
              <span className="text-accent-strong">
                المتبقي: <strong>{formatCurrency(installment.remaining_amount)}</strong>
              </span>
            </div>
          </div>
        ) : null}

        <form className="grid gap-3" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">المبلغ المحصَّل *</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">طريقة الدفع</span>
              <Select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
              >
                {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map((method) => (
                  <option key={method} value={method}>
                    {paymentMethodLabels[method]}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">تاريخ الدفع</span>
            <Input
              type="date"
              value={paymentDate}
              max={todayIsoDate()}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">ملاحظات</span>
            <Input
              value={notes}
              placeholder="مثال: سداد جزئي، تحويل بنكي، ملاحظة المتابعة"
              onChange={(event) => setNotes(event.target.value)}
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
                <Wallet className="size-4" />
              )}
              تسجيل التحصيل
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
