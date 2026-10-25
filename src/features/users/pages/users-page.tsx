import {
  AlertTriangle,
  KeyRound,
  MailQuestion,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserPlus,
  UserRound,
  UserX,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
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
import { useAuth } from '@/features/auth/use-auth'
import { cn, formatDateTime } from '@/lib/utils'

import {
  fallbackRoleOptions,
  fetchBranchOptions,
  fetchDirectoryUsers,
  fetchRoleOptions,
  fetchStaffInvitations,
  translateUserError,
} from '../api'
import { ActionLinkDialog } from '../components/action-link-dialog'
import { CancelInvitationDialog } from '../components/cancel-invitation-dialog'
import { EditAccessDialog } from '../components/edit-access-dialog'
import { EditProfileDialog } from '../components/edit-profile-dialog'
import { InvitationLinkDialog } from '../components/invitation-link-dialog'
import { InvitationsPanel } from '../components/invitations-panel'
import { InviteUserDialog } from '../components/invite-user-dialog'
import { UserStatusDialog } from '../components/user-status-dialog'
import type { BranchOption, DirectoryUser, RoleOption, StaffInvitation } from '../types'

type StatusFilter = 'all' | 'active' | 'pending' | 'inactive'

const statusFilterLabels: Record<StatusFilter, string> = {
  all: 'كل الحالات',
  active: 'نشط',
  pending: 'غير مؤكد',
  inactive: 'معطل',
}

function getUserStatus(user: DirectoryUser) {
  if (!user.is_active) {
    return { label: 'معطل', variant: 'destructive' as const, icon: UserX }
  }

  if (!user.email_confirmed) {
    return { label: 'دعوة معلقة', variant: 'warning' as const, icon: MailQuestion }
  }

  return { label: 'نشط', variant: 'success' as const, icon: UserCheck }
}

function getDisplayName(user: DirectoryUser) {
  return user.full_name?.trim() || user.email.split('@')[0] || 'مستخدم'
}

function getInitial(user: DirectoryUser) {
  return getDisplayName(user).trim().charAt(0) || 'م'
}

function getUserRoles(user: DirectoryUser) {
  const roles = [...new Set((user.roles ?? []).map((role) => role.code))]
  return roles.length > 0 ? roles : [user.primary_role]
}

function getUserBranches(user: DirectoryUser) {
  const branches = [...new Set((user.branches ?? []).map((branch) => branch.code))]
  return branches
}

interface StatCardProps {
  label: string
  value: number
  hint: string
  icon: LucideIcon
  tone: 'primary' | 'success' | 'warning' | 'muted'
}

const statToneClasses: Record<StatCardProps['tone'], string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  muted: 'bg-muted text-muted-foreground',
}

function StatCard({ label, value, hint, icon: Icon, tone }: StatCardProps) {
  return (
    <Card className="gap-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-lg',
            statToneClasses[tone],
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="text-2xl font-extrabold">{value}</p>
      <p className="text-[11px] leading-5 text-muted-foreground">{hint}</p>
    </Card>
  )
}

interface UserActionsProps {
  user: DirectoryUser
  currentUserId: string | null
  isOwner: boolean
  canAssign: boolean
  canUpdate: boolean
  canDeactivate: boolean
  canReset: boolean
  onEditProfile: (user: DirectoryUser) => void
  onEditAccess: (user: DirectoryUser) => void
  onStatus: (user: DirectoryUser) => void
  onActionLink: (user: DirectoryUser) => void
}

