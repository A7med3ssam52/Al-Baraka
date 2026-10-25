import { Ban, LoaderCircle } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { cancelStaffInvitation, translateUserError } from '../api'
import type { StaffInvitation } from '../types'

interface CancelInvitationDialogProps {
  invitation: StaffInvitation
  onOpenChange: (open: boolean) => void
  onCancelled: () => void
}

export function CancelInvitationDialog({
  invitation,
  onOpenChange,
  onCancelled,
}: CancelInvitationDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCancel = async () => {
    setSubmitting(true)
    setError(null)

    try {
      await cancelStaffInvitation(invitation.invitation_id)
      onCancelled()
      onOpenChange(false)
    } catch (cancelError) {
      setError(
        cancelError instanceof Error ? cancelError.message : translateUserError('invite_failed'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!submitting) onOpenChange(nextOpen)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="size-5 text-destructive" />
            إلغاء الدعوة
          </DialogTitle>
          <DialogDescription>
            سيتم إلغاء دعوة {invitation.full_name} على الرقم{' '}
            <span className="font-mono" dir="ltr">
              {invitation.phone}
            </span>{' '}
            وإبطال رابطها فورًا. لا يمكن التراجع عن هذا الإجراء.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-semibold leading-6 text-destructive"
          >
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            تراجع
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleCancel()}
            disabled={submitting}
          >
            {submitting ? <LoaderCircle className="animate-spin" /> : <Ban />}
            تأكيد الإلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
