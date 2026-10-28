import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FilterX,
  History,
  LoaderCircle,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { formatDateTime } from '@/lib/utils'

import { fetchAuditFilterOptions, fetchAuditLogs, fetchAuditLogsForExport } from '../api'
import { AuditDetailsDialog } from '../components/audit-details-dialog'
import {
  auditActionLabels,
  auditTableLabels,
  emptyAuditFilters,
  type AuditFilterOptions,
  type AuditFilters,
  type AuditLogEntry,
} from '../types'

const pageSize = 20
const emptyOptions: AuditFilterOptions = { users: [], actions: [], tables: [], branches: [] }

function actionVariant(action: string) {
  if (action === 'insert') return 'success' as const
  if (action === 'update') return 'warning' as const
  if (action === 'delete') return 'destructive' as const
  return 'outline' as const
}

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? '' : String(value)

  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }

  return text
}

function downloadCsv(rows: AuditLogEntry[]) {
  const header = [
    'التاريخ',
    'المستخدم',
    'الفرع',
    'العملية',
    'الجدول',
    'معرّف السجل',
    'البيانات قبل',
    'البيانات بعد',
  ]

  const lines = rows.map((row) =>
    [
      row.created_at,
      row.user_name,
      row.branch_name ?? '',
      auditActionLabels[row.action] ?? row.action,
      auditTableLabels[row.table_name] ?? row.table_name,
      row.record_id ?? '',
      row.old_data ? JSON.stringify(row.old_data) : '',
      row.new_data ? JSON.stringify(row.new_data) : '',
    ]
      .map(csvCell)
      .join(','),
  )

  const csv = [header.map(csvCell).join(','), ...lines].join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function hasActiveFilters(filters: AuditFilters) {
  return Object.values(filters).some((value) => value.trim() !== '')
}

export function AuditLogsPage() {
  const { appUser, hasPermission } = useAuth()
  const canExport = hasPermission('audit_logs.export')

  const [filters, setFilters] = useState<AuditFilters>(emptyAuditFilters)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [options, setOptions] = useState<AuditFilterOptions>(emptyOptions)
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const requestRef = useRef(0)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(filters.search.trim())
      setPage(0)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [filters.search])

  useEffect(() => {
    let active = true

    fetchAuditFilterOptions()
      .then((nextOptions) => {
        if (!active) return
        setOptions(nextOptions)
      })
      .catch(() => {
        if (!active) return
        setOptions(emptyOptions)
      })
      .finally(() => {
        if (active) setOptionsLoading(false)
      })

    return () => {
      active = false
    }
  }, [reloadKey])

  const { action, table, userId, branchId, from, to } = filters
  const queryFilters = useMemo<AuditFilters>(
    () => ({ search: debouncedSearch, action, table, userId, branchId, from, to }),
    [action, branchId, debouncedSearch, from, table, to, userId],
  )

  useEffect(() => {
    let active = true
    const requestId = requestRef.current + 1
    requestRef.current = requestId

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const nextLogs = await fetchAuditLogs(queryFilters, page, pageSize)
        if (!active || requestId !== requestRef.current) return
        setLogs(nextLogs)
        setTotalCount(nextLogs[0]?.total_count ?? 0)
      } catch (loadError) {
        if (!active || requestId !== requestRef.current) return
        setLogs([])
        setTotalCount(0)
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'تعذر تحميل سجل المراجعة. حاول مرة أخرى.',
        )
      } finally {
        if (active && requestId === requestRef.current) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [page, queryFilters, reloadKey])

  const branchOptions = useMemo(() => {
    const merged = new Map<string, string>()

    for (const branch of appUser?.branches ?? []) {
      merged.set(branch.id, branch.name)
    }
    for (const branch of options.branches) {
      merged.set(branch.id, branch.name)
    }

    return [...merged.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((first, second) => first.name.localeCompare(second.name, 'ar'))
  }, [appUser?.branches, options.branches])

  const actionOptions = useMemo(() => {
    const merged = new Set(['insert', 'update', 'delete', ...options.actions])
    return [...merged].sort()
  }, [options.actions])

  const tableOptions = useMemo(() => {
    const merged = new Set([...Object.keys(auditTableLabels), ...options.tables])
    return [...merged].sort((first, second) =>
      (auditTableLabels[first] ?? first).localeCompare(auditTableLabels[second] ?? second, 'ar'),
    )
  }, [options.tables])

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize))
  const rangeStart = totalCount === 0 ? 0 : page * pageSize + 1
  const rangeEnd = Math.min(totalCount, (page + 1) * pageSize)
  const filtersActive = hasActiveFilters(filters)

  const setFilter = <Key extends keyof AuditFilters>(key: Key, value: AuditFilters[Key]) => {
    setFilters((current) => ({ ...current, [key]: value }))
    if (key !== 'search') setPage(0)
  }

  const resetFilters = () => {
    setFilters(emptyAuditFilters)
    setDebouncedSearch('')
    setPage(0)
  }

  const handleExport = async () => {
    setExporting(true)

    try {
      const rows = await fetchAuditLogsForExport(queryFilters)
      if (rows.length === 0) {
        toast.info('لا توجد عمليات مطابقة للتصدير.')
        return
      }

      downloadCsv(rows)
      toast.success(`تم تصدير ${rows.length} عملية إلى ملف CSV.`)
    } catch (exportError) {
      toast.error(
        exportError instanceof Error
          ? exportError.message
          : 'تعذر تصدير سجل المراجعة. حاول مرة أخرى.',
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="إدارة النظام"
        title="سجل المراجعة"
        description="كل تغيير على الإعدادات والفروع والمستخدمين والأدوار والحسابات يُسجَّل تلقائيًا. السجل للقراءة فقط."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReloadKey((key) => key + 1)}
              disabled={loading}
            >
              <RefreshCw className={loading ? 'animate-spin' : undefined} />
              تحديث
            </Button>
            {canExport ? (
              <Button type="button" onClick={() => void handleExport()} disabled={exporting}>
                {exporting ? <LoaderCircle className="animate-spin" /> : <Download />}
                {exporting ? 'جارٍ التصدير...' : 'تصدير CSV'}
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-bold">تصفية السجل</h2>
          <p className="text-[11px] leading-5 text-muted-foreground">
            ابحث في أسماء المستخدمين والجداول وبيانات التغيير، أو حدّد نوع العملية والفترة.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="audit-search" className="text-xs font-bold">
              بحث
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="audit-search"
                value={filters.search}
                onChange={(event) => setFilter('search', event.target.value)}
                placeholder="اسم المستخدم، نوع العملية، أو محتوى التغيير..."
                className="ps-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="audit-action" className="text-xs font-bold">
              نوع العملية
            </label>
            <Select
              id="audit-action"
              value={filters.action}
              onChange={(event) => setFilter('action', event.target.value)}
              disabled={optionsLoading}
            >
              <option value="">كل العمليات</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {auditActionLabels[action] ?? action}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="audit-table" className="text-xs font-bold">
              الجدول
            </label>
            <Select
              id="audit-table"
              value={filters.table}
              onChange={(event) => setFilter('table', event.target.value)}
              disabled={optionsLoading}
            >
              <option value="">كل الجداول</option>
              {tableOptions.map((table) => (
                <option key={table} value={table}>
                  {auditTableLabels[table] ?? table}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="audit-user" className="text-xs font-bold">
              المستخدم
            </label>
            <Select
              id="audit-user"
              value={filters.userId}
              onChange={(event) => setFilter('userId', event.target.value)}
              disabled={optionsLoading}
            >
              <option value="">كل المستخدمين</option>
              {options.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="audit-branch" className="text-xs font-bold">
              الفرع
            </label>
            <Select
              id="audit-branch"
              value={filters.branchId}
              onChange={(event) => setFilter('branchId', event.target.value)}
              disabled={optionsLoading}
            >
              <option value="">كل الفروع</option>
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="audit-from" className="text-xs font-bold">
              من تاريخ
            </label>
            <Input
              id="audit-from"
              type="date"
              value={filters.from}
              onChange={(event) => setFilter('from', event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="audit-to" className="text-xs font-bold">
              إلى تاريخ
            </label>
            <Input
              id="audit-to"
              type="date"
              value={filters.to}
              onChange={(event) => setFilter('to', event.target.value)}
            />
          </div>

          <div className="flex items-end sm:col-span-2 xl:col-span-4">
            <Button type="button" variant="ghost" onClick={resetFilters} disabled={!filtersActive}>
              <FilterX />
              مسح التصفية
            </Button>
          </div>
        </div>
      </Card>

      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
          <div className="flex items-center gap-2">
            <History className="size-4 text-accent-foreground" />
            <h2 className="text-sm font-bold">العمليات المسجلة</h2>
            {!loading && totalCount > 0 ? (
              <Badge variant="outline" className="font-mono">
                {totalCount}
              </Badge>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {error
              ? 'تعذر تحميل السجل'
              : loading
                ? 'جارٍ تحميل السجل...'
                : totalCount > 0
                  ? `عرض ${rangeStart}–${rangeEnd} من ${totalCount} عملية`
                  : 'لا توجد عمليات مطابقة'}
          </p>
        </div>

        {error ? (
          <div className="p-4">
            <EmptyState
              icon={AlertTriangle}
              title="تعذر تحميل سجل المراجعة"
              description={error}
              action={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReloadKey((key) => key + 1)}
                >
                  <RefreshCw />
                  إعادة المحاولة
                </Button>
              }
            />
          </div>
        ) : loading ? (
          <div className="space-y-3 p-4" role="status" aria-live="polite">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-44 max-w-full" />
                  <Skeleton className="h-3 w-64 max-w-full" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={History}
              title={filtersActive ? 'لا توجد عمليات مطابقة' : 'السجل فارغ حتى الآن'}
              description={
                filtersActive
                  ? 'جرّب تعديل كلمات البحث أو إزالة بعض عوامل التصفية.'
                  : 'ستظهر هنا أول عملية حساسة على الإعدادات أو الفروع أو المستخدمين.'
              }
              action={
                filtersActive ? (
                  <Button type="button" variant="outline" onClick={resetFilters}>
                    <FilterX />
                    مسح التصفية
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
                    <TableHead>التاريخ</TableHead>
                    <TableHead>المستخدم</TableHead>
                    <TableHead>العملية</TableHead>
                    <TableHead>الجدول</TableHead>
                    <TableHead>الفرع</TableHead>
                    <TableHead className="text-end">التفاصيل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(entry.created_at)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <p className="max-w-40 truncate text-xs font-bold">{entry.user_name}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionVariant(entry.action)}>
                          {auditActionLabels[entry.action] ?? entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold">
                            {auditTableLabels[entry.table_name] ?? entry.table_name}
                          </p>
                          <p className="mt-0.5 max-w-40 truncate font-mono text-[10px] text-muted-foreground">
                            {entry.record_id ?? '—'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {entry.branch_name ?? 'إعداد عام'}
                        </span>
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedEntry(entry)
                            setDetailsOpen(true)
                          }}
                        >
                          <Eye />
                          عرض
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="divide-y divide-border md:hidden">
              {logs.map((entry) => (
                <article key={entry.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{entry.user_name}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatDateTime(entry.created_at)}
                      </p>
                    </div>
                    <Badge variant={actionVariant(entry.action)}>
                      {auditActionLabels[entry.action] ?? entry.action}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">
                      {auditTableLabels[entry.table_name] ?? entry.table_name}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {entry.branch_name ?? 'إعداد عام'}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="max-w-48 truncate font-mono text-[10px] text-muted-foreground">
                      {entry.record_id ?? '—'}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedEntry(entry)
                        setDetailsOpen(true)
                      }}
                    >
                      <Eye />
                      التفاصيل
                    </Button>
                  </div>
                </article>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
              <p className="text-[11px] text-muted-foreground">
                صفحة {page + 1} من {pageCount}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(0)}
                  disabled={page === 0 || loading}
                >
                  الأولى
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={page === 0 || loading}
                >
                  <ChevronRight />
                  السابق
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                  disabled={page + 1 >= pageCount || loading}
                >
                  التالي
                  <ChevronLeft />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(pageCount - 1)}
                  disabled={page + 1 >= pageCount || loading}
                >
                  الأخيرة
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <AuditDetailsDialog
        entry={selectedEntry}
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open)
          if (!open) setSelectedEntry(null)
        }}
      />
    </div>
  )
}
