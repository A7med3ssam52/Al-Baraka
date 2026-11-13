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
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useAuth } from '@/features/auth/use-auth'
import { fetchCustomers, searchCustomers } from '@/features/customers/api'
import { filterCustomersSmart } from '@/features/customers/smart-search'
import { fetchProductBrands, fetchProductModels } from '@/features/products/api'
import { createVehicle, fetchVehicles } from '@/features/vehicles/api'
import { VehicleFormDialog } from '@/features/vehicles/components/vehicle-form-dialog'
import { formatCurrency, formatDate } from '@/lib/utils'

import { translateInstallmentError } from '../api'
import { frequencyLabels } from '../types'
import { ManualInstallmentRows } from './manual-installment-rows'
import {
  newManualRow,
  validateManualRows,
  type ManualInstallmentRow,
} from '../manual-installment-shared'
import type { VehicleCreateInput } from '@/features/vehicles/types'
import { rpcOfflineAware } from '@/lib/offline'

interface CustomerOption {
  id: string
  code: string
  full_name: string
}

interface VehicleOption {
  id: string
  code: string
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
  initialCustomerId?: string
}

const FREQUENCIES = ['monthly', 'weekly', 'biweekly', 'custom', 'manual'] as const

let lineCounter = 0
function newLine(vehicleId = '', unitPrice = ''): VehicleLine {
  lineCounter += 1
  return { key: `line-${lineCounter}`, vehicleId, unitPrice }
}

const round2 = (n: number) => Math.round(n * 100) / 100
const trunc2 = (n: number) => Math.trunc(n * 100) / 100

interface PreviewRow {
  no: number
  due_date: string
  amount: number
}

/** Client-side mirror of generate_installment_schedule for regular frequencies (display only). */
function previewSchedule(
  firstDue: string,
  count: number,
  frequency: (typeof FREQUENCIES)[number],
  customDays: string,
  financed: number,
): PreviewRow[] {
  if (!firstDue || count < 1 || financed <= 0) return []
  if (frequency === 'custom' && !(Number(customDays) >= 1)) return []

  const toIso = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const current = new Date(`${firstDue}T00:00:00`)
  if (Number.isNaN(current.getTime())) return []

  const base = trunc2(financed / count)
  const remainder = round2(financed - base * count)
  const rows: PreviewRow[] = []

  for (let index = 1; index <= count; index += 1) {
    const amount = index === count ? round2(base + remainder) : base
    rows.push({ no: index, due_date: toIso(current), amount })

    if (frequency === 'monthly') {
      current.setMonth(current.getMonth() + 1)
    } else if (frequency === 'weekly') {
      current.setDate(current.getDate() + 7)
    } else if (frequency === 'biweekly') {
      current.setDate(current.getDate() + 14)
    } else if (frequency === 'custom') {
      current.setDate(current.getDate() + Number(customDays))
    }
  }

  return rows
}

