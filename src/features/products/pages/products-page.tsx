import {
  ArrowRightLeft,
  Bike,
  ClipboardCheck,
  FileText,
  History,
  Plus,
  RefreshCw,
  Search,
  TriangleAlert,
} from 'lucide-react'
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

import {
  createProduct,
  fetchProductBrands,
  fetchProductCategories,
  fetchProductModels,
  fetchProductUnits,
  fetchProducts,
  setProductStatus,
  translateProductError,
  updateProduct,
} from '../api'
import {
  productStatusLabels,
  valuationMethodLabels,
  type ProductBrandRecord,
  type ProductCategoryRecord,
  type ProductInput,
  type ProductRecord,
  type ProductStatus,
  type ProductUnitRecord,
} from '../types'
import { ProductFormDialog } from '../components/product-form-dialog'
import { ReferenceManageDialog } from '../components/reference-manage-dialog'

type StatusFilter = ProductStatus | 'all'

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'النشطة' },
  { value: 'inactive', label: 'المتوقفة' },
  { value: 'archived', label: 'المؤرشفة' },
  { value: 'all', label: 'كل الحالات' },
]

const statusBadgeVariant: Record<ProductStatus, 'success' | 'warning' | 'secondary'> = {
  active: 'success',
  inactive: 'warning',
  archived: 'secondary',
}

