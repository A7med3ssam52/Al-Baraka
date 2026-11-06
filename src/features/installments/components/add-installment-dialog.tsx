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
import { useAuth } from '@/features/auth/use-auth'
import { fetchCustomers } from '@/features/customers/api'
import { fetchProductBrands, fetchProductModels } from '@/features/products/api'
import { createVehicle, fetchVehicles } from '@/features/vehicles/api'
import { VehicleFormDialog } from '@/features/vehicles/components/vehicle-form-dialog'
import { formatCurrency } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

import { translateInstallmentError } from '../api'
import { frequencyLabels } from '../types'
import type { VehicleCreateInput, VehicleUpdateInput } from '@/features/vehicles/types'

interface CustomerOption {
  id: string
  code: string
  full_name: string
}

interface VehicleOption {
  id: string
  code: string
  suggested_price: number | null
  approved_cost: number | null
}

interface VehicleLine {
  key: string
  vehicleId: string
  unitPrice: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

const FREQUENCIES = ['monthly', 'weekly', 'biweekly', 'custom'] as const

let lineCounter = 0
function newLine(vehicleId = '', unitPrice = ''): VehicleLine {
  lineCounter += 1
  return { key: `line-${lineCounter}`, vehicleId, unitPrice }
}

export function AddInstallmentDialog({ open, onOpenChange, onCreated }: Props) {
  const { hasPermission } = useAuth()
  const canCreateVehicle = hasPermission('vehicles.create')
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([])
  const [models, setModels] = useState<{ id: string; brand_id: string; name: string }[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [lines, setLines] = useState<VehicleLine[]>([newLine()])
  const [downPayment, setDownPayment] = useState('0')
  const [installmentCount, setInstallmentCount] = useState('6')
  const [frequency, setFrequency] = useState<(typeof FREQUENCIES)[number]>('monthly')
  const [customDays, setCustomDays] = useState('')
  const [firstDueDate, setFirstDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false)

  const filteredCustomers = customerSearch.trim()
    ? customers.filter(
        (c) =>
          c.code.toLowerCase().includes(customerSearch.trim().toLowerCase()) ||
          c.full_name.includes(customerSearch.trim()),
      )
    : customers

  useEffect(() => {
    if (!open) return
    let active = true
    setLoadingOptions(true)
    setError(null)

    Promise.all([
      fetchCustomers({ status: 'active' }),
      fetchVehicles({ status: 'available' }),
      fetchProductBrands().catch(() => []),
      fetchProductModels().catch(() => []),
    ])
      .then(([customerRows, vehicleRows, brandRows, modelRows]) => {
        if (!active) return
        setCustomers(customerRows.map((c) => ({ id: c.id, code: c.code, full_name: c.full_name })))
        setVehicles(
          vehicleRows.map((v) => ({
            id: v.id,
            code: v.code,
            suggested_price: v.suggested_price,
            approved_cost: v.approved_cost,
          })),
        )
        setBrands(brandRows)
        setModels(modelRows)
      })
      .catch((loadError) => {
        if (active) setError(translateInstallmentError(loadError))
      })
      .finally(() => {
        if (active) setLoadingOptions(false)
      })

    return () => {
      active = false
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const today = new Date()
    today.setDate(today.getDate() + 30)
    setFirstDueDate(today.toISOString().slice(0, 10))
    setCustomerId('')
    setCustomerSearch('')
    setLines([newLine()])
    setDownPayment('0')
    setInstallmentCount('6')
    setFrequency('monthly')
    setCustomDays('')
    setNotes('')
    setError(null)
  }, [open])

  useEffect(() => {
    setLines((current) =>
      current.map((line) => {
        if (!line.vehicleId || line.unitPrice) return line
        const vehicle = vehicles.find((v) => v.id === line.vehicleId)
        if (!vehicle) return line
        const suggested = vehicle.suggested_price ?? vehicle.approved_cost
        return suggested != null ? { ...line, unitPrice: String(suggested) } : line
      }),
    )
  }, [vehicles])

  const patchLine = (key: string, patch: Partial<VehicleLine>) => {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  const addLine = () => setLines((current) => [...current, newLine()])
  const removeLine = (key: string) =>
    setLines((current) => (current.length <= 1 ? current : current.filter((l) => l.key !== key)))

  const total = lines.reduce((sum, l) => sum + (Number(l.unitPrice) || 0), 0)
  const financed = total - (Number(downPayment) || 0)

  const refreshVehicles = async () => {
    const rows = await fetchVehicles({ status: 'available' })
    setVehicles(
      rows.map((v) => ({
        id: v.id,
        code: v.code,
        suggested_price: v.suggested_price,
        approved_cost: v.approved_cost,
      })),
    )
    return rows
  }

  const handleVehicleCreated = async (input: VehicleCreateInput) => {
    const created = await createVehicle(input)
    const rows = await refreshVehicles()
    const found = rows.find((r) => r.id === created.id)
    setLines((current) => {
      const emptyIdx = current.findIndex((l) => !l.vehicleId)
      const next = [...current]
      const targetIdx = emptyIdx >= 0 ? emptyIdx : next.length - 1
      next[targetIdx] = {
        ...next[targetIdx],
        vehicleId: created.id,
        unitPrice: found?.suggested_price ? String(found.suggested_price) : '',
      }
      return next
    })
    toast.success('تمت إضافة المركبة واختيارها')
  }

  const handleVehicleUpdated = async (_id: string, _input: VehicleUpdateInput) => {}

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!customerId) {
      setError('اختر العميل.')
      return
    }

    const validLines = lines.filter((l) => l.vehicleId)
    if (validLines.length === 0) {
      setError('اختر مركبة واحدة على الأقل.')
      return
    }

    const vehicleIds = validLines.map((l) => l.vehicleId)
    if (new Set(vehicleIds).size !== vehicleIds.length) {
      setError('لا يمكنك إضافة نفس المركبة أكثر من مرة.')
      return
    }

    const prices = validLines.map((l) => Number(l.unitPrice))
    if (prices.some((p) => !Number.isFinite(p) || p <= 0)) {
      setError('أدخل سعر بيع صحيحًا لكل مركبة.')
      return
    }

    const grandTotal = prices.reduce((a, b) => a + b, 0)
    const down = Number(downPayment || 0)
    if (!Number.isFinite(down) || down < 0 || down >= grandTotal) {
      setError('المقدم يجب أن يكون 0 أو أكثر وأقل من إجمالي العقد.')
      return
    }

    const count = Number(installmentCount)
    if (!Number.isInteger(count) || count < 1) {
      setError('أدخل عدد أقساط صحيحًا (1 أو أكثر).')
      return
    }

    if (frequency === 'custom') {
      const days = Number(customDays)
      if (!Number.isInteger(days) || days < 1) {
        setError('أدخل عدد أيام الدورية المخصصة.')
        return
      }
    }

    if (!firstDueDate) {
      setError('اختر تاريخ أول قسط.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const invoice = await supabase.rpc('save_sales_invoice', {
        p_customer_id: customerId,
        p_items: validLines.map((l, idx) => ({
          vehicle_id: l.vehicleId,
          quantity: 1,
          unit_price: prices[idx],
          discount: 0,
        })),
        p_invoice_date: new Date().toISOString().slice(0, 10),
        p_sale_type: 'installment',
        p_discount: 0,
        p_paid_amount: 0,
        p_notes: notes.trim() || 'عقد تقسيط من شاشة الأقساط',
      })

      if (invoice.error) throw new Error(invoice.error.message)

      const invoiceRow = (Array.isArray(invoice.data) ? invoice.data[0] : invoice.data) as {
        id: string
      }

      if (!invoiceRow?.id) throw new Error('sales_invoice_missing')

      const contract = await supabase.rpc('save_contract', {
        p_sale_invoice_id: invoiceRow.id,
        p_down_payment: down,
        p_installment_count: count,
        p_frequency: frequency,
        p_custom_days: frequency === 'custom' ? Number(customDays) : null,
        p_first_due_date: firstDueDate,
        p_guarantor_ids: null,
        p_notes: notes.trim() || null,
        p_contract_id: null,
      })

      if (contract.error) throw new Error(contract.error.message)

      const contractRow = (Array.isArray(contract.data) ? contract.data[0] : contract.data) as {
        id: string
      }

      if (!contractRow?.id) throw new Error('contract_create_failed')

      const schedule = await supabase.rpc('generate_installment_schedule', {
        p_contract_id: contractRow.id,
        p_preview: false,
      })

      if (schedule.error) throw new Error(schedule.error.message)

      const approval = await supabase.rpc('approve_contract', {
        p_contract_id: contractRow.id,
      })

      if (approval.error) throw new Error(approval.error.message)

      toast.success(
        validLines.length === 1
          ? 'تم إنشاء العقد وجدول الأقساط واعتماده.'
          : `تم إنشاء عقد واحد يشمل ${validLines.length} مركبات واعتماده.`,
      )
      onCreated()
    } catch (submitError) {
      setError(translateInstallmentError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إضافة أقساط لعميل موجود</DialogTitle>
            <DialogDescription>
              اختر العميل مرة واحدة، وأضف مركبة أو أكثر لنفس العقد — تُنشأ فاتورة وعقد واحد
              يشمل كل المركبات.
            </DialogDescription>
          </DialogHeader>

          {loadingOptions ? (
            <div className="grid gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-10 w-full animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : (
            <form className="grid gap-3" onSubmit={handleSubmit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold">العميل *</span>
                  <Input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="ابحث بالاسم أو الكود"
                  />
                  <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                    <option value="">اختر عميلًا</option>
                    {filteredCustomers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.code} — {customer.full_name}
                      </option>
                    ))}
                  </Select>
                </label>
                <div className="grid gap-1.5 text-sm content-start">
                  <span className="font-semibold">عمليات سريعة</span>
                  {canCreateVehicle ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setVehicleDialogOpen(true)}
                      className="justify-start"
                    >
                      <Plus className="size-4" />
                      مركبة جديدة
                    </Button>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {vehicles.length === 0
                      ? 'لا توجد مركبات متاحة — أضف مركبة جديدة أولاً.'
                      : `${vehicles.length} مركبة متاحة للبيع`}
                  </p>
                </div>
              </div>

              <div className="grid gap-2">
                {lines.map((line, index) => (
                  <div key={line.key} className="grid gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-end">
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-semibold">المركبة {index + 1} *</span>
                      <Select
                        value={line.vehicleId}
                        onChange={(event) => {
                          const vId = event.target.value
                          const vehicle = vehicles.find((v) => v.id === vId)
                          patchLine(line.key, {
                            vehicleId: vId,
                            unitPrice:
                              line.unitPrice ||
                              (vehicle?.suggested_price ?? vehicle?.approved_cost
                                ? String(vehicle?.suggested_price ?? vehicle?.approved_cost)
                                : ''),
                          })
                        }}
                      >
                        <option value="">اختر مركبة</option>
                        {vehicles.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.code}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-semibold">سعر البيع</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(event) => patchLine(line.key, { unitPrice: event.target.value })}
                        placeholder={line.vehicleId ? 'السعر' : 'اختر مركبة أولاً'}
                        disabled={!line.vehicleId}
                      />
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length <= 1}
                      aria-label="حذف المركبة"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <div>
                  <Button type="button" variant="outline" size="sm" onClick={addLine}>
                    <Plus className="size-4" />
                    إضافة مركبة
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold">المقدم</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={downPayment}
                    onChange={(event) => setDownPayment(event.target.value)}
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold">عدد الأقساط *</span>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={installmentCount}
                    onChange={(event) => setInstallmentCount(event.target.value)}
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold">الدورية *</span>
                  <Select
                    value={frequency}
                    onChange={(event) =>
                      setFrequency(event.target.value as (typeof FREQUENCIES)[number])
                    }
                  >
                    {FREQUENCIES.map((item) => (
                      <option key={item} value={item}>
                        {frequencyLabels[item] ?? item}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {frequency === 'custom' ? (
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-semibold">أيام الدورية</span>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={customDays}
                      onChange={(event) => setCustomDays(event.target.value)}
                    />
                  </label>
                ) : null}
                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold">أول قسط *</span>
                  <Input
                    type="date"
                    value={firstDueDate}
                    onChange={(event) => setFirstDueDate(event.target.value)}
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold">ملاحظات</span>
                  <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
                </label>
              </div>

              {total > 0 ? (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  الإجمالي: <strong>{formatCurrency(total)}</strong> — الممول:{' '}
                  <strong>{formatCurrency(financed)}</strong> على {installmentCount} قسط.
                </div>
              ) : null}

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
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  إنشاء الأقساط
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <VehicleFormDialog
        open={vehicleDialogOpen}
        vehicle={null}
        brands={brands}
        models={models}
        onOpenChange={setVehicleDialogOpen}
        onClosed={() => setVehicleDialogOpen(false)}
        onSubmitCreate={handleVehicleCreated}
        onSubmitUpdate={handleVehicleUpdated}
      />
    </>
  )
}