export function AddInstallmentDialog({ open, onOpenChange, onCreated, initialCustomerId }: Props) {
  const { hasPermission } = useAuth()
  const canCreateVehicle = hasPermission('vehicles.create')
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([])
  const [models, setModels] = useState<{ id: string; brand_id: string; name: string }[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [customerSearch, setCustomerSearch] = useState('')
  const [remoteResult, setRemoteResult] = useState<{ term: string; rows: CustomerOption[] } | null>(
    null,
  )

  const searchTerm = customerSearch.trim()
  const filteredCustomers =
    searchTerm && remoteResult?.term === searchTerm
      ? remoteResult.rows
      : filterCustomersSmart(customers, customerSearch)
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
  const [manualRows, setManualRows] = useState<ManualInstallmentRow[]>([newManualRow()])
  const [legacyNos, setLegacyNos] = useState<number[]>([])
  const [legacyDown, setLegacyDown] = useState(false)

  // Reset transient UI state whenever the dialog opens — render-phase adjustment.
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setLoadingOptions(true)
      setError(null)
      const today = new Date()
      today.setDate(today.getDate() + 30)
      setFirstDueDate(today.toISOString().slice(0, 10))
      setCustomerId(initialCustomerId ?? '')
      setCustomerSearch('')
      setRemoteResult(null)
      setLines([newLine()])
      setDownPayment('0')
      setInstallmentCount('6')
      setFrequency('monthly')
      setCustomDays('')
      setNotes('')
      setManualRows([newManualRow()])
      setLegacyNos([])
      setLegacyDown(false)
    }
  }

  useEffect(() => {
    if (!open) return
    let active = true

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

  // بحث ذكي حي في قائمة العملاء.
  useEffect(() => {
    if (!open) return
    const term = customerSearch.trim()
    if (!term) return
    let active = true
    const timer = window.setTimeout(() => {
      searchCustomers(term, { status: 'active' })
        .then((rows) => {
          if (!active) return
          setRemoteResult({
            term,
            rows: rows.map((c) => ({ id: c.id, code: c.code, full_name: c.full_name })),
          })
        })
        .catch(() => {
          if (!active) return
          setRemoteResult({
            term,
            rows: filterCustomersSmart(customers, term).map((c) => ({
              id: c.id,
              code: c.code,
              full_name: c.full_name,
            })),
          })
        })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [customerSearch, open, customers])

  const patchLine = (key: string, patch: Partial<VehicleLine>) => {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  const addLine = () => setLines((current) => [...current, newLine()])
  const removeLine = (key: string) =>
    setLines((current) => (current.length <= 1 ? current : current.filter((l) => l.key !== key)))

  const isManual = frequency === 'manual'
  const vehicleTotal = lines.reduce((sum, l) => sum + (Number(l.unitPrice) || 0), 0)
  const downAmount = Number(downPayment) || 0
  const parsedCount = Number(installmentCount)
  const safeCount = Number.isInteger(parsedCount) && parsedCount > 0 ? parsedCount : 0
  const financed = isManual ? vehicleTotal - downAmount : vehicleTotal * safeCount
  const total = isManual ? vehicleTotal : financed + downAmount
  const manualLegacySum = manualRows.reduce(
    (sum, row) => sum + (row.legacy ? Number(row.amount) || 0 : 0),
    0,
  )
  const previewRows = isManual
    ? []
    : previewSchedule(firstDueDate, safeCount, frequency, customDays, financed)
  const legacySum = previewRows
    .filter((row) => legacyNos.includes(row.no))
    .reduce((sum, row) => sum + row.amount, 0)

  const refreshVehicles = async () => {
    const rows = await fetchVehicles({ status: 'available' })
    setVehicles(
      rows.map((v) => ({
        id: v.id,
        code: v.code,
      })),
    )
    return rows
  }

  const handleVehicleCreated = async (input: VehicleCreateInput) => {
    const created = await createVehicle(input)
    await refreshVehicles()
    setLines((current) => {
      const emptyIdx = current.findIndex((l) => !l.vehicleId)
      const next = [...current]
      const targetIdx = emptyIdx >= 0 ? emptyIdx : next.length - 1
      // Leave the price empty — it is entered manually each time.
      next[targetIdx] = {
        ...next[targetIdx],
        vehicleId: created.id,
        unitPrice: '',
      }
      return next
    })
    toast.success('تمت إضافة المركبة واختيارها')
  }

  const handleVehicleUpdated = async () => {}

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

    const costs = validLines.map((l) => Number(l.unitPrice))
    if (costs.some((p) => !Number.isFinite(p) || p <= 0)) {
      setError(isManual ? 'أدخل سعر المركبة لكل مركبة.' : 'أدخل تكلفة القسط صحيحًا لكل مركبة.')
      return
    }

    const perPeriod = costs.reduce((a, b) => a + b, 0)
    const down = Number(downPayment || 0)
    if (!Number.isFinite(down) || down < 0) {
      setError('المقدم يجب أن يكون 0 أو أكثر.')
      return
    }

    let count = Number(installmentCount)
    let financedTotal = perPeriod * count
    let grandTotal = financedTotal + down
    let manualItems: Array<{ due_date: string; amount: number }> | null = null
    let firstDue = firstDueDate
    let legacyNosPayload: number[] | null

    if (isManual) {
      financedTotal = perPeriod - down
      if (!Number.isFinite(financedTotal) || financedTotal <= 0) {
        setError('مجموع أسعار المركبات لازم يكون أكبر من المقدم.')
        return
      }

      const manualError = validateManualRows(manualRows, financedTotal)
      if (manualError) {
        setError(manualError)
        return
      }

      count = manualRows.length
      grandTotal = perPeriod
      firstDue = manualRows[0].due_date
      manualItems = manualRows.map((row) => ({
        due_date: row.due_date,
        amount: Math.round(Number(row.amount) * 100) / 100,
      }))
      const nos = manualRows
        .map((row, index) => (row.legacy ? index + 1 : 0))
        .filter((no) => no > 0)
      legacyNosPayload = nos.length > 0 ? nos : null
    } else {
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

      legacyNosPayload = legacyNos.length > 0 ? [...legacyNos].sort((a, b) => a - b) : null
    }

    setSubmitting(true)
    setError(null)

    try {
      // تكلفة القسط = اللي النظام هيخصمه كل دورية. إجمالي الفاتورة:
      // في الدوريات المنتظمة = (تكلفة الدورية × العدد) + المقدم.
      // في المواعيد المخصصة = مجموع أسعار المركبات نفسها (والممول = المجموع − المقدم).
      let invoiceItems: Array<{
        vehicle_id: string
        quantity: number
        unit_price: number
        discount: number
      }>

      if (isManual) {
        invoiceItems = validLines.map((l, idx) => ({
          vehicle_id: l.vehicleId,
          quantity: 1,
          unit_price: costs[idx],
          discount: 0,
        }))
      } else {
        let accumulated = 0
        invoiceItems = validLines.map((l, idx) => {
          const lineTotal =
            Math.round((costs[idx] * count + down * (costs[idx] / perPeriod || 0)) * 100) / 100
          accumulated += lineTotal
          const isLast = idx === validLines.length - 1
          const adjusted = isLast
            ? Math.round((grandTotal - (accumulated - lineTotal)) * 100) / 100
            : lineTotal
          return {
            vehicle_id: l.vehicleId,
            quantity: 1,
            unit_price: adjusted,
            discount: 0,
          }
        })
      }
      const invoice = await rpcOfflineAware('save_sales_invoice', {
        p_customer_id: customerId,
        p_items: invoiceItems,
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

      const contract = await rpcOfflineAware('save_contract', {
        p_sale_invoice_id: invoiceRow.id,
        p_down_payment: down,
        p_installment_count: count,
        p_frequency: frequency,
        p_custom_days: frequency === 'custom' ? Number(customDays) : null,
        p_first_due_date: firstDue,
        p_guarantor_ids: null,
        p_notes: notes.trim() || null,
        p_contract_id: null,
      })

      if (contract.error) throw new Error(contract.error.message)

      const contractRow = (Array.isArray(contract.data) ? contract.data[0] : contract.data) as {
        id: string
      }

      if (!contractRow?.id) throw new Error('contract_create_failed')

      const schedule = await rpcOfflineAware('generate_installment_schedule', {
        p_contract_id: contractRow.id,
        p_preview: false,
        ...(manualItems ? { p_items: manualItems } : {}),
      })

      if (schedule.error) throw new Error(schedule.error.message)

      const approval = await rpcOfflineAware('approve_contract', {
        p_contract_id: contractRow.id,
        p_legacy_installment_nos: legacyNosPayload,
        p_legacy_down_payment: legacyDown,
      })

      if (approval.error) throw new Error(approval.error.message)

      toast.success(
        validLines.length === 1
          ? 'تم إنشاء العقد وجدول الأقساط واعتماده.'
          : `تم إنشاء عقد واحد يشمل ${validLines.length} مركبات واعتماده.`,
      )
      onCreated()
    } catch (submitError) {
      const raw = submitError instanceof Error ? submitError.message : String(submitError ?? '')
      setError(translateInstallmentError(submitError))
      // المركبة ممكن تكون اتباعت/تأرشفت بين ما فتحت الشاشة وما حفظت — حدّث القائمة
      // عشان تبان المركبات المتاحة فعلًا بدل ما المستخدم يفضل يضغط على نفسها.
      if (/vehicle_(unavailable|not_available|missing)/i.test(raw)) {
        void refreshVehicles().catch(() => undefined)
      }
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
              اختر العميل مرة واحدة، وأضف مركبة أو أكثر لنفس العقد — تُنشأ فاتورة وعقد واحد يشمل كل
              المركبات.
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
                  <Select
                    value={customerId}
                    onChange={(event) => setCustomerId(event.target.value)}
                  >
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
                  <div
                    key={line.key}
                    className="grid gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-end"
                  >
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-semibold">المركبة {index + 1} *</span>
                      <Select
                        value={line.vehicleId}
                        onChange={(event) => {
                          // Keep the manual price as-is; never auto-fill it.
                          patchLine(line.key, { vehicleId: event.target.value })
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
                      <span className="font-semibold">{isManual ? 'سعر المركبة *' : 'تكلفة القسط *'}</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(event) => patchLine(line.key, { unitPrice: event.target.value })}
                        placeholder={line.vehicleId ? 'تُدخّل يدوي كل مرة' : 'اختر مركبة أولاً'}
                        disabled={!line.vehicleId}
                      />
                      <span className="text-[11px] text-muted-foreground">
                        {isManual ? 'السعر الإجمالي للمركبة (قبل المقدم)' : 'اللي النظام هيخصمها كل دورية'}
                      </span>
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
                  {downAmount > 0 ? (
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Checkbox
                        checked={legacyDown}
                        onChange={() => setLegacyDown((current) => !current)}
                        aria-label="المقدم مدفوع في الدفتر القديم"
                      />
                      مدفوع من قبل في الدفتر القديم — بدون أي حركة خزنة
                    </span>
                  ) : null}
                </label>
                {!isManual ? (
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
                ) : null}
                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold">الدورية *</span>
                  <Select
                    value={frequency}
                    onChange={(event) => {
                      setFrequency(event.target.value as (typeof FREQUENCIES)[number])
                      setLegacyNos([])
                    }}
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
                {!isManual ? (
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-semibold">أول قسط *</span>
                    <Input
                      type="date"
                      value={firstDueDate}
                      onChange={(event) => setFirstDueDate(event.target.value)}
                    />
                  </label>
                ) : null}
                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold">ملاحظات</span>
                  <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
                </label>
              </div>

              {isManual ? (
                <ManualInstallmentRows
                  rows={manualRows}
                  financed={Math.max(financed, 0)}
                  onChange={setManualRows}
                  showLegacy
                />
              ) : null}

              {!isManual && previewRows.length > 0 ? (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold">
                      الأقساط المتوقعة — علّم اللي اتدفع منها قبل كده في الدفتر القديم
                    </span>
                    {legacyNos.length > 0 ? (
                      <span className="text-warning">
                        {legacyNos.length} قسط قديم ({formatCurrency(legacySum)}) — بدون حركة خزنة
                      </span>
                    ) : null}
                  </div>
                  <div className="grid max-h-44 gap-1 overflow-y-auto">
                    {previewRows.map((row) => (
                      <label
                        key={row.no}
                        className="grid grid-cols-[2rem_1fr_auto_auto] items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted"
                      >
                        <span className="font-mono text-muted-foreground">#{row.no}</span>
                        <span>{formatDate(row.due_date)}</span>
                        <span>{formatCurrency(row.amount)}</span>
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Checkbox
                            checked={legacyNos.includes(row.no)}
                            onChange={() =>
                              setLegacyNos((current) =>
                                current.includes(row.no)
                                  ? current.filter((no) => no !== row.no)
                                  : [...current, row.no],
                              )
                            }
                            aria-label={`القسط ${row.no} مدفوع في الدفتر القديم`}
                          />
                          دفتر قديم
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {isManual && manualLegacySum > 0 ? (
                <p className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-[11px] text-warning">
                  {manualRows.filter((row) => row.legacy).length} قسط معلّم كقديم ({formatCurrency(manualLegacySum)}) —
                  هيتسجلوا «مدفوع» بدون أي حركة خزنة أو قيد.
                </p>
              ) : null}

              {vehicleTotal > 0 && (isManual ? financed > 0 : safeCount > 0) ? (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {isManual ? (
                    <>
                      سعر المركبات: <strong>{formatCurrency(vehicleTotal)}</strong> — المقدم:{' '}
                      <strong>{formatCurrency(downAmount)}</strong> — الممول:{' '}
                      <strong>{formatCurrency(Math.max(financed, 0))}</strong> على {manualRows.length} قسط —
                      الإجمالي: <strong>{formatCurrency(total)}</strong>.
                    </>
                  ) : (
                    <>
                      تكلفة القسط في الدورية: <strong>{formatCurrency(vehicleTotal)}</strong> — الممول:{' '}
                      <strong>{formatCurrency(financed)}</strong> على {installmentCount} قسط — الإجمالي:{' '}
                      <strong>{formatCurrency(total)}</strong>.
                    </>
                  )}
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
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
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
