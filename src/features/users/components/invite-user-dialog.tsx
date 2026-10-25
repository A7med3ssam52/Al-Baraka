import { Link2, LoaderCircle, Smartphone, UserPlus } from 'lucide-react'
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
import type { UserRole } from '@/types'

import { createStaffInvitation, translateUserError } from '../api'
import type { BranchOption, CreateInvitationResult, RoleOption } from '../types'
import { ActionLinkPanel } from './action-link-panel'
import { RoleBranchSelector } from './role-branch-selector'

interface InviteUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roleOptions: RoleOption[]
  branchOptions: BranchOption[]
  onInvited: () => void
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

export function InviteUserDialog({
  open,
  onOpenChange,
  roleOptions,
  branchOptions,
  onInvited,
}: InviteUserDialogProps) {
  const initialRole =
    roleOptions.find((role) => role.code === 'viewer')?.code ??
    roleOptions.find((role) => role.code !== 'owner')?.code ??
    roleOptions[0]?.code ??
    ''
  const initialBranch = branchOptions[0]?.id ?? ''

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>(initialRole ? [initialRole] : [])
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(
    initialBranch ? [initialBranch] : [],
  )
  const [primaryRole, setPrimaryRole] = useState<UserRole | ''>(initialRole)
  const [defaultBranchId, setDefaultBranchId] = useState(initialBranch)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CreateInvitationResult | null>(null)

  // Reset on close so the next invitation always starts from a clean form
  // instead of showing the previous one-time link.
  const resetForm = () => {
    setFullName('')
    setPhone('')
    setSelectedRoles(initialRole ? [initialRole] : [])
    setSelectedBranchIds(initialBranch ? [initialBranch] : [])
    setPrimaryRole(initialRole)
    setDefaultBranchId(initialBranch)
    setSubmitting(false)
    setError(null)
    setResult(null)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (submitting) return
    if (!nextOpen) resetForm()
    onOpenChange(nextOpen)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (fullName.trim().length < 2) {
      setError('أدخل اسم الموظف الكامل (حرفان على الأقل).')
      return
    }

    const normalizedPhone = normalizePhone(phone)
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      setError('أدخل رقم هاتف صحيحًا (10 إلى 15 رقمًا).')
      return
    }

    if (selectedRoles.length === 0) {
      setError('اختر دورًا واحدًا على الأقل.')
      return
    }

    if (selectedBranchIds.length === 0) {
      setError('اختر فرعًا واحدًا على الأقل.')
      return
    }

    if (!primaryRole || !selectedRoles.includes(primaryRole)) {
      setError('اختر الدور الأساسي من الأدوار المحددة.')
      return
    }

    if (!defaultBranchId || !selectedBranchIds.includes(defaultBranchId)) {
      setError('اختر الفرع الافتراضي من الفروع المحددة.')
      return
    }

    setSubmitting(true)

    try {
      const invitation = await createStaffInvitation({
        fullName,
        phone: normalizedPhone,
        access: {
          roles: selectedRoles,
          branchIds: selectedBranchIds,
          primaryRole,
          defaultBranchId,
        },
      })

      setResult(invitation)
      onInvited()
      toast.success('تم إنشاء الدعوة بنجاح.')
    } catch (inviteError) {
      setError(
        inviteError instanceof Error ? inviteError.message : translateUserError('invite_failed'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-accent-strong" />
            دعوة موظف جديد
          </DialogTitle>
          <DialogDescription>
            أدخل اسم الموظف ورقم هاتفه وحدد أدواره وفروعه. لا نطلب البريد الإلكتروني الآن؛ سيعيّنه
            الموظف بنفسه عند فتح الرابط.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <>
            <ActionLinkPanel
              link={result.link}
              title="رابط الدعوة جاهز للإرسال"
              description={`أرسل هذا الرابط إلى ${fullName.trim()} على رقم ${normalizePhone(phone)} عبر واتساب. الرابط صالح لمدة 7 أيام وللاستخدام مرة واحدة، ويتطلب تأكيد رقم الهاتف.`}
            />
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                تم
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="block text-xs font-bold">الاسم الكامل</span>
                <Input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="مثال: محمد أحمد علي"
                  autoComplete="name"
                  disabled={submitting}
                />
              </label>

              <label className="space-y-1.5">
                <span className="block text-xs font-bold">رقم الهاتف</span>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="01xxxxxxxxx"
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="tel"
                  disabled={submitting}
                />
              </label>
            </div>

            <RoleBranchSelector
              roleOptions={roleOptions}
              branchOptions={branchOptions}
              selectedRoles={selectedRoles}
              selectedBranchIds={selectedBranchIds}
              primaryRole={primaryRole}
              defaultBranchId={defaultBranchId}
              onSelectedRolesChange={setSelectedRoles}
              onSelectedBranchIdsChange={setSelectedBranchIds}
              onPrimaryRoleChange={setPrimaryRole}
              onDefaultBranchChange={setDefaultBranchId}
              disabled={submitting}
            />

            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-semibold leading-6 text-destructive"
              >
                {error}
              </p>
            ) : null}

            <div className="space-y-2 rounded-lg bg-muted/60 p-3 text-xs leading-6 text-muted-foreground">
              <p className="flex items-start gap-2">
                <Smartphone className="mt-0.5 size-4 shrink-0 text-accent-strong" />
                <span>الدعوة مرتبطة برقم الهاتف؛ لا يمكن استخدامها من رقم آخر.</span>
              </p>
              <p className="flex items-start gap-2">
                <Link2 className="mt-0.5 size-4 shrink-0 text-accent-strong" />
                <span>
                  سيظهر رابط لمرة واحدة بعد الإنشاء. لا يمكن استرجاعه لاحقًا؛ يمكنك إنشاء رابط جديد
                  من قائمة الدعوات عند الحاجة.
                </span>
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <LoaderCircle className="animate-spin" /> : <UserPlus />}
                إنشاء الدعوة
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
