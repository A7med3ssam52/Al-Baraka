import { KeyRound, LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

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

import { generateUserActionLink, translateUserError } from '../api'
import type { DirectoryUser } from '../types'
import { ActionLinkPanel } from './action-link-panel'

interface ActionLinkDialogProps {
  user: DirectoryUser
  onOpenChange: (open: boolean) => void
}

export function ActionLinkDialog({ user, onOpenChange }: ActionLinkDialogProps) {
  const [link, setLink] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true

    generateUserActionLink(user.user_id)
      .then((result) => {
        if (active) setLink(result.actionLink)
      })
      .catch((linkError: unknown) => {
        if (active) {
          setError(
            linkError instanceof Error ? linkError.message : translateUserError('link_failed'),
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [user.user_id, reloadKey])

  const handleRetry = () => {
    setLink(null)
    setError(null)
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-accent-strong" />
            رابط إعادة تعيين كلمة المرور
          </DialogTitle>
          <DialogDescription>
            أنشئ رابطًا آمنًا ليعيّن {user.full_name?.trim() || user.email} كلمة مرور جديدة.
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
            title="رابط إعادة التعيين جاهز"
            description="أرسل الرابط للمستخدم مباشرة. عند فتحه سيُطلب منه تعيين كلمة مرور جديدة."
          />
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
          {loading ? (
            <Button type="button" disabled>
              <LoaderCircle className="animate-spin" />
              جارٍ الإنشاء...
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
