import { Loader2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
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

import { translateCountError } from '../api'
import type { StockCountInput } from '../types'

interface BranchOption {
  id: string
  code: string
  name: string
}

interface Props {
  open: boolean
  branches: BranchOption[]
  products: { id: string; name: string; code: string }[]
  defaultBranchId: string
  onOpenChange: (open: boolean) => void
  onClosed: () => void
  onSubmit: (input: StockCountInput) => Promise<void>
}

export function CountFormDialog({
  open,
  branches,
  products,
  defaultBranchId,
  onOpenChange,
  onClosed,
  onSubmit,
}: Props) {
  const [branchId, setBranchId] = useState('')
  const [countDate, setCountDate] = useState(new Date().toISOString().slice(0, 10))
  const [scope, setScope] = useState<'all' | 'single'>('all')
  const [productId, setProductId] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setBranchId(defaultBranchId)
    setCountDate(new Date().toISOString().slice(0, 10))
    setScope('all')
    setProductId('')
    setNotes('')
  }, [open, defaultBranchId])

  function handleDialogOpenChange(next: boolean) {
    onOpenChange(next)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!branchId) {
      setError('اختر الفرع أولًا.')
      return
    }

    if (scope === 'single' && !productId) {
      setError('اختر المنتج المطلوب جرده.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        branch_id: branchId,
        count_date: countDate,
        notes: notes.trim() || null,
        product_ids: scope === 'single' ? [productId] : null,
      })
      toast.success('تم إنشاء جلسة الجرد. أدخل الكميات الفعلية ثم اعتمدها.')
      onClosed()
    } catch (submitError) {
      setError(translateCountError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>جرد فعلي جديد</DialogTitle>
          <DialogDescription>
            يُرقَّم الجرد تلقائيًا CNT-xxxx ويحفظ كمية النظام لحظة الإنشاء. لا يتغير المخزون قبل
            الاعتماد.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-3" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">الفرع *</span>
            <Select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">اختر</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} ({branch.code})
                </option>
              ))}
            </Select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">تاريخ الجرد</span>
              <Input
                type="date"
                value={countDate}
                onChange={(event) => setCountDate(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">نطاق الجرد</span>
              <Select
                value={scope}
                onChange={(event) => setScope(event.target.value as 'all' | 'single')}
              >
                <option value="all">كل المنتجات النشطة</option>
                <option value="single">منتج واحد</option>
              </Select>
            </label>
          </div>

          {scope === 'single' ? (
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">المنتج *</span>
              <Select value={productId} onChange={(event) => setProductId(event.target.value)}>
                <option value="">اختر</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.code} — {product.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">ملاحظات</span>
            <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>

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
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null} إنشاء الجرد
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
