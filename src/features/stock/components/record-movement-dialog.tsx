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
import { translateStockError } from '@/features/stock/api'
import {
  movementTypeLabels,
  movementTypeSign,
  type MovementType,
  type StockMovementInput,
} from '@/features/stock/types'

interface Props {
  open: boolean
  products: { id: string; name: string; code: string }[]
  vehicles: { id: string; code: string; chassis_no: string }[]
  onOpenChange: (open: boolean) => void
  onClosed: () => void
  onSubmit: (input: StockMovementInput) => Promise<void>
}

const selectableTypes: MovementType[] = [
  'opening',
  'purchase',
  'sale',
  'return_in',
  'return_out',
  'transfer_in',
  'transfer_out',
  'adjustment',
  'count',
  'damage',
]

export function RecordMovementDialog({
  open,
  products,
  vehicles,
  onOpenChange,
  onClosed,
  onSubmit,
}: Props) {
  const [targetKind, setTargetKind] = useState<'product' | 'vehicle'>('product')
  const [targetId, setTargetId] = useState('')
  const [movementType, setMovementType] = useState<MovementType>('purchase')
  const [quantity, setQuantity] = useState('1')
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [unitCost, setUnitCost] = useState('0')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fixedSign = movementTypeSign[movementType]

  useEffect(() => {
    if (!open) return
    setTargetKind('product')
    setTargetId('')
    setMovementType('purchase')
    setQuantity('1')
    setDirection('in')
    setUnitCost('0')
    setNotes('')
    setError(null)
  }, [open])

  function handleDialogOpenChange(next: boolean) {
    onOpenChange(next)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const absolute = Math.abs(Number(quantity || 0))

    if (!targetId) {
      setError('اختر المنتج أو المركبة أولًا.')
      return
    }
    if (absolute <= 0) {
      setError('الكمية يجب أن تكون أكبر من صفر.')
      return
    }

    const sign = fixedSign === 0 ? (direction === 'in' ? 1 : -1) : fixedSign

    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        movement_type: movementType,
        quantity: sign * absolute,
        product_id: targetKind === 'product' ? targetId : null,
        vehicle_id: targetKind === 'vehicle' ? targetId : null,
        unit_cost: Number(unitCost || 0),
        notes: notes.trim() || null,
      })
      toast.success('تم تسجيل حركة المخزون.')
      onClosed()
    } catch (submitError) {
      setError(translateStockError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>حركة مخزون جديدة</DialogTitle>
          <DialogDescription>
            تُسجَّل الحركة على فرعك الحالي وتحدّث الرصيد فورًا. الرصيد السالب مرفوض.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-3" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">نوع الصنف</span>
              <Select
                value={targetKind}
                onChange={(event) => {
                  setTargetKind(event.target.value as 'product' | 'vehicle')
                  setTargetId('')
                }}
              >
                <option value="product">منتج كمي</option>
                <option value="vehicle">مركبة تسلسلية</option>
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الصنف *</span>
              <Select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                <option value="">اختر</option>
                {targetKind === 'product'
                  ? products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.code} — {product.name}
                      </option>
                    ))
                  : vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.code} — {vehicle.chassis_no}
                      </option>
                    ))}
              </Select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">نوع الحركة</span>
              <Select
                value={movementType}
                onChange={(event) => setMovementType(event.target.value as MovementType)}
              >
                {selectableTypes.map((type) => (
                  <option key={type} value={type}>
                    {movementTypeLabels[type]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">
                {targetKind === 'vehicle' ? 'الكمية (مركبة واحدة)' : 'الكمية'}
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                max={targetKind === 'vehicle' ? '1' : undefined}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
          </div>

          {fixedSign === 0 ? (
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">اتجاه التسوية</span>
              <Select
                value={direction}
                onChange={(event) => setDirection(event.target.value as 'in' | 'out')}
              >
                <option value="in">زيادة الرصيد</option>
                <option value="out">نقص الرصيد</option>
              </Select>
            </label>
          ) : (
            <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              اتجاه الحركة ثابت حسب النوع:{' '}
              <span className="font-semibold">{fixedSign > 0 ? 'زيادة الرصيد' : 'نقص الرصيد'}</span>
              .
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">تكلفة الوحدة</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={unitCost}
                onChange={(event) => setUnitCost(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">ملاحظات</span>
              <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
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
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null} تسجيل الحركة
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