function UserActions({
  user,
  currentUserId,
  isOwner,
  canAssign,
  canUpdate,
  canDeactivate,
  canReset,
  onEditProfile,
  onEditAccess,
  onStatus,
  onActionLink,
}: UserActionsProps) {
  const isSelf = user.user_id === currentUserId
  const targetIsOwner =
    user.primary_role === 'owner' || (user.roles ?? []).some((role) => role.code === 'owner')
  const canTouchOwner = isOwner || !targetIsOwner

  const showProfile = canUpdate && canTouchOwner
  const showAccess = canAssign && canTouchOwner && !isSelf
  const showStatus = canDeactivate && canTouchOwner && !isSelf
  const showReset = canReset && canTouchOwner && user.email_confirmed
  const hasActions = showProfile || showAccess || showStatus || showReset

  if (!hasActions) {
    return <span className="text-[11px] text-muted-foreground">—</span>
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`إجراءات ${getDisplayName(user)}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {showProfile ? (
          <DropdownMenuItem onSelect={() => onEditProfile(user)}>
            <UserRound className="size-4" />
            تعديل البيانات
          </DropdownMenuItem>
        ) : null}
        {showAccess ? (
          <DropdownMenuItem onSelect={() => onEditAccess(user)}>
            <ShieldCheck className="size-4" />
            تعديل الأدوار والفروع
          </DropdownMenuItem>
        ) : null}
        {showReset ? <DropdownMenuSeparator /> : null}
        {showReset ? (
          <DropdownMenuItem onSelect={() => onActionLink(user)}>
            <KeyRound className="size-4" />
            رابط إعادة تعيين كلمة المرور
          </DropdownMenuItem>
        ) : null}
        {showStatus ? <DropdownMenuSeparator /> : null}
        {showStatus ? (
          <DropdownMenuItem
            variant={user.is_active ? 'destructive' : 'default'}
            onSelect={() => onStatus(user)}
          >
            {user.is_active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
            {user.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function UsersPage() {
  const { appUser, hasPermission, isOwner } = useAuth()
  const canInvite = hasPermission('users.create')
  const canAssign = hasPermission('users.assign_role')
  const canUpdate = hasPermission('users.update')
  const canDeactivate = hasPermission('users.deactivate')
  const canReset = hasPermission('users.reset_password')

  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([])
  const [branchOptions, setBranchOptions] = useState<BranchOption[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  const [invitations, setInvitations] = useState<StaffInvitation[]>([])
  const [invitationsLoading, setInvitationsLoading] = useState(true)
  const [invitationsError, setInvitationsError] = useState<string | null>(null)
  const [invitationsReloadKey, setInvitationsReloadKey] = useState(0)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [editAccessUser, setEditAccessUser] = useState<DirectoryUser | null>(null)
  const [editProfileUser, setEditProfileUser] = useState<DirectoryUser | null>(null)
  const [statusUser, setStatusUser] = useState<DirectoryUser | null>(null)
  const [actionLinkUser, setActionLinkUser] = useState<DirectoryUser | null>(null)
  const [cancelInvitation, setCancelInvitation] = useState<StaffInvitation | null>(null)
  const [regenerateInvitation, setRegenerateInvitation] = useState<StaffInvitation | null>(null)

  const requestRef = useRef(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const loadUsers = () => {
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  const loadInvitations = () => {
    setInvitationsLoading(true)
    setInvitationsReloadKey((key) => key + 1)
  }

  useEffect(() => {
    let active = true
    const requestId = requestRef.current + 1
    requestRef.current = requestId

    fetchDirectoryUsers(debouncedSearch)
      .then((nextUsers) => {
        if (!active || requestId !== requestRef.current) return
        setUsers(nextUsers)
        setError(null)
      })
      .catch((loadError: unknown) => {
        if (!active || requestId !== requestRef.current) return
        setError(
          loadError instanceof Error ? loadError.message : translateUserError('lookup_failed'),
        )
      })
      .finally(() => {
        if (active && requestId === requestRef.current) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [debouncedSearch, reloadKey])

  useEffect(() => {
    let active = true

    fetchStaffInvitations(debouncedSearch)
      .then((nextInvitations) => {
        if (!active) return
        setInvitations(nextInvitations)
        setInvitationsError(null)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setInvitationsError(
          loadError instanceof Error ? loadError.message : translateUserError('lookup_failed'),
        )
      })
      .finally(() => {
        if (active) setInvitationsLoading(false)
      })

    return () => {
      active = false
    }
  }, [debouncedSearch, invitationsReloadKey])

  useEffect(() => {
    if (!canInvite && !canAssign) return

    let active = true

    void Promise.allSettled([fetchRoleOptions(), fetchBranchOptions()]).then(
      ([rolesResult, branchesResult]) => {
        if (!active) return

        if (rolesResult.status === 'fulfilled' && rolesResult.value.length > 0) {
          setRoleOptions(rolesResult.value)
        } else {
          setRoleOptions(fallbackRoleOptions(isOwner))
        }

        if (branchesResult.status === 'fulfilled' && branchesResult.value.length > 0) {
          setBranchOptions(branchesResult.value)
        } else {
          setBranchOptions(
            (appUser?.branches ?? []).map((branch) => ({
              id: branch.id,
              code: branch.code,
              name: branch.name,
            })),
          )
        }
      },
    )

    return () => {
      active = false
    }
  }, [appUser, canAssign, canInvite, isOwner])

  const visibleRoleOptions = useMemo(
    () => roleOptions.filter((role) => isOwner || role.code !== 'owner'),
    [isOwner, roleOptions],
  )
  const optionsReady = visibleRoleOptions.length > 0 && branchOptions.length > 0

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        if (statusFilter === 'active') return user.is_active && user.email_confirmed
        if (statusFilter === 'pending') return user.is_active && !user.email_confirmed
        if (statusFilter === 'inactive') return !user.is_active
        return true
      }),
    [statusFilter, users],
  )

  const activeCount = users.filter((user) => user.is_active && user.email_confirmed).length
  const pendingInvitationCount = invitations.filter(
    (invitation) => invitation.status === 'pending' || invitation.status === 'processing',
  ).length
  const inactiveCount = users.filter((user) => !user.is_active).length

  const handleSaved = () => {
    loadUsers()
    loadInvitations()
  }

  const handleInvitationsChanged = () => {
    loadInvitations()
  }

  const handleActionLink = (user: DirectoryUser) => {
    setActionLinkUser(user)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="إدارة النظام"
        title="المستخدمون"
        description="إدارة الحسابات والأدوار والفروع والدعوات. كل تغيير على الوصول يُسجّل في سجل المراجعة."
        actions={
          canInvite ? (
            <Button type="button" onClick={() => setInviteOpen(true)} disabled={!optionsReady}>
              <UserPlus />
              دعوة مستخدم
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="إجمالي المستخدمين"
          value={users.length}
          hint="الحسابات الظاهرة ضمن نطاق صلاحيتك"
          icon={Users}
          tone="primary"
        />
        <StatCard
          label="حسابات نشطة"
          value={activeCount}
          hint="مؤكدة ويمكنها الدخول الآن"
          icon={UserCheck}
          tone="success"
        />
        <StatCard
          label="دعوات معلقة"
          value={pendingInvitationCount}
          hint="روابط لم تُستخدم بعد وبانتظار فتحها"
          icon={MailQuestion}
          tone="warning"
        />
        <StatCard
          label="حسابات معطلة"
          value={inactiveCount}
          hint="لا تستطيع الدخول حتى تُفعّل من جديد"
          icon={UserX}
          tone="muted"
        />
      </div>

      <InvitationsPanel
        invitations={invitations}
        loading={invitationsLoading}
        error={invitationsError}
        canManage={canInvite}
        onRefresh={() => void loadInvitations()}
        onCancel={setCancelInvitation}
        onRegenerate={setRegenerateInvitation}
      />

      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث بالاسم أو البريد أو الهاتف..."
              aria-label="بحث المستخدمين"
              className="ps-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              aria-label="تصفية حسب الحالة"
              className="w-40"
            >
              {(Object.keys(statusFilterLabels) as StatusFilter[]).map((value) => (
                <option key={value} value={value}>
                  {statusFilterLabels[value]}
                </option>
              ))}
            </Select>

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void loadUsers()}
              disabled={loading}
              aria-label="تحديث القائمة"
            >
              <RefreshCw className={loading ? 'animate-spin' : undefined} />
            </Button>
          </div>
        </div>

        {error ? (
          <div className="p-4">
            <EmptyState
              icon={AlertTriangle}
              title="تعذر تحميل المستخدمين"
              description={error}
              action={
                <Button type="button" variant="outline" onClick={() => void loadUsers()}>
                  <RefreshCw />
                  إعادة المحاولة
                </Button>
              }
            />
          </div>
        ) : loading ? (
          <div className="space-y-3 p-4" role="status" aria-live="polite">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-40 max-w-full" />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={UserCog}
              title={users.length === 0 ? 'لا يوجد مستخدمون بعد' : 'لا توجد نتائج مطابقة'}
              description={
                users.length === 0
                  ? 'ابدأ بدعوة أول مستخدم وحدد دوره وفرعه.'
                  : 'جرّب تعديل كلمة البحث أو تصفية الحالة.'
              }
              action={
                canInvite && users.length === 0 ? (
                  <Button
                    type="button"
                    onClick={() => setInviteOpen(true)}
                    disabled={!optionsReady}
                  >
                    <UserPlus />
                    دعوة مستخدم
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المستخدم</TableHead>
                    <TableHead>الأدوار</TableHead>
                    <TableHead>الفروع</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>آخر دخول</TableHead>
                    <TableHead className="text-end">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => {
                    const status = getUserStatus(user)
                    const StatusIcon = status.icon
                    const roles = getUserRoles(user)
                    const branches = getUserBranches(user)

                    return (
                      <TableRow key={user.user_id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                'grid size-9 shrink-0 place-items-center rounded-full text-xs font-extrabold',
                                user.is_active
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground',
                              )}
                            >
                              {getInitial(user)}
                            </div>
                            <div className="min-w-0">
                              <p className="max-w-48 truncate text-sm font-bold">
                                {getDisplayName(user)}
                              </p>
                              <p
                                className="max-w-52 truncate text-[11px] text-muted-foreground"
                                dir="ltr"
                              >
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex max-w-56 flex-wrap gap-1">
                            {roles.map((role) => (
                              <Badge
                                key={role}
                                variant={role === user.primary_role ? 'accent' : 'outline'}
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
                          <Badge variant={status.variant}>
                            <StatusIcon className="size-3" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">
                            {user.last_sign_in_at ? (
                              <span>{formatDateTime(user.last_sign_in_at)}</span>
                            ) : (
                              <span className="text-muted-foreground">لم يسجل الدخول</span>
                            )}
                          </div>
                          {user.invited_at && !user.email_confirmed ? (
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              دُعي في {formatDateTime(user.invited_at)}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-end">
                          <UserActions
                            user={user}
                            currentUserId={appUser?.id ?? null}
                            isOwner={isOwner}
                            canAssign={canAssign}
                            canUpdate={canUpdate}
                            canDeactivate={canDeactivate}
                            canReset={canReset}
                            onEditProfile={setEditProfileUser}
                            onEditAccess={setEditAccessUser}
                            onStatus={setStatusUser}
                            onActionLink={handleActionLink}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="divide-y divide-border md:hidden">
              {filteredUsers.map((user) => {
                const status = getUserStatus(user)
                const StatusIcon = status.icon
                const roles = getUserRoles(user)
                const branches = getUserBranches(user)

                return (
                  <article key={user.user_id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={cn(
                            'grid size-10 shrink-0 place-items-center rounded-full text-sm font-extrabold',
                            user.is_active
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {getInitial(user)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{getDisplayName(user)}</p>
                          <p className="truncate text-[11px] text-muted-foreground" dir="ltr">
                            {user.email}
                          </p>
                        </div>
                      </div>
                      <UserActions
                        user={user}
                        currentUserId={appUser?.id ?? null}
                        isOwner={isOwner}
                        canAssign={canAssign}
                        canUpdate={canUpdate}
                        canDeactivate={canDeactivate}
                        canReset={canReset}
                        onEditProfile={setEditProfileUser}
                        onEditAccess={setEditAccessUser}
                        onStatus={setStatusUser}
                        onActionLink={handleActionLink}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Badge variant={status.variant}>
                        <StatusIcon className="size-3" />
                        {status.label}
                      </Badge>
                      {roles.map((role) => (
                        <Badge
                          key={role}
                          variant={role === user.primary_role ? 'accent' : 'outline'}
                        >
                          {getRoleLabel(role)}
                        </Badge>
                      ))}
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <dt className="text-muted-foreground">الفروع</dt>
                        <dd className="mt-0.5 font-semibold">
                          {branches.length > 0 ? branches.join('، ') : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">آخر دخول</dt>
                        <dd className="mt-0.5 font-semibold">
                          {user.last_sign_in_at
                            ? formatDateTime(user.last_sign_in_at)
                            : 'لم يسجل الدخول'}
                        </dd>
                      </div>
                    </dl>
                  </article>
                )
              })}
            </div>

            <div className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
              عرض {filteredUsers.length} من {users.length} مستخدم
              {debouncedSearch ? ` — نتائج البحث عن «${debouncedSearch}»` : ''}
            </div>
          </>
        )}
      </Card>

      {inviteOpen ? (
        <InviteUserDialog
          open
          onOpenChange={setInviteOpen}
          roleOptions={visibleRoleOptions}
          branchOptions={branchOptions}
          onInvited={handleSaved}
        />
      ) : null}

      <EditAccessDialog
        key={editAccessUser?.user_id ?? 'edit-access'}
        user={editAccessUser}
        open={Boolean(editAccessUser)}
        onOpenChange={(open) => {
          if (!open) setEditAccessUser(null)
        }}
        roleOptions={visibleRoleOptions}
        branchOptions={branchOptions}
        onSaved={handleSaved}
      />

      <EditProfileDialog
        key={editProfileUser?.user_id ?? 'edit-profile'}
        user={editProfileUser}
        open={Boolean(editProfileUser)}
        onOpenChange={(open) => {
          if (!open) setEditProfileUser(null)
        }}
        onSaved={handleSaved}
      />

      <UserStatusDialog
        user={statusUser}
        open={Boolean(statusUser)}
        onOpenChange={(open) => {
          if (!open) setStatusUser(null)
        }}
        onSaved={handleSaved}
      />

      {actionLinkUser ? (
        <ActionLinkDialog
          key={actionLinkUser.user_id}
          user={actionLinkUser}
          onOpenChange={(open) => {
            if (!open) setActionLinkUser(null)
          }}
        />
      ) : null}

      {cancelInvitation ? (
        <CancelInvitationDialog
          key={cancelInvitation.invitation_id}
          invitation={cancelInvitation}
          onOpenChange={(open) => {
            if (!open) setCancelInvitation(null)
          }}
          onCancelled={handleInvitationsChanged}
        />
      ) : null}

      {regenerateInvitation ? (
        <InvitationLinkDialog
          key={regenerateInvitation.invitation_id}
          invitation={regenerateInvitation}
          onOpenChange={(open) => {
            if (!open) setRegenerateInvitation(null)
          }}
          onRegenerated={handleInvitationsChanged}
        />
      ) : null}
    </div>
  )
}
