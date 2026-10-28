import { Loader2 } from 'lucide-react'
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
import { translateCustomerError } from '@/features/customers/api'
import {
  customerStatusLabels,
  type CustomerRecord,
  type CustomerStatus,
} from '@/features/customers/types'

interface Props {
  open: boolean
  customer: CustomerRecord | null
  onOpenChange: (open: boolean) => void
  onConfirm: (customer: CustomerRecord, status: CustomerStatus) => Promise<void>
}

const flow: Record<CustomerStatus, CustomerStatus> = {
  active: 'inactive',
  inactive: 'active',
  archived: 'active',
}

export function CustomerStatusDialog({ open, customer, onOpenChange, onConfirm }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const targetStatus = customer ? flow[customer.status] : 'active'

  async function handleConfirm() {
    if (!customer) return
    setSubmitting(true)
    try {
      await onConfirm(customer, targetStatus)
      toast.success(`تم تحويل حالة العميل إلى ${customerStatusLabels[targetStatus]}.`)
      onOpenChange(false)
    } catch (confirmError) {
      toast.error(translateCustomerError(confirmError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>
            {targetStatus === 'archived' ? 'أرشفة العميل' : 'تغيير حالة العميل'}
          </DialogTitle>
          <DialogDescription>
            {customer
              ? `سيتم تعيين حالة ${customer.full_name} (${customer.code}) إلى ${customerStatusLabels[targetStatus]}.`
              : null}
            {targetStatus === 'inactive'
              ? ' العميل غير النشط يظهر في القوائم مع علامة، ولا يقبل معاملات بيعه جديدة.'
              : null}
            {targetStatus === 'archived'
              ? ' الحذف ممنوع؛ العميل المؤرشف يختفي من القوائم النشطة دون فقدان بياناته.'
              : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            تراجع
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            disabled={submitting}
            variant={targetStatus === 'active' ? 'default' : 'destructive'}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            تأكيد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
