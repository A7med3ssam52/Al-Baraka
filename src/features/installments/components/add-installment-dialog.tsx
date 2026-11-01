import { Loader2, Plus, TriangleAlert } from 'lucide-react'
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
import { formatCurrency } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

import { translateInstallmentError } from '../api'
import { frequencyLabels } from '../types'

interface CustomerOption {
  id: string
  code: string
  full_name: string
  branch_id: string
}

interface VehicleOption {
  id: string
  code: string
  status: string
  suggested_price: number | null
  approved_cost: number | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

const FREQUENCIES = ['monthly', 'weekly', 'biweekly', 'custom'] as const

export function AddInstallmentDialog({ open, onOpenChange, onCreated }: Props) {
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)

  const [customerId, setCustomerId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [downPayment, setDownPayment] = useState('0')
  const [installmentCount, setInstallmentCount] = useState('6')
  const [frequency, setFrequency] = useState<(typeof FREQUENCIES)[number]>('monthly')
  const [customDays, setCustomDays] = useState('')
  const [firstDueDate, setFirstDueDate] = useState('')
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    let active = true
    setLoadingOptions(true)
    setError(null)

    Promise.all([
      supabase
        .from('customers')
        .select('id, code, full_name, branch_id')
        .eq('status', 'active')
        .order('code')
        .limit(500),
      supabase
        .from('vehicles')
        .select('id, code, status, suggested_price, approved_cost')
        .eq('status', 'available')
        .order('code')
        .limit(500),
    ])
      .then(([customersRes, vehiclesRes]) => {
        if (!active) return

        if (customersRes.error) throw new Error(customersRes.error.message)
        if (vehiclesRes.error) throw new Error(vehiclesRes.error.message)

        setCustomers((customersRes.data ?? []) as CustomerOption[])
        setVehicles((vehiclesRes.data ?? []) as VehicleOption[])
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
    setVehicleId('')
    setUnitPrice('')
    setDownPayment('0')
    setInstallmentCount('6')
    setFrequency('monthly')
    setCustomDays('')
    setNotes('')
    setError(null)
  }, [open])

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId)

  useEffect(() => {
    if (!selectedVehicle) return
    if (!unitPrice) {
      const suggested = selectedVehicle.suggested_price ?? selectedVehicle.approved_cost
      if (suggested !== null && suggested !== undefined) {
        setUnitPrice(String(suggested))
      }
    }
  }, [selectedVehicle, unitPrice])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!customerId) {
      setError('اختر العميل.')
      return
    }

    if (!vehicleId) {
      setError('اختر المركبة.')
      return
    }

    const price = Number(unitPrice)
    if (!Number.isFinite(price) || price <= 0) {
      setError('أدخل سعر بيع صحيحًا.')
      return
    }

    const down = Number(downPayment || 0)
    if (!Number.isFinite(down) || down < 0 || down >= price) {
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
        p_items: [{ vehicle_id: vehicleId, quantity: 1, unit_price: price, discount: 0 }],
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

      toast.success('تم إنشاء العقد وجدول الأقساط واعتماده.')
      onCreated()
    } catch (submitError) {
      setError(translateInstallmentError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  const total = Number(unitPrice || 0) - Number(downPayment || 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>إضافة أقساط لعميل موجود</DialogTitle>
          <DialogDescription>
            يُنشأ بيع تقسيط لعميل مسجل (مركبة + شروط تقسيط)، يُولَّد جدول الأقساط ويُعتمد
            تلقائيًا.
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
                <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                  <option value="">اختر عميلًا</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.code} — {customer.full_name}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="grid gap-1.5 text-sm">
                <span className="font-semibold">المركبة (متاحة) *</span>
                <Select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
                  <option value="">اختر مركبة</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.code}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1.5 text-sm">
                <span className="font-semibold">سعر البيع *</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitPrice}
                  onChange={(event) => setUnitPrice(event.target.value)}
                />
              </label>
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
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
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
            </div>

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">ملاحظات</span>
              <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>

            {Number.isFinite(total) && total > 0 ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                المبلغ الممول (إجمالي − مقدم): <strong>{formatCurrency(total)}</strong> — يُوزَّع
                على {installmentCount} قسط.
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
  )
}