export function ProductsPage() {
  const { hasPermission } = useAuth()
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [categories, setCategories] = useState<ProductCategoryRecord[]>([])
  const [brands, setBrands] = useState<ProductBrandRecord[]>([])
  const [models, setModels] = useState<{ id: string; brand_id: string; name: string }[]>([])
  const [units, setUnits] = useState<ProductUnitRecord[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [formDialog, setFormDialog] = useState<{
    open: boolean
    product: ProductRecord | null
  }>({ open: false, product: null })
  const [referenceOpen, setReferenceOpen] = useState(false)
  const lastSearchSubmit = useRef('')

  const canCreate = hasPermission('products.create')
  const canUpdate = hasPermission('products.update')
  const canArchive = hasPermission('products.archive')

  const product = formDialog.product

  useEffect(() => {
    let active = true
    Promise.all([fetchProductCategories(), fetchProductBrands(), fetchProductUnits()])
      .then(([categoryRows, brandRows, unitRows]) => {
        if (!active) return
        setCategories(categoryRows)
        setBrands(brandRows)
        setUnits(unitRows)
        return null
      })
      .catch((loadError) => {
        if (active) toast.error(translateProductError(loadError))
      })
    fetchProductModels().then((rows) => {
      if (active) setModels(rows)
    })
    return () => {
      active = false
    }
  }, [reloadKey])

  useEffect(() => {
    let active = true
    fetchProducts({
      status: statusFilter,
      search: lastSearchSubmit.current,
    })
      .then((rows) => {
        if (!active) return
        setProducts(rows)
        setError(null)
      })
      .catch((fetchError) => {
        if (!active) return
        setError(translateProductError(fetchError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [statusFilter, reloadKey])

  function reload() {
    setReloadKey((key) => key + 1)
  }

  async function handleStatusConfirm(row: ProductRecord, status: ProductStatus) {
    try {
      await setProductStatus(row.id, status)
      toast.success('تم تحديث حالة المنتج.')
      reload()
    } catch (statusError) {
      toast.error(translateProductError(statusError))
    }
  }

  async function handleFormSubmit(input: ProductInput) {
    if (product) {
      await updateProduct(product.id, input)
    } else {
      await createProduct(input)
    }
    reload()
  }

  return (
    <>
      <PageHeader
        title="المخزون"
        description="المنتجات الكمية والتصنيفات والماركات."
        actions={
          <div className="flex gap-2">
            {hasPermission('vehicles.view') ? (
              <Button variant="outline" asChild>
                <Link to="/inventory/vehicles">
                  <Bike className="size-4" /> المركبات
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <Link to="/inventory/movements">
                <History className="size-4" /> الحركات
              </Link>
            </Button>
            {hasPermission('purchases.view') ? (
              <Button variant="outline" asChild>
                <Link to="/inventory/purchases">
                  <FileText className="size-4" /> المشتريات
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <Link to="/inventory/transfers">
                <ArrowRightLeft className="size-4" /> التحويلات
              </Link>
            </Button>
            {hasPermission('inventory_counts.view') ? (
              <Button variant="outline" asChild>
                <Link to="/inventory/counts">
                  <ClipboardCheck className="size-4" /> الجرد
                </Link>
              </Button>
            ) : null}
            {canCreate || canUpdate ? (
              <Button variant="outline" onClick={() => setReferenceOpen(true)}>
                <Plus className="size-4" /> تصنيف/ماركة
              </Button>
            ) : null}
            {canCreate ? (
              <Button onClick={() => setFormDialog({ open: true, product: null })}>
                <Plus className="size-4" /> منتج جديد
              </Button>
            ) : null}
          </div>
        }
      />

      <Card className="gap-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form
            className="relative flex-1 min-w-0"
            onSubmit={(event) => {
              event.preventDefault()
              lastSearchSubmit.current = searchInput
              reload()
            }}
          >
            <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="بحث بالاسم أو الكود أو الباركود"
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
      ) : products.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Plus}
            title="لا منتجات بعد"
            description="ابدأ بإضافة أول منتج كمي وبالتسلسل."
          />
        </Card>
      ) : (
        <Card className="m-0 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الكود</TableHead>
                <TableHead>المنتج</TableHead>
                <TableHead className="hidden md:table-cell">التصنيف</TableHead>
                <TableHead className="hidden md:table-cell">الباركود</TableHead>
                <TableHead>الرصيد</TableHead>
                <TableHead className="hidden lg:table-cell">التكلفة</TableHead>
                <TableHead className="hidden lg:table-cell">الحالة</TableHead>
                <TableHead className="hidden xl:table-cell">إعادة الطلب</TableHead>
                <TableHead className="hidden xl:table-cell">التقييم</TableHead>
                <TableHead className="text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell>
                    <span className="font-semibold">{row.name}</span>
                    <p className="text-xs text-muted-foreground">
                      {[row.brand_name, row.model_name].filter(Boolean).join(' • ') || '—'}
                    </p>
                  </TableCell>
                  <TableCell className="hidden text-xs md:table-cell">
                    {row.category_name || '—'}
                  </TableCell>
                  <TableCell className="dir-ltr hidden font-mono text-xs md:table-cell">
                    {row.barcode || '—'}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        row.stock_qty <= row.reorder_level
                          ? 'font-bold text-destructive'
                          : 'font-bold'
                      }
                    >
                      {row.stock_qty}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.unit_name ? ` ${row.unit_name}` : ''}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-xs lg:table-cell">
                    {row.unit_cost.toLocaleString('ar-EG')}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant={statusBadgeVariant[row.status]}>
                      {productStatusLabels[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-xs xl:table-cell">
                    {row.reorder_level}
                  </TableCell>
                  <TableCell className="hidden text-xs xl:table-cell">
                    {valuationMethodLabels[row.valuation_method]}
                  </TableCell>
                  <TableCell className="text-left">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`إجراءات ${row.name}`}>
                          <RefreshCw className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {canUpdate && row.status !== 'archived' ? (
                          <DropdownMenuItem
                            onClick={() => setFormDialog({ open: true, product: row })}
                          >
                            تعديل البيانات
                          </DropdownMenuItem>
                        ) : null}
                        {canUpdate && row.status === 'active' ? (
                          <DropdownMenuItem onClick={() => handleStatusConfirm(row, 'inactive')}>
                            إيقاف المنتج
                          </DropdownMenuItem>
                        ) : null}
                        {canUpdate && row.status === 'inactive' ? (
                          <DropdownMenuItem onClick={() => handleStatusConfirm(row, 'active')}>
                            تفعيل المنتج
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        {canArchive && row.status !== 'archived' ? (
                          <DropdownMenuItem onClick={() => handleStatusConfirm(row, 'archived')}>
                            أرشفة
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

      <ProductFormDialog
        open={formDialog.open}
        product={product}
        categories={categories}
        brands={brands}
        models={models}
        units={units}
        onOpenChange={(open) => setFormDialog((current) => ({ ...current, open }))}
        onClosed={() => setFormDialog({ open: false, product: null })}
        onSubmit={handleFormSubmit}
      />

      <ReferenceManageDialog
        open={referenceOpen}
        onOpenChange={setReferenceOpen}
        brands={brands}
        onChanged={reload}
      />
    </>
  )
}
