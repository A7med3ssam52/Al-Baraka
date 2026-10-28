import { Archive, MoreHorizontal, RefreshCw, Search, UserPlus, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [formDialog, setFormDialog] = useState<{
    open: boolean
    customer: CustomerRecord | null
  }>({ open: false, customer: null })
  const [statusDialog, setStatusDialog] = useState<{
    open: boolean
    customer: CustomerRecord | null
  }>({ open: false, customer: null })
  const lastSearchSubmit = useRef(searchInput)

  const canCreate = hasPermission('customers.create')
  const canUpdate = hasPermission('customers.update')
  const canArchive = hasPermission('customers.archive')

  const load = async () => {
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  useEffect(() => {
    let active = true
    fetchCustomers({
      status: statusFilter,
      search: lastSearchSubmit.current,
    })
      .then((rows) => {
        if (!active) return
        setCustomers(rows)
        setError(null)
      })
      .catch((fetchError) => {
        if (!active) return
        setError(translateCustomerError(fetchError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [statusFilter, reloadKey])

  function handleSearchSubmit() {
    lastSearchSubmit.current = searchInput
    void load()
  }

  async function handleStatusConfirm(customer: CustomerRecord, status: CustomerStatus) {
    try {
      await setCustomerStatus(customer.id, status)
      await load()
    } catch (statusError) {
      throw new Error(translateCustomerError(statusError), { cause: statusError })
    }
  }

  async function handleFormSubmit(input: {
    full_name: string
    national_id: string
    mobile: string
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
              placeholder="بحث بالاسم أو الكود أو الرقم القومي أو الموبايل"
              className="pr-9"
            />
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
            title="لا يوجد عملاء"
            description="ابدأ بإضافة أول عميل وسجل بياناته."
          />
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
                      {customer.full_name}
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
        onOpenChange={(open) => setFormDialog({ open, customer: formDialog.customer })}
        onClosed={() => setFormDialog({ open: false, customer: null })}
        onSubmit={handleFormSubmit}
      />

      <CustomerStatusDialog
        open={statusDialog.open}
        customer={statusDialog.customer}
        onOpenChange={(open) => setStatusDialog({ open, customer: statusDialog.customer })}
        onConfirm={handleStatusConfirm}
      />
    </>
  )
}
