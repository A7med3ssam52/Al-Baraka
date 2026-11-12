import {
  BadgeCheck,
  BarChart3,
  BellRing,
  CalendarClock,
  CreditCard,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
  Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
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
import { useAuth } from '@/features/auth/use-auth'
import { CollectionsReportPanel } from '@/features/reports/components/collections-report-panel'
import { Checkbox } from '@/components/ui/checkbox'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

import {
  cancelActiveContract,
  collectInstallment,
  deleteInstallments,
  fetchInstallments,
  generateOverdueNotifications,
  rescheduleInstallment,
  translateInstallmentError,
  waiveInstallment,
} from '../api'
import { AddInstallmentDialog } from '../components/add-installment-dialog'
import { CollectInstallmentDialog } from '../components/collect-installment-dialog'
import { EditContractDialog } from '../components/edit-contract-dialog'
import { EditInstallmentDialog } from '../components/edit-installment-dialog'
import { RescheduleInstallmentDialog } from '../components/reschedule-installment-dialog'
import { WaiveInstallmentDialog } from '../components/waive-installment-dialog'
import {
  installmentStatusBadge,
  installmentStatusLabels,
  resolveInstallmentStatus,
  summarizeInstallments,
  type CollectInstallmentInput,
  type InstallmentRow,
  type InstallmentStatusFilter,
  type RescheduleInstallmentInput,
  type WaiveInstallmentInput,
} from '../types'

type Tab = 'installments' | 'collections'

const statusOptions: { value: InstallmentStatusFilter; label: string }[] = [
  { value: 'all', label: 'كل الحالات' },
  { value: 'overdue', label: 'المتأخرة' },
  { value: 'due', label: 'المستحقة اليوم' },
  { value: 'partial', label: 'المدفوعة جزئيًا' },
  { value: 'pending', label: 'لم يحن موعدها' },
  { value: 'paid', label: 'المدفوعة' },
  { value: 'waived', label: 'المسواة (إعفاء)' },
]

export function InstallmentsPage() {
  const { appUser, hasPermission } = useAuth()
  const branches = appUser?.branches ?? []

  const canCollect = hasPermission('installments.collect')
  const canReschedule = hasPermission('installments.reschedule')
  const canWaive = hasPermission('installments.waive')
  const canViewCollections = hasPermission('reports.view')
  const canNotify = hasPermission('collections.create') || hasPermission('installments.collect')
  const canCreateInstallments = hasPermission('contracts.create')
  const canUpdateContract = hasPermission('contracts.update')
  const canCancelContract = hasPermission('contracts.cancel')

  const [tab, setTab] = useState<Tab>('installments')
  const [rows, setRows] = useState<InstallmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [generating, setGenerating] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<InstallmentStatusFilter>('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')

  const [selected, setSelected] = useState<InstallmentRow | null>(null)
  const [collectOpen, setCollectOpen] = useState(false)
  const [waiveOpen, setWaiveOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editContractOpen, setEditContractOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    let active = true
    fetchInstallments({
      branchId: branchFilter === 'all' ? null : branchFilter,
      dueFrom: dueFrom || null,
      dueTo: dueTo || null,
    })
      .then((data) => {
        if (!active) return
        const existing = new Set(data.map((row) => row.id))
        setCheckedIds((current) => {
          const next = new Set([...current].filter((id) => existing.has(id)))
          return next.size === current.size ? current : next
        })
        setRows(data)
        setError(null)
      })
      .catch((fetchError) => {
        if (active) setError(translateInstallmentError(fetchError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [branchFilter, dueFrom, dueTo, reloadKey])

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase()

    return rows.filter((row) => {
      const status = resolveInstallmentStatus(row)

      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (!term) return true

      return (
        row.customer_name.toLowerCase().includes(term) ||
        row.customer_code.toLowerCase().includes(term) ||
        row.contract_number.toLowerCase().includes(term) ||
        (row.customer_mobile ?? '').includes(term)
      )
    })
  }, [rows, search, statusFilter])

  const summary = useMemo(() => summarizeInstallments(rows), [rows])

  // الحذف القسري متاح على أي قسط (حتى المدفوع) — التحديد على الصفوف الظاهرة.
  const visibleIds = useMemo(() => visibleRows.map((row) => row.id), [visibleRows])
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => checkedIds.has(id))
  const someSelected = visibleIds.some((id) => checkedIds.has(id))
  const checkedRow =
    checkedIds.size === 1 ? (rows.find((row) => row.id === [...checkedIds][0]) ?? null) : null

  function toggleRow(id: string) {
    setCheckedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setCheckedIds((current) => {
      if (allSelected) {
        const next = new Set(current)
        visibleIds.forEach((id) => next.delete(id))
        return next
      }
      return new Set([...current, ...visibleIds])
    })
  }

  function reload() {
    setLoading(true)
    setCheckedIds(new Set())
    setReloadKey((key) => key + 1)
  }

  function updateBranch(value: string) {
    setLoading(true)
    setBranchFilter(value)
  }

  function updateDueFrom(value: string) {
    setLoading(true)
    setDueFrom(value)
  }

  function updateDueTo(value: string) {
    setLoading(true)
    setDueTo(value)
  }

  function openCollect(row: InstallmentRow) {
    setSelected(row)
    setCollectOpen(true)
  }

  function openWaive(row: InstallmentRow) {
    setSelected(row)
    setWaiveOpen(true)
  }

  function openReschedule(row: InstallmentRow) {
    setSelected(row)
    setRescheduleOpen(true)
  }

  async function handleCollect(input: CollectInstallmentInput) {
    await collectInstallment(input)
  }

  async function handleWaive(input: WaiveInstallmentInput) {
    await waiveInstallment(input)
  }

  async function handleReschedule(input: RescheduleInstallmentInput) {
    await rescheduleInstallment(input)
  }

  async function handleDeleteConfirm() {
    const result = await deleteInstallments({ installment_ids: [...checkedIds] })
    const count = result.reduce((sum, row) => sum + Number(row.deleted_count), 0)
    const total = result.reduce((sum, row) => sum + Number(row.deleted_amount), 0)
    toast.success(
      `تم حذف ${count} قسطًا بقيمة ${formatCurrency(total)} وأُعيد احتساب إجمالي العقد.`,
    )
    reload()
  }

  async function handleGenerateOverdue() {
    setGenerating(true)
    try {
      const count = await generateOverdueNotifications(branchFilter === 'all' ? null : branchFilter)

      if (count > 0) {
        toast.success(`تم إنشاء ${count} تنبيهًا للمتأخرات.`)
      } else {
        toast.info('لا توجد متأخرات جديدة تستحق تنبيهًا اليوم.')
      }
    } catch (notifyError) {
      toast.error(translateInstallmentError(notifyError))
    } finally {
      setGenerating(false)
    }
  }

  const stats = [
    {
      label: 'إجمالي الأقساط',
      value: formatCurrency(summary.total_amount),
      hint: `${rows.length} قسط في النطاق الحالي`,
      icon: CreditCard,
      tone: 'neutral' as const,
    },
    {
      label: 'المحصَّل',
      value: formatCurrency(summary.total_paid),
      hint:
        summary.waived_amount > 0
          ? `${summary.paid_count} قسط مكتمل — ${formatCurrency(summary.waived_amount)} إعفاء`
          : `${summary.paid_count} قسط مكتمل`,
      icon: Wallet,
      tone: 'positive' as const,
    },
    {
      label: 'المتبقي',
      value: formatCurrency(summary.total_remaining),
      hint: `${summary.pending_count} قسط لم يحن موعده`,
      icon: BarChart3,
      tone: 'neutral' as const,
    },
    {
      label: 'متأخرات',
      value: formatCurrency(summary.overdue_amount),
      hint: `${summary.overdue_count} قسط متأخر — ${summary.due_count} مستحق اليوم`,
      icon: TriangleAlert,
      tone: summary.overdue_count > 0 ? ('warning' as const) : ('neutral' as const),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="الأقساط والتحصيل"
        description="جداول الأقساط، التحصيل الكامل والجزئي، الإعفاء وإعادة الجدولة، ومتابعة المتأخرات — كل حركة تُحدِّث الخزنة وسجل العميل."
        actions={
          <>
            {canCreateInstallments ? (
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="size-4" />
                إضافة أقساط
              </Button>
            ) : null}
            {canReschedule ? (
              <>
                <Button
                  variant="outline"
                  disabled={checkedIds.size !== 1}
                  onClick={() => {
                    if (!checkedRow) return
                    setSelected(checkedRow)
                    setEditOpen(true)
                  }}
                  title={
                    checkedIds.size === 1 ? 'تعديل القسط المحدد' : 'حدد قسطًا واحدًا فقط لتعديله'
                  }
                >
                  <Pencil className="size-4" />
                  تعديل
                </Button>
                <Button
                  variant="destructive"
                  disabled={checkedIds.size === 0}
                  onClick={() => setDeleteOpen(true)}
                  title="حذف الأقساط غير المدفوعة المحددة دفعة واحدة"
                >
                  <Trash2 className="size-4" />
                  حذف{checkedIds.size > 0 ? ` (${checkedIds.size})` : ''}
                </Button>
              </>
            ) : null}
            <Button variant="outline" onClick={reload} disabled={loading}>
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
              تحديث
            </Button>
            {canNotify ? (
              <Button variant="outline" onClick={handleGenerateOverdue} disabled={generating}>
                {generating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <BellRing className="size-4" />
                )}
                تنبيهات المتأخرات
              </Button>
            ) : null}
          </>
        }
      />

      <nav
        aria-label="تبويبات الأقساط"
        className="flex gap-1 overflow-x-auto rounded-lg border bg-card px-1 py-1 text-sm"
      >
        <button
          type="button"
          onClick={() => setTab('installments')}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 font-semibold transition-colors',
            tab === 'installments'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <CreditCard className="size-4" />
          الأقساط
        </button>
        {canViewCollections ? (
          <button
            type="button"
            onClick={() => setTab('collections')}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 font-semibold transition-colors',
              tab === 'collections'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <BarChart3 className="size-4" />
            تقارير التحصيل
          </button>
        ) : null}
      </nav>

      {tab === 'collections' ? (
        canViewCollections ? (
          <CollectionsReportPanel branches={branches} />
        ) : (
          <Card className="p-6">
            <EmptyState
              icon={BarChart3}
              title="لا تملك صلاحية عرض التقارير"
              description="تقارير التحصيل متاحة لمن يملك صلاحية عرض التقارير."
            />
          </Card>
        )
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="ملخص الأقساط">
            {loading
              ? Array.from({ length: 4 }).map((_, index) => (
                  <Card key={`installment-stat-skeleton-${index}`} className="gap-3">
                    <CardHeader className="items-center">
                      <Skeleton className="h-4 w-24" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-8 w-32" />
                      <Skeleton className="mt-3 h-3 w-24" />
                    </CardContent>
                  </Card>
                ))
              : stats.map((stat) => (
                  <Card key={stat.label} className="gap-3">
                    <CardHeader className="items-center">
                      <CardDescription className="font-semibold">{stat.label}</CardDescription>
                      <span className="grid size-9 place-items-center rounded-lg bg-primary/5 text-primary">
                        <stat.icon className="size-4" />
                      </span>
                    </CardHeader>
                    <CardContent>
                      <p
                        className={cn(
                          'text-2xl font-extrabold tracking-tight',
                          stat.tone === 'warning' && 'text-destructive',
                        )}
                      >
                        {stat.value}
                      </p>
                      <p className="mt-3 truncate text-[11px] text-muted-foreground">{stat.hint}</p>
                    </CardContent>
                  </Card>
                ))}
          </section>

          <Card className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">بحث</span>
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  placeholder="اسم العميل، الكود، العقد، الموبايل"
                  className="ps-9"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الحالة</span>
              <Select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as InstallmentStatusFilter)}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الفرع</span>
              <Select value={branchFilter} onChange={(event) => updateBranch(event.target.value)}>
                <option value="all">كل الفروع</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} ({branch.code})
                  </option>
                ))}
              </Select>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">استحقاق من</span>
              <Input
                type="date"
                value={dueFrom}
                onChange={(event) => updateDueFrom(event.target.value)}
              />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">استحقاق إلى</span>
              <Input
                type="date"
                value={dueTo}
                onChange={(event) => updateDueTo(event.target.value)}
              />
            </label>
          </Card>

          {error ? (
            <Card className="p-4 text-sm text-destructive">
              <div className="flex items-center gap-2">
                <TriangleAlert className="size-4" />
                {error}
              </div>
            </Card>
          ) : loading ? (
            <Card className="p-4">
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            </Card>
          ) : visibleRows.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={CreditCard}
                title={rows.length === 0 ? 'لا أقساط في هذا النطاق' : 'لا نتائج مطابقة للفلاتر'}
                description={
                  rows.length === 0
                    ? 'أنشئ عقد تقسيط واعتمده لتوليد جدول الأقساط، ثم عُد إلى هذه الشاشة للتحصيل.'
                    : 'جرّب تغيير الحالة أو البحث أو نطاق تاريخ الاستحقاق.'
                }
              />
            </Card>
          ) : (
            <Card className="m-0 p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {canReschedule ? (
                      <TableHead className="w-10">
                        <Checkbox
                          aria-label="تحديد كل الأقساط الظاهرة"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected && !allSelected
                          }}
                          onChange={toggleAll}
                          disabled={visibleIds.length === 0}
                        />
                      </TableHead>
                    ) : null}
                    <TableHead>العميل</TableHead>
                    <TableHead>العقد</TableHead>
                    <TableHead className="hidden sm:table-cell">القسط</TableHead>
                    <TableHead>الاستحقاق</TableHead>
                    <TableHead className="hidden md:table-cell">القيمة</TableHead>
                    <TableHead className="hidden md:table-cell">المسدد</TableHead>
                    <TableHead>المتبقي</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => {
                    const status = resolveInstallmentStatus(row)
                    const actionable = status !== 'paid' && status !== 'waived'

                    return (
                      <TableRow
                        key={row.id}
                        className={cn(status === 'overdue' && 'bg-destructive/[0.04]')}
                      >
                        {canReschedule ? (
                          <TableCell>
                            <Checkbox
                              aria-label={`تحديد القسط #${row.installment_no} من عقد ${row.contract_number}`}
                              checked={checkedIds.has(row.id)}
                              onChange={() => toggleRow(row.id)}
                              title="حذف قسري — سيُحذف حتى لو فيه تحصيل"
                            />
                          </TableCell>
                        ) : null}
                        <TableCell>
                          <div className="grid gap-0.5">
                            <span className="font-semibold">{row.customer_name}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {row.customer_code}
                              {row.customer_mobile ? ` — ${row.customer_mobile}` : ''}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.contract_number}</TableCell>
                        <TableCell className="hidden text-xs sm:table-cell">
                          #{row.installment_no}
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(row.due_date)}</TableCell>
                        <TableCell className="hidden text-xs md:table-cell">
                          {formatCurrency(row.amount)}
                        </TableCell>
                        <TableCell className="hidden text-xs md:table-cell">
                          {formatCurrency(row.paid_amount)}
                        </TableCell>
                        <TableCell className="text-xs font-semibold">
                          {formatCurrency(Math.max(row.remaining_amount, 0))}
                        </TableCell>
                        <TableCell>
                          <div className="grid gap-1">
                            <Badge variant={installmentStatusBadge[status]}>
                              {installmentStatusLabels[status]}
                            </Badge>
                            {row.legacy_paid ? (
                              <span className="w-fit rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-[#7a5a13]">
                                دفتر قديم
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-left">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {actionable ? (
                              <>
                                {canReschedule ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelected(row)
                                      setEditOpen(true)
                                    }}
                                    title="تعديل القسط"
                                  >
                                    <Pencil className="size-4" />
                                  </Button>
                                ) : null}
                                {canCollect ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openCollect(row)}
                                    title="تحصيل"
                                  >
                                    <Wallet className="size-4" />
                                    <span className="hidden lg:inline">تحصيل</span>
                                  </Button>
                                ) : null}
                                {canReschedule ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openReschedule(row)}
                                    title="إعادة جدولة"
                                  >
                                    <CalendarClock className="size-4" />
                                  </Button>
                                ) : null}
                                {canWaive ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openWaive(row)}
                                    title="إعفاء"
                                  >
                                    <BadgeCheck className="size-4" />
                                  </Button>
                                ) : null}
                                {canUpdateContract ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelected(row)
                                      setEditContractOpen(true)
                                    }}
                                    title="تعديل العقد"
                                  >
                                    <Pencil className="size-4" />
                                    <span className="hidden lg:inline">العقد</span>
                                  </Button>
                                ) : null}
                                {canCancelContract ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelected(row)
                                      setCancelOpen(true)
                                    }}
                                    title="إلغاء العقد"
                                  >
                                    <Trash2 className="size-4 text-destructive" />
                                  </Button>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      <AddInstallmentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => {
          setAddOpen(false)
          reload()
        }}
      />

      <CollectInstallmentDialog
        open={collectOpen}
        installment={selected}
        onOpenChange={setCollectOpen}
        onCollected={() => {
          setCollectOpen(false)
          reload()
        }}
        onSubmit={handleCollect}
      />

      <WaiveInstallmentDialog
        open={waiveOpen}
        installment={selected}
        onOpenChange={setWaiveOpen}
        onWaived={() => {
          setWaiveOpen(false)
          reload()
        }}
        onSubmit={handleWaive}
      />

      <RescheduleInstallmentDialog
        open={rescheduleOpen}
        installment={selected}
        onOpenChange={setRescheduleOpen}
        onRescheduled={() => {
          setRescheduleOpen(false)
          reload()
        }}
        onSubmit={handleReschedule}
      />

      <EditInstallmentDialog
        open={editOpen}
        installment={selected}
        onOpenChange={setEditOpen}
        onUpdated={(summary) => {
          setEditOpen(false)
          if (summary) {
            setRows((current) =>
              current.map((row) =>
                row.id === summary.installmentId
                  ? {
                      ...row,
                      amount: summary.amount,
                      due_date: summary.dueDate,
                      remaining_amount: Math.max(summary.amount - row.paid_amount, 0),
                    }
                  : row,
              ),
            )
          }
          reload()
        }}
      />

      <ConfirmActionDialog
        open={deleteOpen}
        requireReason={false}
        title="حذف قسري للأقساط المحددة"
        description={`سيتم حذف ${checkedIds.size} قسطًا نهائيًا (حتى لو فيه تحصيل أو تسوية)، وإنقاص إجمالي العقد والفاتورة بقيمة هذه الأقساط، وإعادة توزيع المتبقي على باقي الأقساط غير المدفوعة وتحديث رقمها بالتسلسل. التحصيل المسدد على أقساط أخرى لن يتأثر. العملية لا يمكن التراجع عنها.`}
        confirmLabel={`حذف ${checkedIds.size > 0 ? checkedIds.size : ''} قسطًا`}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDeleteConfirm}
      />

      <EditContractDialog
        open={editContractOpen}
        contractId={selected?.contract_id ?? null}
        onOpenChange={setEditContractOpen}
        onUpdated={() => {
          setEditContractOpen(false)
          reload()
        }}
      />

      <ConfirmActionDialog
        open={cancelOpen}
        title="إلغاء العقد"
        description={`العقد «${selected?.contract_number ?? ''}» — الإلغاء متاح فقط قبل أي تحصيل. المركبة هترجع متاحة، والمقدم هيتخصم من الخزنة، والفاتورة والجدول هيتلغوا.`}
        confirmLabel="إلغاء العقد"
        onOpenChange={setCancelOpen}
        onConfirm={async (reason) => {
          if (!selected) return
          try {
            await cancelActiveContract(selected.contract_id, reason)
            toast.success('تم إلغاء العقد.')
            reload()
          } catch (cancelError) {
            throw new Error(translateInstallmentError(cancelError), { cause: cancelError })
          }
        }}
      />
    </div>
  )
}
