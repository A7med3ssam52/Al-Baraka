import { LoaderCircle, Save, UserRound } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
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

import { updateUserProfile } from '../api'
import type { DirectoryUser } from '../types'

interface EditProfileDialogProps {
  user: DirectoryUser | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function EditProfileDialog({ user, open, onOpenChange, onSaved }: EditProfileDialogProps) {
  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!user) return

    if (fullName.trim().length < 2) {
      setError('أدخل اسم المستخدم الكامل (حرفان على الأقل).')
      return
    }

    if (phone.trim() && !/^[0-9+\-\s]{7,20}$/.test(phone.trim())) {
      setError('صيغة رقم الهاتف غير صحيحة.')
      return
    }

    setSubmitting(true)

    try {
      await updateUserProfile(user.user_id, fullName, phone)
      toast.success('تم تحديث بيانات المستخدم.')
      onSaved()
      onOpenChange(false)
    } catch (profileError) {
      setError(
        profileError instanceof Error
          ? profileError.message
          : 'تعذر تحديث بيانات المستخدم. حاول مرة أخرى.',
      )
    } finally {
      setSubmitting(false)
    }
  }

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
            <UserRound className="size-5 text-accent-strong" />
            تعديل بيانات المستخدم
          </DialogTitle>
          <DialogDescription>
            {user ? `بيانات ${user.full_name?.trim() || user.email}` : 'بيانات المستخدم'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block space-y-1.5">
            <span className="block text-xs font-bold">الاسم الكامل</span>
            <Input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              disabled={submitting}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="block text-xs font-bold">رقم الهاتف</span>
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="01xxxxxxxxx"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              disabled={submitting}
            />
          </label>

          <div className="rounded-lg bg-muted/60 p-3 text-xs leading-6 text-muted-foreground">
            البريد الإلكتروني لا يمكن تعديله من هنا. يتولى المستخدم تغييره من إعدادات حسابه عند
            الحاجة.
          </div>

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
            <Button type="submit" disabled={submitting || !user}>
              {submitting ? <LoaderCircle className="animate-spin" /> : <Save />}
              حفظ البيانات
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
