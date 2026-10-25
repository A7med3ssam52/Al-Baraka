import { Building2, ShieldCheck } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'
import { getRoleLabel } from '@/features/auth/roles'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/types'

import type { BranchOption, RoleOption } from '../types'

interface RoleBranchSelectorProps {
  roleOptions: RoleOption[]
  branchOptions: BranchOption[]
  selectedRoles: UserRole[]
  selectedBranchIds: string[]
  primaryRole: UserRole | ''
  defaultBranchId: string
  onSelectedRolesChange: (roles: UserRole[]) => void
  onSelectedBranchIdsChange: (ids: string[]) => void
  onPrimaryRoleChange: (role: UserRole | '') => void
  onDefaultBranchChange: (branchId: string) => void
  disabled?: boolean
}

export function RoleBranchSelector({
  roleOptions,
  branchOptions,
  selectedRoles,
  selectedBranchIds,
  primaryRole,
  defaultBranchId,
  onSelectedRolesChange,
  onSelectedBranchIdsChange,
  onPrimaryRoleChange,
  onDefaultBranchChange,
  disabled = false,
}: RoleBranchSelectorProps) {
  const toggleRole = (code: UserRole) => {
    const nextRoles = selectedRoles.includes(code)
      ? selectedRoles.filter((role) => role !== code)
      : [...selectedRoles, code]

    onSelectedRolesChange(nextRoles)

    if (!primaryRole || !nextRoles.includes(primaryRole)) {
      onPrimaryRoleChange(nextRoles[0] ?? '')
    }
  }

  const toggleBranch = (branchId: string) => {
    const nextBranches = selectedBranchIds.includes(branchId)
      ? selectedBranchIds.filter((id) => id !== branchId)
      : [...selectedBranchIds, branchId]

    onSelectedBranchIdsChange(nextBranches)

    if (!defaultBranchId || !nextBranches.includes(defaultBranchId)) {
      onDefaultBranchChange(nextBranches[0] ?? '')
    }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-accent-strong" />
          <h3 className="text-sm font-bold">الأدوار</h3>
        </div>
        <p className="text-xs leading-6 text-muted-foreground">
          يمكن إسناد أكثر من دور. الدور الأساسي يُستخدم للعرض السريع في القوائم.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {roleOptions.map((role) => {
            const checked = selectedRoles.includes(role.code)

            return (
              <label
                key={role.code}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                  checked
                    ? 'border-accent/50 bg-accent/5'
                    : 'border-border bg-card hover:bg-muted/40',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <Checkbox
                  checked={checked}
                  onChange={() => toggleRole(role.code)}
                  disabled={disabled}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{role.nameAr}</span>
                  {role.description ? (
                    <span className="mt-0.5 block text-[11px] leading-5 text-muted-foreground">
                      {role.description}
                    </span>
                  ) : null}
                </span>
              </label>
            )
          })}
        </div>

        <label className="block space-y-1.5">
          <span className="block text-xs font-bold">الدور الأساسي</span>
          <Select
            value={primaryRole}
            onChange={(event) => onPrimaryRoleChange(event.target.value as UserRole)}
            disabled={disabled || selectedRoles.length === 0}
          >
            {selectedRoles.length === 0 ? <option value="">اختر دورًا أولًا</option> : null}
            {selectedRoles.map((code) => (
              <option key={code} value={code}>
                {getRoleLabel(code)}
              </option>
            ))}
          </Select>
        </label>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-accent-strong" />
          <h3 className="text-sm font-bold">الفروع</h3>
        </div>
        <p className="text-xs leading-6 text-muted-foreground">
          يرى المستخدم بيانات الفروع المسندة إليه فقط.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {branchOptions.map((branch) => {
            const checked = selectedBranchIds.includes(branch.id)

            return (
              <label
                key={branch.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                  checked
                    ? 'border-accent/50 bg-accent/5'
                    : 'border-border bg-card hover:bg-muted/40',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <Checkbox
                  checked={checked}
                  onChange={() => toggleBranch(branch.id)}
                  disabled={disabled}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{branch.name}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                    {branch.code}
                  </span>
                </span>
              </label>
            )
          })}
        </div>

        <label className="block space-y-1.5">
          <span className="block text-xs font-bold">الفرع الافتراضي</span>
          <Select
            value={defaultBranchId}
            onChange={(event) => onDefaultBranchChange(event.target.value)}
            disabled={disabled || selectedBranchIds.length === 0}
          >
            {selectedBranchIds.length === 0 ? <option value="">اختر فرعًا أولًا</option> : null}
            {selectedBranchIds.map((branchId) => {
              const branch = branchOptions.find((option) => option.id === branchId)
              return (
                <option key={branchId} value={branchId}>
                  {branch ? `${branch.name} — ${branch.code}` : branchId}
                </option>
              )
            })}
          </Select>
        </label>
      </section>
    </div>
  )
}
