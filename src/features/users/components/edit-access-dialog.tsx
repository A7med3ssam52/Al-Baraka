import { LoaderCircle, ShieldCheck } from 'lucide-react'
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
import { getRoleLabel, isUserRole } from '@/features/auth/roles'
import type { UserRole } from '@/types'

import { assignUserAccess } from '../api'
import type { BranchOption, DirectoryUser, RoleOption } from '../types'
import { RoleBranchSelector } from './role-branch-selector'

interface EditAccessDialogProps {
  user: DirectoryUser | null
  open: boolean
  onOpenChange: (open: boolean) => void
  roleOptions: RoleOption[]
  branchOptions: BranchOption[]
  onSaved: () => void
}

export function EditAccessDialog({
  user,
  open,
  onOpenChange,
  roleOptions,
  branchOptions,
  onSaved,
}: EditAccessDialogProps) {
  const initialRoles = (() => {
    const assigned = (user?.roles ?? [])
      .map((role) => role.code)
      .filter((code): code is UserRole => isUserRole(code))
    const unique = [...new Set(assigned)]
    if (unique.length > 0) return unique
    return user?.primary_role ? [user.primary_role] : []
  })()

  const initialBranches = (() => {
    const assigned = [...new Set((user?.branches ?? []).map((branch) => branch.id))]
    if (assigned.length > 0) return assigned
    return user?.default_branch_id ? [user.default_branch_id] : []
  })()

  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>(initialRoles)
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(initialBranches)
  const [primaryRole, setPrimaryRole] = useState<UserRole | ''>(
    user?.primary_role ?? initialRoles[0] ?? '',
  )
  const [defaultBranchId, setDefaultBranchId] = useState(
    user?.default_branch_id ?? initialBranches[0] ?? '',
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!user) return

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
      await assignUserAccess(user.user_id, {
        roles: selectedRoles,
        branchIds: selectedBranchIds,
        primaryRole,
        defaultBranchId,
      })
      toast.success('تم تحديث أدوار وفروع المستخدم.')
      onSaved()
      onOpenChange(false)
    } catch (accessError) {
      setError(
        accessError instanceof Error
          ? accessError.message
          : 'تعذر تحديث وصول المستخدم. حاول مرة أخرى.',
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-accent-strong" />
            تعديل الأدوار والفروع
          </DialogTitle>
          <DialogDescription>
            {user
              ? `حدد وصول ${user.full_name?.trim() || user.email} إلى الوحدات والفروع. الحفظ يستبدل الوصول الحالي بالكامل.`
              : 'حدد وصول المستخدم إلى الوحدات والفروع.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs leading-6">
            <span className="font-bold">الوصول الحالي: </span>
            {initialRoles.length > 0
              ? initialRoles.map((role) => getRoleLabel(role)).join('، ')
              : 'لا توجد أدوار مسندة'}
            {initialBranches.length > 0
              ? ` — ${(user?.branches ?? []).map((branch) => branch.code).join('، ')}`
              : ''}
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
              {submitting ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
              حفظ الوصول
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
