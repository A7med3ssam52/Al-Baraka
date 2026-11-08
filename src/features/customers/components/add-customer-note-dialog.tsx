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
import { addCustomerNote, translateCustomerError } from '@/features/customers/api'
import type { CustomerNote, CustomerRecord } from '@/features/customers/types'

interface Props {
  open: boolean
  customer: CustomerRecord
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  canWrite: boolean
}

const noteTypeOptions: { value: CustomerNote['note_type']; label: string }[] = [
  { value: 'note', label: 'ملاحظة' },
  { value: 'call', label: 'اتصال' },
  { value: 'visit', label: 'زيارة' },
  { value: 'promise', label: 'وعد سداد' },
]

export function AddCustomerNoteDialog({ open, customer, onOpenChange, onSaved, canWrite }: Props) {
  const [note, setNote] = useState('')
  const [noteType, setNoteType] = useState<CustomerNote['note_type']>('call')
  const [nextFollowup, setNextFollowup] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setNote('')
    setNoteType('call')
    setNextFollowup('')
  }, [open])

  function handleDialogOpenChange(next: boolean) {
    onOpenChange(next)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      toast.error('لا تملك الصلاحية لتسجيل الملاحظات.')
      return
    }
    setSubmitting(true)
    try {
      await addCustomerNote({
        customerId: customer.id,
        note,
        noteType,
        nextFollowupAt: nextFollowup ? new Date(nextFollowup).toISOString() : null,
      })
      toast.success('أُضيفت الملاحظة إلى السجل.')
      onSaved()
      onOpenChange(false)
    } catch (submitError) {
      toast.error(translateCustomerError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة متابعة</DialogTitle>
          <DialogDescription>
            سجل زمني متراكم مطلباً يتعلق بالعميل {customer.code} — لا تُعدل الملاحظات المُسجلة.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-bold">نوع المتابعة</span>
              <Select
                value={noteType}
                onChange={(event) => setNoteType(event.target.value as CustomerNote['note_type'])}
              >
                {noteTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-bold">موعد المتابعة القادم</span>
              <Input
                type="datetime-local"
                value={nextFollowup}
                onChange={(event) => setNextFollowup(event.target.value)}
              />
            </label>
          </div>
          <label className="grid gap-2 text-sm">
            <span className="font-bold">الملاحظة</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              required
              rows={4}
              maxLength={2000}
              placeholder="نتيجة الاتصال، سبب تأخر السداد، وعد التحصيل..."
              className="min-h-24 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting || note.trim().length === 0}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              حفظ في السجل
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
