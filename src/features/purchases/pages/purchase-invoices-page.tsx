import { ArrowRight, FileText, Plus, RefreshCw, Search, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

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
import { fetchProducts } from '@/features/products/api'
import { fetchSuppliers } from '@/features/suppliers/api'
import { fetchVehicles } from '@/features/vehicles/api'

import {
  approvePurchaseInvoice,
  cancelPurchaseInvoice,
  fetchPurchaseInvoices,
  savePurchaseInvoice,
  translatePurchaseError,
} from '../api'
import { PurchaseInvoiceDialog } from '../components/purchase-invoice-dialog'
import {
  purchasePaymentLabels,
  purchaseStatusLabels,
  type PurchaseInvoiceInput,
  type PurchaseInvoiceRecord,
  type PurchaseStatus,
} from '../types'

const statusBadge: Record<PurchaseStatus, 'secondary' | 'success' | 'destructive'> = {
  draft: 'secondary',
  approved: 'success',
  cancelled: 'destructive',
}

export function PurchaseInvoicesPage() {
  const { hasPermission } = useAuth()
  const [invoices, setInvoices] = useState<PurchaseInvoiceRecord[]>([])
  const [suppliers, setSuppliers] = useState<{ id: string; full_name: string }[]>([])
  const [products, setProducts] = useState<{ id: string; name: string; code: string }[]>([])
  const [vehicles, setVehicles] = useState<{ id: string; code: string; chassis_no: string }[]>([])
  const [statusFilter, setStatusFilter] = useState<PurchaseStatus | 'all'>('all')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [dialog, setDialog] = useState<{ open: boolean; invoice: PurchaseInvoiceRecord | null }>({
    open: false,
    invoice: null,
  })
  const lastSearch = useRef('')

  const canCreate = hasPermission('purchases.create')
  const canUpdate = hasPermission('purchases.update')
  const canApprove = hasPermission('purchases.approve')
  const canCancel = hasPermission('purchases.cancel')

  useEffect(() => {
    let active = true
    Promise.all([
      fetchSuppliers({ status: 'active' }),
      fetchProducts({ status: 'all' }),
      fetchVehicles({ status: 'all' }),
    ])
      .then(([supplierRows, productRows, vehicleRows]) => {
        if (!active) return
        setSuppliers(supplierRows.map((row) => ({ id: row.id, full_name: row.full_name })))
        setProducts(productRows.map((row) => ({ id: row.id, name: row.name, code: row.code })))
        setVehicles(
          vehicleRows.map((row) => ({ id: row.id, code: row.code, chassis_no: row.chassis_no })),
        )
      })
      .catch((loadError) => {
        if (active) toast.error(translatePurchaseError(loadError))
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  useEffect(() => {
    let active = true
    fetchPurchaseInvoices({ status: statusFilter, search: lastSearch.current })
      .then((rows) => {
        if (!active) return
        setInvoices(rows)
        setError(null)
      })
      .catch((fetchError) => {
        if (!active) return
        setError(translatePurchaseError(fetchError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [statusFilter, reloadKey])

  function reload() {
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  async function handleSubmit(input: PurchaseInvoiceInput, invoiceId?: string) {
    await savePurchaseInvoice(input, invoiceId)
    reload()
  }

  async function handleApprove(row: PurchaseInvoiceRecord) {
    try {
      await approvePurchaseInvoice(row.id)
      toast.success(`تم اعتماد الفاتورة ${row.number} وتحديث المخزون والموردين.`)
      reload()
    } catch (approveError) {
      toast.error(translatePurchaseError(approveError))
    }
  }

  async function handleCancel(row: PurchaseInvoiceRecord) {
    try {
      await cancelPurchaseInvoice(row.id, 'إلغاء من قائمة المشتريات')
      toast.success('تم إلغاء المسودة.')
      reload()
    } catch (cancelError) {
      toast.error(translatePurchaseError(cancelError))
    }
  }

  return (
    <>
      <PageHeader
        title="فواتير الشراء"
        description="مسودات المشتريات من الموردين مع التكاليف المباشرة قبل الاعتماد."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/inventory">
                <ArrowRight className="size-4" /> المخزون
              </Link>
            </Button>
            {canCreate ? (
              <Button onClick={() => setDialog({ open: true, invoice: null })}>
                <Plus className="size-4" /> فاتورة جديدة
              </Button>
            ) : null}
          </div>
        }
      />

      <Card className="gap-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form
            className="relative min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault()
              lastSearch.current = searchInput
              reload()
            }}
          >
            <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="بحث بالرقم أو المورد أو مرجع المورد"
              className="pr-9"
            />
          </form>
          <Select
            value={statusFilter}
            onChange={(event) => {
              setLoading(true)
              setStatusFilter(event.target.value as PurchaseStatus | 'all')
            }}
            className="w-full sm:w-44"
          >
            <option value="all">كل الحالات</option>
            <option value="draft">المسودات</option>
            <option value="approved">المعتمدة</option>
            <option value="cancelled">الملغاة</option>
          </Select>
          <Button variant="ghost" size="icon" onClick={reload} aria-label="تحديث">
            <RefreshCw className="size-4" />
          </Button>
        </div>
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
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : invoices.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={FileText}
            title="لا فواتير شراء بعد"
            description="أنشئ أول مسودة شراء ثم اعتمدها لإدخال المخزون وتحديث المورد."
          />
        </Card>
      ) : (
        <Card className="m-0 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الرقم</TableHead>
                <TableHead>المورد</TableHead>
                <TableHead className="hidden md:table-cell">التاريخ</TableHead>
                <TableHead>الإجمالي</TableHead>
                <TableHead className="hidden lg:table-cell">المدفوع</TableHead>
                <TableHead className="hidden lg:table-cell">المتبقي</TableHead>
                <TableHead className="hidden xl:table-cell">السداد</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.number}</TableCell>
                  <TableCell>
                    <span className="font-semibold">{row.supplier_name}</span>
                    <p className="text-xs text-muted-foreground">{row.item_count} صنف</p>
                  </TableCell>
                  <TableCell className="hidden text-xs md:table-cell">{row.invoice_date}</TableCell>
                  <TableCell className="text-xs font-semibold">
                    {row.total.toLocaleString('ar-EG')}
                  </TableCell>
                  <TableCell className="hidden text-xs lg:table-cell">
                    {row.paid_amount.toLocaleString('ar-EG')}
                  </TableCell>
                  <TableCell className="hidden text-xs lg:table-cell">
                    {row.remaining_amount.toLocaleString('ar-EG')}
                  </TableCell>
                  <TableCell className="hidden text-xs xl:table-cell">
                    {purchasePaymentLabels[row.payment_method]}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadge[row.status]}>
                      {purchaseStatusLabels[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-left">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`إجراءات ${row.number}`}>
                          <RefreshCw className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {canUpdate && row.status === 'draft' ? (
                          <DropdownMenuItem onClick={() => setDialog({ open: true, invoice: row })}>
                            تعديل المسودة
                          </DropdownMenuItem>
                        ) : null}
                        {canApprove && row.status === 'draft' ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleApprove(row)}>
                              اعتماد الفاتورة
                            </DropdownMenuItem>
                          </>
                        ) : null}
                        {canCancel && row.status === 'draft' ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleCancel(row)}>
                              إلغاء المسودة
                            </DropdownMenuItem>
                          </>
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

      <PurchaseInvoiceDialog
        open={dialog.open}
        invoice={dialog.invoice}
        suppliers={suppliers}
        products={products}
        vehicles={vehicles}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        onClosed={() => setDialog({ open: false, invoice: null })}
        onSubmit={handleSubmit}
      />
    </>
  )
}
