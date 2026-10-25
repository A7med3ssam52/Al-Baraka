import { LoaderCircle, RefreshCw, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

import { regenerateStaffInvitation, translateUserError } from '../api'
import type { StaffInvitation } from '../types'
import { ActionLinkPanel } from './action-link-panel'

interface InvitationLinkDialogProps {
  invitation: StaffInvitation
  onOpenChange: (open: boolean) => void
  onRegenerated: () => void
}

export function InvitationLinkDialog({
  invitation,
  onOpenChange,
  onRegenerated,
}: InvitationLinkDialogProps) {
  const [link, setLink] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const onRegeneratedRef = useRef(onRegenerated)
  const requestRef = useRef<{
    invitationId: string
    promise: ReturnType<typeof regenerateStaffInvitation>
  } | null>(null)

  useEffect(() => {
    onRegeneratedRef.current = onRegenerated
  }, [onRegenerated])

  useEffect(() => {
    // Regeneration rotates the token, so it must run once per opening. React
    // StrictMode runs effects twice in development; reuse the in-flight
    // promise so the link on screen always matches the token stored in the DB.
    if (!requestRef.current || requestRef.current.invitationId !== invitation.invitation_id) {
      requestRef.current = {
        invitationId: invitation.invitation_id,
        promise: regenerateStaffInvitation(invitation.invitation_id),
      }
    }

    const request = requestRef.current
    let active = true

    request.promise
      .then((result) => {
        if (!active) return
        setLink(result.link)
        setExpiresAt(result.expiresAt)
        onRegeneratedRef.current()
      })
      .catch((linkError: unknown) => {
        if (!active) return
        setError(linkError instanceof Error ? linkError.message : translateUserError('link_failed'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [invitation.invitation_id, reloadKey])

  const handleRetry = () => {
    requestRef.current = null
    setLink(null)
    setExpiresAt(null)
    setError(null)
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-5 text-accent-strong" />
            رابط دعوة جديد
          </DialogTitle>
          <DialogDescription>
            سيتم إلغاء الرابط السابق وإنشاء رابط جديد لـ {invitation.full_name} صالح لمدة 7 أيام، مع
            تصفير محاولات التحقق.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3" role="status" aria-live="polite">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-semibold leading-6 text-destructive"
            >
              {error}
            </p>
            <Button type="button" variant="outline" onClick={handleRetry}>
              <RefreshCw />
              إعادة المحاولة
            </Button>
          </div>
        ) : link ? (
          <ActionLinkPanel
            link={link}
            title="الرابط الجديد جاهز"
            description={`أرسل الرابط إلى ${invitation.full_name} على رقم ${invitation.phone} عبر واتساب. ينتهي في ${expiresAt ? new Date(expiresAt).toLocaleString('ar-EG-u-nu-latn') : 'خلال 7 أيام'}.`}
          />
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
          {loading ? (
            <Button type="button" disabled>
              <LoaderCircle className="animate-spin" />
              جارٍ إنشاء الرابط...
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
