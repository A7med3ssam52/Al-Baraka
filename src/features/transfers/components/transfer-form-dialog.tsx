import { Loader2, Plus, Trash2, TriangleAlert } from 'lucide-react'
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

import { translateTransferError } from '../api'
import type { StockTransferInput } from '../types'

interface Line {
  key: string
  kind: 'product' | 'vehicle'
  targetId: string
  quantity: string
}

interface BranchOption {
  id: string
  code: string
  name: string
}

interface Props {
  open: boolean
  branches: BranchOption[]
  products: { id: string; name: string; code: string }[]
  vehicles: { id: string; code: string; chassis_no: string; branch_id: string }[]
  defaultBranchId: string
  initial?: {
    fromBranchId: string
    toBranchId: string
    transferDate: string
    notes?: string | null
    items: { product_id: string | null; vehicle_id: string | null; quantity: number }[]
  } | null
  onOpenChange: (open: boolean) => void
  onClosed: () => void
  onSubmit: (input: StockTransferInput) => Promise<void>
}

let lineCounter = 0

function newLine(): Line {
  lineCounter += 1
  return { key: `transfer-line-${lineCounter}`, kind: 'product', targetId: '', quantity: '1' }
}

export function TransferFormDialog({
  open,
  branches,
  products,
  vehicles,
  defaultBranchId,
  initial,
  onOpenChange,
  onClosed,
  onSubmit,
}: Props) {
  const [fromBranchId, setFromBranchId] = useState('')
  const [toBranchId, setToBranchId] = useState('')
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([newLine()])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (initial) {
      setFromBranchId(initial.fromBranchId)
      setToBranchId(initial.toBranchId)
      setTransferDate(initial.transferDate.slice(0, 10))
      setNotes(initial.notes ?? '')
      setLines(
        initial.items.map((item) => ({
          key: newLine().key,
          kind: (item.vehicle_id ? 'vehicle' : 'product') as 'product' | 'vehicle',
          targetId: (item.vehicle_id ?? item.product_id ?? '') as string,
          quantity: String(item.quantity),
        })),
      )
    } else {
      setFromBranchId(defaultBranchId)
      setToBranchId('')
      setTransferDate(new Date().toISOString().slice(0, 10))
      setNotes('')
      setLines([newLine()])
    }
  }, [open, initial, defaultBranchId])

  function handleDialogOpenChange(next: boolean) {
    onOpenChange(next)
  }

  const sourceVehicles = vehicles.filter(
    (vehicle) => !fromBranchId || vehicle.branch_id === fromBranchId,
  )

  function patchLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!fromBranchId || !toBranchId) {
      setError('اختر الفرع المصدر والفرع الهدف.')
      return
    }

    if (fromBranchId === toBranchId) {
      setError('لا يمكن التحويل إلى نفس الفرع.')
      return
    }

    const items = lines
      .filter((line) => line.targetId)
      .map((line) => ({
        product_id: line.kind === 'product' ? line.targetId : null,
        vehicle_id: line.kind === 'vehicle' ? line.targetId : null,
        quantity: line.kind === 'vehicle' ? 1 : Number(line.quantity || 0),
      }))

    if (items.length === 0) {
      setError('أضف سطرًا واحدًا على الأقل بصنف محدد.')
      return
    }

    if (items.some((item) => item.quantity <= 0)) {
      setError('كمية كل سطر يجب أن تكون أكبر من صفر.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
        transfer_date: transferDate,
        notes: notes.trim() || null,
        items,
      })
      toast.success('تم إنشاء مسودة التحويل. أرسلها لتخصم من الفرع المصدر.')
      onClosed()
    } catch (submitError) {
      setError(translateTransferError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'تعديل مسودة التحويل' : 'تحويل مخزون جديد'}</DialogTitle>
          <DialogDescription>
            يُرقَّم التحويل تلقائيًا TRF-xxxx ويبقى مسودة حتى الإرسال. لا تتغير الأرصدة قبل الإرسال.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الفرع المصدر *</span>
              <Select
                value={fromBranchId}
                onChange={(event) => {
                  setFromBranchId(event.target.value)
                  setLines([newLine()])
                }}
              >
                <option value="">اختر</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} ({branch.code})
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الفرع الهدف *</span>
              <Select value={toBranchId} onChange={(event) => setToBranchId(event.target.value)}>
                <option value="">اختر</option>
                {branches
                  .filter((branch) => branch.id !== fromBranchId)
                  .map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </option>
                  ))}
              </Select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">تاريخ التحويل</span>
              <Input
                type="date"
                value={transferDate}
                onChange={(event) => setTransferDate(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">ملاحظات</span>
              <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">البنود</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLines((current) => [...current, newLine()])}
              >
                <Plus className="size-4" /> إضافة سطر
              </Button>
            </div>

            {lines.map((line, index) => (
              <div
                key={line.key}
                className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-[7rem_1fr_6rem_2.5rem]"
              >
                <label className="grid gap-1.5 text-xs">
                  <span className="font-semibold">النوع</span>
                  <Select
                    value={line.kind}
                    onChange={(event) =>
                      patchLine(line.key, {
                        kind: event.target.value as 'product' | 'vehicle',
                        targetId: '',
                        quantity: '1',
                      })
                    }
                  >
                    <option value="product">منتج</option>
                    <option value="vehicle">مركبة</option>
                  </Select>
                </label>
                <label className="grid gap-1.5 text-xs">
                  <span className="font-semibold">الصنف</span>
                  <Select
                    value={line.targetId}
                    onChange={(event) => patchLine(line.key, { targetId: event.target.value })}
                  >
                    <option value="">اختر</option>
                    {line.kind === 'product'
                      ? products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.code} — {product.name}
                          </option>
                        ))
                      : sourceVehicles.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.code} — {vehicle.chassis_no}
                          </option>
                        ))}
                  </Select>
                </label>
                <label className="grid gap-1.5 text-xs">
                  <span className="font-semibold">الكمية</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={line.kind === 'vehicle'}
                    value={line.kind === 'vehicle' ? '1' : line.quantity}
                    onChange={(event) => patchLine(line.key, { quantity: event.target.value })}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`حذف السطر ${index + 1}`}
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((current) => current.filter((item) => item.key !== line.key))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
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
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null} حفظ المسودة
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
