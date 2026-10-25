import {
  AlertTriangle,
  Ban,
  Clock,
  MailQuestion,
  RefreshCw,
  RotateCcw,
  ShieldX,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getRoleLabel } from '@/features/auth/roles'
import { formatDateTime } from '@/lib/utils'

import type { InvitationStatus, StaffInvitation } from '../types'

interface InvitationsPanelProps {
  invitations: StaffInvitation[]
  loading: boolean
  error: string | null
  canManage: boolean
  onRefresh: () => void
  onCancel: (invitation: StaffInvitation) => void
  onRegenerate: (invitation: StaffInvitation) => void
}

const statusMeta: Record<
  InvitationStatus,
  {
    label: string
    variant: 'warning' | 'accent' | 'destructive' | 'secondary' | 'success'
    icon: LucideIcon
  }
> = {
  pending: { label: 'بانتظار فتح الرابط', variant: 'warning', icon: Clock },
  processing: { label: 'قيد الاستخدام الآن', variant: 'accent', icon: RefreshCw },
  accepted: { label: 'مقبولة', variant: 'success', icon: MailQuestion },
  cancelled: { label: 'ملغاة', variant: 'secondary', icon: Ban },
  expired: { label: 'منتهية الصلاحية', variant: 'destructive', icon: Clock },
  locked: { label: 'مقفلة بعد محاولات خاطئة', variant: 'destructive', icon: ShieldX },
}

function getInvitationRoles(invitation: StaffInvitation) {
  return invitation.roles && invitation.roles.length > 0
    ? invitation.roles.map((role) => role.code)
    : invitation.role_codes
}

function getInvitationBranches(invitation: StaffInvitation) {
  return (invitation.branches ?? []).map((branch) => branch.code)
}

export function InvitationsPanel({
  invitations,
  loading,
  error,
  canManage,
  onRefresh,
  onCancel,
  onRegenerate,
}: InvitationsPanelProps) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-extrabold">
            <MailQuestion className="size-4 text-accent-strong" />
            الدعوات المعلقة
            {invitations.length > 0 ? (
              <Badge variant="warning" className="font-mono">
                {invitations.length}
              </Badge>
            ) : null}
          </h2>
          <p className="mt-1 text-[11px] leading-6 text-muted-foreground">
            روابط لمرة واحدة. لا يمكن عرض الرابط السابق بعد إغلاقه؛ أنشئ رابطًا جديدًا لإرساله.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          aria-label="تحديث الدعوات"
        >
          <RefreshCw className={loading ? 'animate-spin' : undefined} />
          تحديث
        </Button>
      </div>

      {error ? (
        <div className="p-4">
          <EmptyState
            icon={AlertTriangle}
            title="تعذر تحميل الدعوات"
            description={error}
            action={
              <Button type="button" variant="outline" onClick={onRefresh}>
                <RefreshCw />
                إعادة المحاولة
              </Button>
            }
          />
        </div>
      ) : loading ? (
        <div className="space-y-3 p-4" role="status" aria-live="polite">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-40 max-w-full" />
                <Skeleton className="h-3 w-56 max-w-full" />
              </div>
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
      ) : invitations.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={MailQuestion}
            title="لا توجد دعوات معلقة"
            description="كل الدعوات السابقة قُبلت أو أُلغيت. استخدم زر «دعوة مستخدم» لإنشاء دعوة جديدة."
          />
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الموظف</TableHead>
                  <TableHead>الأدوار</TableHead>
                  <TableHead>الفروع</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>تنتهي في</TableHead>
                  <TableHead className="text-end">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => {
                  const meta = statusMeta[invitation.status]
                  const StatusIcon = meta.icon
                  const roles = getInvitationRoles(invitation)
                  const branches = getInvitationBranches(invitation)
                  const canAct = invitation.status !== 'processing'

                  return (
                    <TableRow key={invitation.invitation_id}>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="max-w-48 truncate text-sm font-bold">
                            {invitation.full_name}
                          </p>
                          <p
                            className="max-w-52 truncate font-mono text-[11px] text-muted-foreground"
                            dir="ltr"
                          >
                            {invitation.phone}
                          </p>
                          {invitation.created_by_name ? (
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              أنشأها {invitation.created_by_name}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-56 flex-wrap gap-1">
                          {roles.map((role) => (
                            <Badge
                              key={role}
                              variant={role === invitation.primary_role ? 'accent' : 'outline'}
                            >
                              {getRoleLabel(role)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-40 flex-wrap gap-1">
                          {branches.length > 0 ? (
                            branches.map((branch) => (
                              <Badge key={branch} variant="secondary" className="font-mono">
                                {branch}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={meta.variant}>
                          <StatusIcon className="size-3" />
                          {meta.label}
                        </Badge>
                        {invitation.status === 'pending' ? (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            المحاولات: {invitation.attempts}/{invitation.max_attempts}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">{formatDateTime(invitation.expires_at)}</span>
                      </TableCell>
                      <TableCell className="text-end">
                        {canManage && canAct ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => onRegenerate(invitation)}
                            >
                              <RotateCcw />
                              رابط جديد
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => onCancel(invitation)}
                            >
                              <Ban />
                              إلغاء
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className="divide-y divide-border md:hidden">
            {invitations.map((invitation) => {
              const meta = statusMeta[invitation.status]
              const StatusIcon = meta.icon
              const roles = getInvitationRoles(invitation)
              const branches = getInvitationBranches(invitation)
              const canAct = invitation.status !== 'processing'

              return (
                <article key={invitation.invitation_id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{invitation.full_name}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground" dir="ltr">
                        {invitation.phone}
                      </p>
                    </div>
                    <Badge variant={meta.variant}>
                      <StatusIcon className="size-3" />
                      {meta.label}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {roles.map((role) => (
                      <Badge
                        key={role}
                        variant={role === invitation.primary_role ? 'accent' : 'outline'}
                      >
                        {getRoleLabel(role)}
                      </Badge>
                    ))}
                    {branches.map((branch) => (
                      <Badge key={branch} variant="secondary" className="font-mono">
                        {branch}
                      </Badge>
                    ))}
                  </div>

                  <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Clock className="size-3.5" />
                    تنتهي في {formatDateTime(invitation.expires_at)}
                  </p>

                  {canManage && canAct ? (
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => onRegenerate(invitation)}
                      >
                        <RotateCcw />
                        رابط جديد
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="flex-1 text-destructive hover:text-destructive"
                        onClick={() => onCancel(invitation)}
                      >
                        <Ban />
                        إلغاء
                      </Button>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}
