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
import { Select } from '@/components/ui/select'
import { translateExpenseError, updateExpense } from '@/features/expenses/api'
import type { ExpenseRecord } from '@/features/expenses/types'

interface Props {
  open: boolean
  expense: ExpenseRecord | null
  cashboxes: { id: string; name_ar: string }[]
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}

export function ExpenseFormDialog({ open, expense, cashboxes, onOpenChange, onUpdated }: Props) {
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('general')
  const [cashboxId, setCashboxId] = useState('')
  const [notes, setNotes] = useState('')
  const [expenseDate, setExpenseDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && expense) {
      setTitle(expense.title)
      setAmount(String(expense.amount))
      setCategory(expense.category)
      setCashboxId(expense.cashbox_id ?? '')
      setNotes(expense.notes ?? '')
      setExpenseDate(expense.expense_date)
      setError(null)
    }
  }, [open, expense])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!expense) return
    setSubmitting(true)
    setError(null)
    try {
      await updateExpense({
        expenseId: expense.id,
        title: title.trim(),
        category: category.trim() || 'general',
        amount: Number(amount),
        expenseDate: expenseDate || undefined,
        cashboxId: cashboxId || null,
        notes: notes.trim(),
      })
      toast.success('تم حفظ تعديل المصروف.')
      onUpdated()
      onOpenChange(false)
    } catch (submitError) {
      const message = translateExpenseError(submitError)
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل مصروف</DialogTitle>
          <DialogDescription>عدّل بيانات المصروف ثم احفظ.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">العنوان *</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">المبلغ *</span>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">التصنيف</span>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">التاريخ</span>
            <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">الخزنة</span>
            <Select value={cashboxId} onChange={(e) => setCashboxId(e.target.value)}>
              <option value="">بدون خزنة محددة</option>
              {cashboxes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_ar}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">ملاحظات</span>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
