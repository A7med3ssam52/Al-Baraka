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
import {
  fetchContract,
  translateInstallmentError,
  updateContractTerms,
} from '@/features/installments/api'
import { frequencyLabels } from '@/features/installments/types'

interface Props {
  open: boolean
  contractId: string | null
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}

const FREQUENCIES = ['monthly', 'weekly', 'biweekly', 'custom'] as const

export function EditContractDialog({ open, contractId, onOpenChange, onUpdated }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [perPeriod, setPerPeriod] = useState('')
  const [down, setDown] = useState('0')
  const [count, setCount] = useState('')
  const [frequency, setFrequency] = useState<(typeof FREQUENCIES)[number]>('monthly')
  const [customDays, setCustomDays] = useState('')
  const [firstDue, setFirstDue] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const parsedCount = Number(count)
  const totalPreview = Number.isFinite(Number(perPeriod)) && Number.isInteger(parsedCount) && parsedCount > 0
    ? Number(perPeriod) * parsedCount + (Number(down) || 0)
    : 0

  useEffect(() => {
    if (!open || !contractId) return
    setLoading(true)
    setError(null)
    fetchContract(contractId)
      .then((detail) => {
        const c = detail.contract
        const cCount = Number(c.installment_count ?? 1)
        const cFinanced = Number(c.financed_amount ?? 0)
        setPerPeriod(cCount > 0 ? String(cFinanced / cCount) : '')
        setDown(String(c.down_payment ?? '0'))
        setCount(String(c.installment_count ?? ''))
        setFrequency(((c.frequency as (typeof FREQUENCIES)[number]) ?? 'monthly') as (typeof FREQUENCIES)[number])
        setCustomDays(c.custom_days ? String(c.custom_days) : '')
        setFirstDue(c.first_due_date ? String(c.first_due_date).slice(0, 10) : '')
        setNotes(String(c.notes ?? ''))
      })
      .catch((loadError) => setError(translateInstallmentError(loadError)))
      .finally(() => setLoading(false))
  }, [open, contractId])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!contractId) return
    const cCount = Number(count)
    if (!Number.isInteger(cCount) || cCount < 1) {
      setError('أدخل عدد أقساط صحيحًا (1 أو أكثر).')
      return
    }
    const installmentCost = Number(perPeriod)
    if (!Number.isFinite(installmentCost) || installmentCost <= 0) {
      setError('أدخل تكلفة القسط صحيحًا.')
      return
    }
    setSubmitting(true)
    try {
      await updateContractTerms({
        contract_id: contractId,
        total_amount: installmentCost * cCount + (Number(down) || 0),
        installment_count: cCount,
        frequency,
        custom_days: frequency === 'custom' ? Number(customDays) : null,
        first_due_date: firstDue || null,
        notes: notes.trim() || null,
      })
      toast.success('تم حفظ تعديل العقد وإعادة توليد الجدول.')
      onUpdated()
      onOpenChange(false)
    } catch (submitError) {
      const message = translateInstallmentError(submitError)
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
          <DialogTitle>تعديل العقد</DialogTitle>
          <DialogDescription>
            التعديل متاح فقط قبل أي تحصيل — الجدول هيتولد من جديد. المقدم ثابت.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : (
          <form className="grid gap-3" onSubmit={handleSubmit}>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">تكلفة القسط *</span>
              <Input type="number" min="0" step="0.01" value={perPeriod} onChange={(e) => setPerPeriod(e.target.value)} required />
              <span className="text-[11px] text-muted-foreground">
                اللي النظام هيخصمها كل دورية — المقدم ثابت: {down}
                {totalPreview > 0 ? ` — الإجمالي الجديد: ${totalPreview}` : ''}
              </span>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">عدد الأقساط *</span>
              <Input type="number" min="1" step="1" value={count} onChange={(e) => setCount(e.target.value)} required />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الدورية *</span>
              <Select value={frequency} onChange={(e) => setFrequency(e.target.value as (typeof FREQUENCIES)[number])}>
                {FREQUENCIES.map((item) => (
                  <option key={item} value={item}>
                    {frequencyLabels[item] ?? item}
                  </option>
                ))}
              </Select>
            </label>
            {frequency === 'custom' ? (
              <label className="grid gap-1.5 text-sm">
                <span className="font-semibold">أيام الدورية</span>
                <Input type="number" min="1" value={customDays} onChange={(e) => setCustomDays(e.target.value)} />
              </label>
            ) : null}
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">أول قسط</span>
              <Input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
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
        )}
      </DialogContent>
    </Dialog>
  )
}
