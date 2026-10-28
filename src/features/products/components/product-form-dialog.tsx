import { Loader2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { translateProductError } from '@/features/products/api'
import {
  valuationMethodLabels,
  type ProductBrandRecord,
  type ProductCategoryRecord,
  type ProductRecord,
  type ProductUnitRecord,
  type ValuationMethod,
} from '@/features/products/types'

interface Props {
  open: boolean
  product: ProductRecord | null
  categories: ProductCategoryRecord[]
  brands: ProductBrandRecord[]
  models: { id: string; brand_id: string; name: string }[]
  units: ProductUnitRecord[]
  onOpenChange: (open: boolean) => void
  onClosed: () => void
  onSubmit: (input: {
    name: string
    category_id: string
    brand_id: string
    model_id: string
    unit_name: string
    barcode: string
    description: string
    unit_cost: number
    valuation_method: ValuationMethod
    reorder_level: number
  }) => Promise<void>
}

interface FormState {
  name: string
  category_id: string
  brand_id: string
  model_id: string
  unit_name: string
  barcode: string
  description: string
  unit_cost: string
  valuation_method: ValuationMethod
  reorder_level: string
}

const emptyForm: FormState = {
  name: '',
  category_id: '',
  brand_id: '',
  model_id: '',
  unit_name: '',
  barcode: '',
  description: '',
  unit_cost: '0',
  valuation_method: 'avco',
  reorder_level: '0',
}

export function ProductFormDialog({
  open,
  product,
  categories,
  brands,
  models,
  units,
  onOpenChange,
  onClosed,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEdit = product !== null

  function patch(next: Partial<FormState>) {
    setForm((current) => ({ ...current, ...next }))
  }

  function handleDialogOpenChange(next: boolean) {
    if (next) {
      setForm(
        product
          ? {
              name: product.name,
              category_id: product.category_id ?? '',
              brand_id: product.brand_id ?? '',
              model_id: product.model_id ?? '',
              unit_name: product.unit_name ?? '',
              barcode: product.barcode ?? '',
              description: product.description ?? '',
              unit_cost: String(product.unit_cost),
              valuation_method: product.valuation_method,
              reorder_level: String(product.reorder_level),
            }
          : emptyForm,
      )
      setError(null)
    }
    onOpenChange(next)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const name = form.name.trim()
    if (name.length < 2) {
      toast.error('اسم المنتج مطلوب (حرفان على الأقل).')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        name,
        category_id: form.category_id,
        brand_id: form.brand_id,
        model_id: form.model_id,
        unit_name: form.unit_name,
        barcode: form.barcode,
        description: form.description,
        unit_cost: Number(form.unit_cost || 0),
        valuation_method: form.valuation_method,
        reorder_level: Number(form.reorder_level || 0),
      })
      onClosed()
      toast.success(isEdit ? 'تم حفظ بيانات المنتج.' : 'تم إضافة المنتج بنجاح.')
    } catch (submitError) {
      setError(translateProductError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'تعديل المنتج' : 'منتج جديد'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `تعديل بيانات المنتج ${product?.code}`
              : 'تُرقَّم المنتجات تلقائيًا PRD-xxxx.'}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-3" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">اسم المنتج *</span>
            <Input
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="مثال: إطار أمامي 120/70"
              required
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">التصنيف</span>
              <Select
                value={form.category_id}
                onChange={(event) => patch({ category_id: event.target.value })}
              >
                <option value="">—</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الماركة</span>
              <Select
                value={form.brand_id}
                onChange={(event) => patch({ brand_id: event.target.value, model_id: '' })}
              >
                <option value="">—</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الموديل</span>
              <Select
                value={form.model_id}
                onChange={(event) => patch({ model_id: event.target.value })}
                disabled={!form.brand_id}
              >
                <option value="">—</option>
                {models
                  .filter((m) => m.brand_id === form.brand_id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">وحدة القياس</span>
              <Select
                value={form.unit_name}
                onChange={(event) => patch({ unit_name: event.target.value })}
              >
                <option value="">—</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.name}>
                    {unit.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الباركود</span>
              <Input
                dir="ltr"
                className="text-left"
                value={form.barcode}
                onChange={(event) => patch({ barcode: event.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">طريقة التقييم</span>
              <Select
                value={form.valuation_method}
                onChange={(event) =>
                  patch({ valuation_method: event.target.value as ValuationMethod })
                }
              >
                {(Object.keys(valuationMethodLabels) as ValuationMethod[]).map((method) => (
                  <option key={method} value={method}>
                    {valuationMethodLabels[method]}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">تكلفة الوحدة</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.unit_cost}
                onChange={(event) => patch({ unit_cost: event.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">إعادة الطلب</span>
              <Input
                type="number"
                min="0"
                value={form.reorder_level}
                onChange={(event) => patch({ reorder_level: event.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">وصف</span>
              <Input
                value={form.description}
                onChange={(event) => patch({ description: event.target.value })}
              />
            </label>
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {isEdit ? 'حفظ التعديلات' : 'إضافة المنتج'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
