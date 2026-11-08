import { Loader2, TriangleAlert } from 'lucide-react'
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
import { Input } from '@/components/ui/input'

interface Props {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  /** When set, the user must type this text to confirm (for hard deletes). */
  requireText?: string
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => Promise<void>
}

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel,
  requireText,
  onOpenChange,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready =
    reason.trim().length >= 3 && (!requireText || typed.trim() === requireText.trim())

  async function handleConfirm() {
    setSubmitting(true)
    setError(null)
    try {
      await onConfirm(reason.trim())
      setReason('')
      setTyped('')
      onOpenChange(false)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'تعذر إكمال العملية. حاول مرة أخرى.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReason('')
          setTyped('')
          setError(null)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-destructive" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">سبب العملية *</span>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="اكتب السبب (3 أحرف على الأقل)"
              required
            />
          </label>

          {requireText ? (
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">
                اكتب «{requireText}» للتأكيد
              </span>
              <Input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={requireText}
              />
            </label>
          ) : null}

          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={submitting || !ready}
            onClick={() => void handleConfirm()}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
