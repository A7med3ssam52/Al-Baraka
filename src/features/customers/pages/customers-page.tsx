import {
  Archive,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
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
import { useAuth } from '@/features/auth/use-auth'
import { cn, formatDateTime } from '@/lib/utils'

import {
  createCustomer,
  fetchCustomers,
  forceDeleteCustomer,
  setCustomerStatus,
  translateCustomerError,
  updateCustomer,
} from '../api'
import {
  customerStatusLabels,
  formatMobileDisplay,
  formatNationalId,
  type CustomerRecord,
  type CustomerStatus,
} from '../types'
import { CustomerFormDialog } from '../components/customer-form-dialog'
import { CustomerStatusDialog } from '../components/customer-status-dialog'
import { splitHighlight } from '../smart-search'

function Highlight({ text, search }: { text: string; search: string }) {
  return (
    <>
      {splitHighlight(text, search).map((part, index) =>
        part.hit ? (
          <mark key={index} className="rounded bg-amber-200/70 px-0.5 text-inherit">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  )
}

type StatusFilter = CustomerStatus | 'all'

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'كل الحالات' },
  { value: 'active', label: 'نشط' },
  { value: 'inactive', label: 'غير نشط' },
  { value: 'archived', label: 'مؤرشف' },
]

const statusBadgeVariant: Record<CustomerStatus, 'success' | 'warning' | 'secondary'> = {
  active: 'success',
  inactive: 'warning',
  archived: 'secondary',
}

function statusDotClass(status: CustomerStatus) {
  if (status === 'active') return 'bg-success'
  if (status === 'inactive') return 'bg-warning'
  return 'bg-muted-foreground/50'
}

export function CustomersPage() {
  const { hasPermission } = useAuth()
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchInput, setSearchInput] = useState('')
  const [searching, setSearchSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const requestIdRef = useRef(0)
  const [formDialog, setFormDialog] = useState<{
    open: boolean
    customer: CustomerRecord | null
  }>({ open: false, customer: null })
  const [statusDialog, setStatusDialog] = useState<{
    open: boolean
    customer: CustomerRecord | null
  }>({ open: false, customer: null })
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    customer: CustomerRecord | null
  }>({ open: false, customer: null })

  const canCreate = hasPermission('customers.create')
  const canUpdate = hasPermission('customers.update')
  const canArchive = hasPermission('customers.archive')
  const canForceDelete = hasPermission('customers.force_delete')

  const load = async () => {
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  // بحث ذكي حي — يشتغل على طول بعد توقف الكتابة ٢٥٠ مللي ثانية.
  // لو البحث فشل لأي سبب، النتائج السابقة تفضل معروضة (الفلتر المحلي
  // داخل fetchCustomers بيغطي ده) — مفيش كارت أحمر أبدًا أثناء البحث.
  useEffect(() => {
    const requestId = (requestIdRef.current += 1)
    setSearchSearching(true)
    const timer = window.setTimeout(() => {
      fetchCustomers({ status: statusFilter, search: searchInput })
        .then((rows) => {
          if (requestIdRef.current !== requestId) return
          setCustomers(rows)
          setError(null)
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return
          // keep previous results; only the silent fallback above can fail
          // the plain list fetch, which the initial load already surfaced.
        })
        .finally(() => {
          if (requestIdRef.current === requestId) {
            setLoading(false)
            setSearchSearching(false)
          }
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
    }
  }, [searchInput, statusFilter, reloadKey])

  function handleSearchSubmit() {
    // Enter forces an immediate search without waiting for the debounce.
    requestIdRef.current += 1
    const requestId = requestIdRef.current
    setSearchSearching(true)
    fetchCustomers({ status: statusFilter, search: searchInput })
      .then((rows) => {
        if (requestIdRef.current !== requestId) return
        setCustomers(rows)
        setError(null)
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return
        // silent — results stay as they are
      })
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setLoading(false)
          setSearchSearching(false)
        }
      })
  }

  async function handleStatusConfirm(customer: CustomerRecord, status: CustomerStatus) {
    try {
      await setCustomerStatus(customer.id, status)
      await load()
    } catch (statusError) {
      throw new Error(translateCustomerError(statusError), { cause: statusError })
    }
  }

  async function handleDeleteConfirm(_reason: string, confirmCode: string) {
    if (!deleteDialog.customer) return
    try {
      await forceDeleteCustomer(deleteDialog.customer.id, confirmCode)
      toast.success('تم حذف العميل نهائيًا — محى كل بياناته وتاريخه.')
      await load()
    } catch (deleteError) {
      throw new Error(translateCustomerError(deleteError), { cause: deleteError })
    }
  }

  async function handleFormSubmit(input: {
    full_name: string
    national_id: string
    mobile: string
    code: string | null
    phone2: string
    job: string
    address: string
    notes: string
  }) {
    if (formDialog.customer) {
      await updateCustomer(formDialog.customer.id, input)
    } else {
      await createCustomer(input)
    }
    await load()
  }

  return (
    <>
      <PageHeader
        title="العملاء"
        description="ملف العميل الموحد: بيانات، بضاعة سابقه وحاله."
        actions={
          canCreate ? (
            <Button onClick={() => setFormDialog({ open: true, customer: null })}>
              <UserPlus className="size-4" /> عميل جديد
            </Button>
          ) : null
        }
      />

      <Card className="gap-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form
            className="relative flex-1 min-w-0"
            onSubmit={(event) => {
              event.preventDefault()
              handleSearchSubmit()
            }}
          >
            <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => event.key === 'Escape' && setSearchInput('')}
              placeholder="بحث ذكي: اسم / كود / رقم قومي / موبايل — جرّب كلمة واحدة أو أكثر"
              className="pr-9 pl-9"
              aria-label="بحث ذكي في العملاء"
            />
            {searching ? (
              <Loader2 className="absolute top-1/2 left-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : searchInput ? (
              <button
                type="button"
                aria-label="مسح البحث"
                className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchInput('')}
              >
                <X className="size-4" />
              </button>
            ) : null}
            {searchInput.trim() ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {customers.length} نتيجة مطابقة لـ «{searchInput.trim()}»
              </p>
            ) : null}
          </form>
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="w-full sm:w-44"
          >
            {statusFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="تحديث">
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </Card>

      {error ? (
        <Card className="p-4 text-sm text-destructive">{error}</Card>
      ) : loading ? (
        <Card className="p-4">
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : customers.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Users}
            title={searchInput.trim() ? 'لا توجد نتائج مطابقة' : 'لا يوجد عملاء'}
            description={
              searchInput.trim()
                ? `مفيش حد مطابق لـ «${searchInput.trim()}» — جرّب كلمة واحدة، أو رقم قومي/موبايل من غير مسافات.`
                : 'ابدأ بإضافة أول عميل وسجل بياناته.'
            }
          />
          {searchInput.trim() ? (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setSearchInput('')}>
                مسح البحث
              </Button>
            </div>
          ) : null}
        </Card>
      ) : (
        <Card className="m-0 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الكود</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead className="hidden md:table-cell">الرقم القومي</TableHead>
                <TableHead>الموبايل</TableHead>
                <TableHead className="hidden md:table-cell">الحالة</TableHead>
                <TableHead className="hidden lg:table-cell">أُضيف في</TableHead>
                <TableHead aria-label="إجراءات" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-mono text-xs">{customer.code}</TableCell>
                  <TableCell>
                    <a href={`/customers/${customer.id}`} className="font-semibold hover:underline">
                      <Highlight text={customer.full_name} search={searchInput} />
                    </a>
                    {customer.job ? (
                      <p className="text-xs text-muted-foreground">{customer.job}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">
                    {formatNationalId(customer.national_id)}
                  </TableCell>
                  <TableCell className="dir-ltr font-mono text-xs">
                    {formatMobileDisplay(customer.mobile)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant={statusBadgeVariant[customer.status]}>
                      <span
                        className={cn('size-1.5 rounded-full', statusDotClass(customer.status))}
                      />
                      {customerStatusLabels[customer.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                    {formatDateTime(customer.created_at)}
                  </TableCell>
                  <TableCell className="text-left">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`إجراءات ${customer.full_name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem asChild>
                          <a href={`/customers/${customer.id}`}>عرض الملف</a>
                        </DropdownMenuItem>
                        {canUpdate && customer.status !== 'archived' ? (
                          <DropdownMenuItem onClick={() => setFormDialog({ open: true, customer })}>
                            تعديل البيانات
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        {canUpdate && customer.status !== 'archived' ? (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusDialog({
                                open: true,
                                customer,
                              })
                            }
                          >
                            {customer.status === 'active' ? 'تعطيل' : 'تفعيل'}
                          </DropdownMenuItem>
                        ) : null}
                        {canArchive ? (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusDialog({
                                open: true,
                                customer,
                              })
                            }
                          >
                            <Archive className="size-4" /> أرشفة العميل
                          </DropdownMenuItem>
                        ) : null}
                        {canForceDelete ? (
                          <DropdownMenuItem
                            onClick={() => setDeleteDialog({ open: true, customer })}
                          >
                            <Trash2 className="size-4 text-destructive" /> حذف قسري نهائي
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <CustomerFormDialog
        open={formDialog.open}
        customer={formDialog.customer}
        onOpenChange={(open) => setFormDialog((current) => ({ ...current, open }))}
        onClosed={() => setFormDialog({ open: false, customer: null })}
        onSubmit={handleFormSubmit}
      />

      <CustomerStatusDialog
        open={statusDialog.open}
        customer={statusDialog.customer}
        onOpenChange={(open) => setStatusDialog((current) => ({ ...current, open }))}
        onConfirm={handleStatusConfirm}
      />

      <ConfirmActionDialog
        open={deleteDialog.open}
        title="حذف قسري نهائي للعميل"
        description={`العميل «${deleteDialog.customer?.full_name ?? ''}» (${deleteDialog.customer?.code ?? ''}) — سيُمحى نهائيًا مع كل تاريخه: العقود، الفواتير، الأقساط، المدفوعات، كشف الحساب، الرصيد، المستندات، ملاحظات ومتابعة بوابة العملاء، وكل المرتبط به. العملية لا يمكن التراجع عنها — ولا تُحذف ملفات Cloudinary. اكتب كود العميل «${deleteDialog.customer?.code ?? ''}» ليتفعل زر التأكيد.`}
        confirmLabel="حذف قسري نهائي"
        requireReason={false}
        requireText={deleteDialog.customer?.code ?? ''}
        onOpenChange={(open) => setDeleteDialog((current) => ({ ...current, open }))}
        onConfirm={handleDeleteConfirm}
      />
    </>
  )
}
