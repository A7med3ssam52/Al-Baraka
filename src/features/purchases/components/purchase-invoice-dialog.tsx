import { Loader2, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
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
import { fetchPurchaseInvoice, translatePurchaseError } from '@/features/purchases/api'
import {
  purchasePaymentLabels,
  type PurchaseInvoiceInput,
  type PurchaseInvoiceRecord,
  type PurchasePaymentMethod,
} from '@/features/purchases/types'

interface Line {
  key: string
  kind: 'product' | 'vehicle'
  targetId: string
  quantity: string
  unitPrice: string
  discount: string
}

interface Props {
  open: boolean
  invoice: PurchaseInvoiceRecord | null
  suppliers: { id: string; full_name: string }[]
  products: { id: string; name: string; code: string }[]
  vehicles: { id: string; code: string; chassis_no: string }[]
  onOpenChange: (open: boolean) => void
  onClosed: () => void
  onSubmit: (input: PurchaseInvoiceInput, invoiceId?: string) => Promise<void>
}

let lineCounter = 0

function newLine(): Line {
  lineCounter += 1
  return {
    key: `line-${lineCounter}`,
    kind: 'product',
    targetId: '',
    quantity: '1',
    unitPrice: '0',
    discount: '0',
  }
}

export function PurchaseInvoiceDialog({
  open,
  invoice,
  suppliers,
  products,
  vehicles,
  onOpenChange,
  onClosed,
  onSubmit,
}: Props) {
  const [supplierId, setSupplierId] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [supplierReference, setSupplierReference] = useState('')
  const [lines, setLines] = useState<Line[]>([newLine()])
  const [discount, setDiscount] = useState('0')
  const [transport, setTransport] = useState('0')
  const [prep, setPrep] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState<PurchasePaymentMethod>('cash')
  const [paid, setPaid] = useState('0')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = invoice !== null

  function handleDialogOpenChange(next: boolean) {
    if (next) {
      setError(null)
      setSupplierId(invoice?.supplier_id ?? '')
      setInvoiceDate(invoice?.invoice_date ?? new Date().toISOString().slice(0, 10))
      setSupplierReference('')
      setDiscount(invoice ? String(invoice.discount) : '0')
      setTransport(invoice ? String(invoice.transport_cost) : '0')
      setPrep(invoice ? String(invoice.prep_cost) : '0')
      setPaymentMethod(invoice?.payment_method ?? 'cash')
      setPaid(invoice ? String(invoice.paid_amount) : '0')
      setNotes('')
      setLines([newLine()])

      if (invoice) {
        setLoading(true)
        fetchPurchaseInvoice(invoice.id)
          .then((detail) => {
            setSupplierReference(detail.invoice.supplier_reference ?? '')
            setNotes(detail.invoice.notes ?? '')
            setLines(
              detail.items.map((item, index) => ({
                key: `loaded-${index}`,
                kind: item.product_id ? 'product' : 'vehicle',
                targetId: item.product_id ?? item.vehicle_id ?? '',
                quantity: String(item.quantity),
                unitPrice: String(item.unit_price),
                discount: String(item.discount),
              })),
            )
          })
          .catch((loadError) => setError(translatePurchaseError(loadError)))
          .finally(() => setLoading(false))
      }
    }
    onOpenChange(next)
  }

  const subtotal = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const value = Number(line.quantity || 0) * Number(line.unitPrice || 0)
        return sum + Math.max(value - Number(line.discount || 0), 0)
      }, 0),
    [lines],
  )

  const total = Math.max(
    subtotal - Number(discount || 0) + Number(transport || 0) + Number(prep || 0),
    0,
  )

  function patchLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!supplierId) {
      setError('اختر المورد أولًا.')
      return
    }

    const items = lines
      .filter((line) => line.targetId)
      .map((line) => ({
        product_id: line.kind === 'product' ? line.targetId : null,
        vehicle_id: line.kind === 'vehicle' ? line.targetId : null,
        quantity: Number(line.quantity || 0),
        unit_price: Number(line.unitPrice || 0),
        discount: Number(line.discount || 0),
      }))

    if (items.length === 0) {
      setError('أضف سطرًا واحدًا على الأقل بصنف محدد.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(
        {
          supplier_id: supplierId,
          invoice_date: invoiceDate,
          items,
          discount: Number(discount || 0),
          transport_cost: Number(transport || 0),
          prep_cost: Number(prep || 0),
          payment_method: paymentMethod,
          paid_amount: Number(paid || 0),
          notes: notes.trim() || null,
          supplier_reference: supplierReference.trim() || null,
        },
        invoice?.id,
      )
      toast.success(isEdit ? 'تم تحديث المسودة.' : 'تم إنشاء فاتورة الشراء.')
      onClosed()
    } catch (submitError) {
      setError(translatePurchaseError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `تعديل ${invoice.number}` : 'فاتورة شراء جديدة'}</DialogTitle>
          <DialogDescription>
            تُرقَّم الفواتير تلقائيًا PINV-xxxxx وتبقى مسودة حتى الاعتماد.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">المورد *</span>
              <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                <option value="">اختر المورد</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.full_name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">تاريخ الفاتورة</span>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">مرجع المورد</span>
              <Input
                value={supplierReference}
                onChange={(event) => setSupplierReference(event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">الأصناف</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setLines((current) => [...current, newLine()])}
              >
                <Plus className="size-4" /> سطر
              </Button>
            </div>

            {loading ? (
              <p className="text-xs text-muted-foreground">جارٍ تحميل الأصناف…</p>
            ) : (
              <div className="grid gap-2">
                {lines.map((line) => (
                  <div
                    key={line.key}
                    className="grid gap-2 rounded-md bg-muted/30 p-2 sm:grid-cols-[7rem_1fr_5rem_6rem_6rem_2rem]"
                  >
                    <Select
                      value={line.kind}
                      onChange={(event) =>
                        patchLine(line.key, {
                          kind: event.target.value as 'product' | 'vehicle',
                          targetId: '',
                        })
                      }
                    >
                      <option value="product">منتج</option>
                      <option value="vehicle">مركبة</option>
                    </Select>
                    <Select
                      value={line.targetId}
                      onChange={(event) => patchLine(line.key, { targetId: event.target.value })}
                    >
                      <option value="">اختر الصنف</option>
                      {line.kind === 'product'
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
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.quantity}
                      onChange={(event) => patchLine(line.key, { quantity: event.target.value })}
                      placeholder="كمية"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(event) => patchLine(line.key, { unitPrice: event.target.value })}
                      placeholder="سعر"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.discount}
                      onChange={(event) => patchLine(line.key, { discount: event.target.value })}
                      placeholder="خصم"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="حذف السطر"
                      onClick={() =>
                        setLines((current) =>
                          current.length === 1
                            ? [newLine()]
                            : current.filter((row) => row.key !== line.key),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">خصم الفاتورة</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">تكلفة نقل</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={transport}
                onChange={(event) => setTransport(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">تكلفة تجهيز</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={prep}
                onChange={(event) => setPrep(event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">طريقة السداد</span>
              <Select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as PurchasePaymentMethod)}
              >
                {(Object.keys(purchasePaymentLabels) as PurchasePaymentMethod[]).map((method) => (
                  <option key={method} value={method}>
                    {purchasePaymentLabels[method]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">المدفوع</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={paid}
                onChange={(event) => setPaid(event.target.value)}
                disabled={paymentMethod === 'credit'}
              />
            </label>
            <div className="grid gap-1 rounded-md border bg-muted/30 p-2 text-xs">
              <span>
                الإجمالي: <strong>{total.toLocaleString('ar-EG')}</strong>
              </span>
              <span>
                المتبقي:{' '}
                <strong>{Math.max(total - Number(paid || 0), 0).toLocaleString('ar-EG')}</strong>
              </span>
            </div>
          </div>

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
            <Button type="submit" disabled={submitting || loading}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {isEdit ? 'حفظ المسودة' : 'إنشاء الفاتورة'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
