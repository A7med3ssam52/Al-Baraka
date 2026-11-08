import { MoreHorizontal, RefreshCw, Search, Trash2, Truck, UserPlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { DocumentsPanel } from '@/features/documents/components/documents-panel'
import { formatDateTime } from '@/lib/utils'

import {
  createSupplier,
  deleteSupplier,
  fetchSuppliers,
  setSupplierStatus,
  translateSupplierError,
  updateSupplier,
} from '../api'
import { supplierStatusLabels, type SupplierRecord, type SupplierStatus } from '../types'
import { SupplierFormDialog } from '../components/supplier-form-dialog'

type StatusFilter = SupplierStatus | 'all'

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'النشطة' },
  { value: 'inactive', label: 'المتوقفة' },
  { value: 'archived', label: 'المؤرشفة' },
  { value: 'all', label: 'كل الحالات' },
]

const statusBadgeVariant: Record<SupplierStatus, 'success' | 'warning' | 'secondary'> = {
  active: 'success',
  inactive: 'warning',
  archived: 'secondary',
}

export function SuppliersPage() {
  const { hasPermission } = useAuth()
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [formDialog, setFormDialog] = useState<{
    open: boolean
    supplier: SupplierRecord | null
  }>({ open: false, supplier: null })
  const [documentsSupplier, setDocumentsSupplier] = useState<SupplierRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SupplierRecord | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const lastSearchSubmit = useRef('')

  const canCreate = hasPermission('suppliers.create')
  const canUpdate = hasPermission('suppliers.update')
  const canArchive = hasPermission('suppliers.archive')

  const supplier = formDialog.supplier

  async function load() {
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  useEffect(() => {
    let active = true
    fetchSuppliers({
      status: statusFilter,
      search: lastSearchSubmit.current,
    })
      .then((rows) => {
        if (!active) return
        setSuppliers(rows)
        setError(null)
      })
      .catch((fetchError) => {
        if (!active) return
        setError(translateSupplierError(fetchError))
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

  async function handleStatusConfirm(row: SupplierRecord, status: SupplierStatus) {
    try {
      await setSupplierStatus(row.id, status)
      toast.success('تم تحديث حالة المورد.')
      await load()
    } catch (statusError) {
      toast.error(translateSupplierError(statusError))
    }
  }

  async function handleFormSubmit(input: {
    full_name: string
    phone: string
    contact_name: string
    tax_number: string
    address: string
    notes: string
  }) {
    if (supplier) {
      await updateSupplier(supplier.id, input)
    } else {
      await createSupplier(input)
    }
    await load()
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    try {
      await deleteSupplier(deleteTarget.id)
      toast.success('تم حذف المورد.')
      await load()
    } catch (deleteError) {
      throw new Error(translateSupplierError(deleteError), { cause: deleteError })
    }
  }

  return (
    <>
      <PageHeader
        title="الموردون"
        description="سجل الموردين وبيانات التواصل والحالة."
        actions={
          canCreate ? (
            <Button onClick={() => setFormDialog({ open: true, supplier: null })}>
              <UserPlus className="size-4" /> مورد جديد
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
              placeholder="بحث بالاسم أو الكود أو الموبايل"
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
      ) : suppliers.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Truck}
            title="لا يوجد موردون"
            description="ابدأ بإضافة أول مورد وسجل بياناته."
          />
        </Card>
      ) : (
        <Card className="m-0 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الكود</TableHead>
                <TableHead>المورد</TableHead>
                <TableHead className="hidden md:table-cell">جهة الاتصال</TableHead>
                <TableHead>الموبايل</TableHead>
                <TableHead className="hidden md:table-cell">الحالة</TableHead>
                <TableHead className="hidden lg:table-cell">أُضيف في</TableHead>
                <TableHead aria-label="إجراءات" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell>
                    <Link to={`/suppliers/${row.id}`} className="font-semibold hover:underline">
                      {row.full_name}
                    </Link>
                    {row.tax_number ? (
                      <p className="dir-ltr text-xs text-muted-foreground">{row.tax_number}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {row.contact_name || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="dir-ltr font-mono text-xs">{row.phone}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant={statusBadgeVariant[row.status]}>
                      {supplierStatusLabels[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                    {formatDateTime(row.created_at)}
                  </TableCell>
                  <TableCell className="text-left">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`إجراءات ${row.full_name}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem asChild>
                          <Link to={`/suppliers/${row.id}`}>ملف المورد</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDocumentsSupplier(row)}>
                          المستندات
                        </DropdownMenuItem>
                        {canUpdate && row.status !== 'archived' ? (
                          <DropdownMenuItem
                            onClick={() => setFormDialog({ open: true, supplier: row })}
                          >
                            تعديل البيانات
                          </DropdownMenuItem>
                        ) : null}
                        {canUpdate && row.status !== 'archived' ? (
                          <DropdownMenuItem onClick={() => handleStatusConfirm(row, 'inactive')}>
                            إيقاف المورد
                          </DropdownMenuItem>
                        ) : null}
                        {canUpdate && row.status === 'inactive' ? (
                          <DropdownMenuItem onClick={() => handleStatusConfirm(row, 'active')}>
                            تفعيل المورد
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        {canArchive && row.status !== 'archived' ? (
                          <DropdownMenuItem onClick={() => handleStatusConfirm(row, 'archived')}>
                            أرشفة
                          </DropdownMenuItem>
                        ) : null}
                        {canArchive ? (
                          <DropdownMenuItem
                            onClick={() => {
                              setDeleteTarget(row)
                              setDeleteOpen(true)
                            }}
                          >
                            <Trash2 className="size-4 text-destructive" /> حذف نهائي
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

      <SupplierFormDialog
        open={formDialog.open}
        supplier={supplier}
        onOpenChange={(open) => setFormDialog((current) => ({ ...current, open }))}
        onClosed={() => setFormDialog({ open: false, supplier: null })}
        onSubmit={handleFormSubmit}
      />

      <Dialog
        open={documentsSupplier !== null}
        onOpenChange={(open) => !open && setDocumentsSupplier(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              مستندات {documentsSupplier?.code} — {documentsSupplier?.full_name}
            </DialogTitle>
            <DialogDescription>
              سجل تجاري ومستندات أخرى للمورد، بروابط عرض موقَّعة محمية.
            </DialogDescription>
          </DialogHeader>
          {documentsSupplier ? (
            <div className="max-h-[70vh] overflow-y-auto">
              <DocumentsPanel
                ownerType="supplier"
                ownerId={documentsSupplier.id}
                ownerLabel={documentsSupplier.code}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={deleteOpen}
        title="حذف نهائي للمورد"
        description={`المورد «${deleteTarget?.full_name ?? ''}» — الحذف النهائي متاح فقط لو مفيش مشتريات أو مستندات مرتبطة.`}
        confirmLabel="حذف نهائي"
        onOpenChange={setDeleteOpen}
        onConfirm={handleDeleteConfirm}
      />
    </>
  )
}
