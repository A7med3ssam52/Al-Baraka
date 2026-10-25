import { LoaderCircle, ShieldOff, UserCheck } from 'lucide-react'
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

import { setUserActive } from '../api'
import type { DirectoryUser } from '../types'

interface UserStatusDialogProps {
  user: DirectoryUser | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function UserStatusDialog({ user, open, onOpenChange, onSaved }: UserStatusDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    if (!user) return

    setError(null)
    setSubmitting(true)

    try {
      await setUserActive(user.user_id, !user.is_active)
      toast.success(user.is_active ? 'تم تعطيل حساب المستخدم.' : 'تم تفعيل حساب المستخدم.')
      onSaved()
      onOpenChange(false)
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : 'تعذر تحديث حالة المستخدم. حاول مرة أخرى.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const willDeactivate = Boolean(user?.is_active)

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!submitting) onOpenChange(nextOpen)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {willDeactivate ? (
              <ShieldOff className="size-5 text-destructive" />
            ) : (
              <UserCheck className="size-5 text-success" />
            )}
            {willDeactivate ? 'تعطيل حساب المستخدم' : 'تفعيل حساب المستخدم'}
          </DialogTitle>
          <DialogDescription>
            {user
              ? willDeactivate
                ? `سيتم منع ${user.full_name?.trim() || user.email} من الدخول وإنهاء جلساته الحالية. يمكنك تفعيل الحساب لاحقًا.`
                : `سيتمكن ${user.full_name?.trim() || user.email} من الدخول مرة أخرى بالبيانات المسجلة.`
              : 'تأكيد تغيير حالة الحساب.'}
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
            إلغاء
          </Button>
          <Button
            type="button"
            variant={willDeactivate ? 'destructive' : 'default'}
            onClick={() => void handleConfirm()}
            disabled={submitting || !user}
          >
            {submitting ? <LoaderCircle className="animate-spin" /> : null}
            {willDeactivate ? 'تعطيل الحساب' : 'تفعيل الحساب'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
