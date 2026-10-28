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
import {
  saveProductBrand,
  saveProductCategory,
  saveProductModel,
  translateProductError,
} from '@/features/products/api'
import type { ProductBrandRecord } from '@/features/products/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  brands: ProductBrandRecord[]
  onChanged: () => void
}

export function ReferenceManageDialog({ open, onOpenChange, brands, onChanged }: Props) {
  const [categoryName, setCategoryName] = useState('')
  const [brandName, setBrandName] = useState('')
  const [modelBrand, setModelBrand] = useState('')
  const [modelName, setModelName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave(action: 'category' | 'brand' | 'model') {
    setSaving(true)
    try {
      if (action === 'category' && categoryName.trim().length >= 2) {
        await saveProductCategory(categoryName)
        setCategoryName('')
        toast.success('تم إنشاء التصنيف.')
      }
      if (action === 'brand' && brandName.trim()) {
        await saveProductBrand(brandName)
        setBrandName('')
        toast.success('تم إنشاء الماركة.')
      }
      if (action === 'model' && modelBrand && modelName.trim()) {
        await saveProductModel(modelBrand, modelName)
        setModelName('')
        toast.success('تم إنشاء الموديل.')
      }
      onChanged()
    } catch (saveError) {
      toast.error(translateProductError(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>التصنيفات والماركات والموديلات</DialogTitle>
          <DialogDescription>
            أساس فهارس المخزون قبل إدخال المنتجات. التصنيفات رئيسية مبدئيًا.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-4 overflow-y-auto">
          <form
            className="grid gap-2 rounded-md border p-3"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave('category')
            }}
          >
            <span className="text-sm font-bold">تصنيف جديد</span>
            <Input
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="اسم التصنيف (حرفان على الأقل)"
              required
            />
            <Button type="submit" size="sm" disabled={saving} className="justify-self-start">
              {saving ? 'جارٍ الحفظ…' : null} إضافة تصنيف
            </Button>
          </form>

          <form
            className="grid gap-2 rounded-md border p-3"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave('brand')
            }}
          >
            <span className="text-sm font-bold">ماركة جديدة</span>
            <Input
              value={brandName}
              onChange={(event) => setBrandName(event.target.value)}
              placeholder="اسم الماركة"
              required
            />
            <Button type="submit" size="sm" disabled={saving} className="justify-self-start">
              إضافة ماركة
            </Button>
          </form>

          <form
            className="grid gap-2 rounded-md border p-3"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave('model')
            }}
          >
            <span className="text-sm font-bold">موديل جديد</span>
            <Select
              value={modelBrand}
              onChange={(event) => setModelBrand(event.target.value)}
              required
            >
              <option value="">اختر الماركة</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </Select>
            <Input
              value={modelName}
              onChange={(event) => setModelName(event.target.value)}
              placeholder="اسم الموديل"
              required
            />
            <Button type="submit" size="sm" disabled={saving} className="justify-self-start">
              إضافة موديل
            </Button>
          </form>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
