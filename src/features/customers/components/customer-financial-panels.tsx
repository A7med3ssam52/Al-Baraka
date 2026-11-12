import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  fetchInstallments,
  deleteInstallments,
  translateInstallmentError,
} from '@/features/installments/api'
import {
  canDeleteInstallment,
  installmentStatusLabels,
  resolveInstallmentStatus,
  type InstallmentRow,
} from '@/features/installments/types'
import { EditInstallmentDialog } from '@/features/installments/components/edit-installment-dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { useAuth } from '@/features/auth/use-auth'
import { Receipt, FileText, CreditCard, Wallet, Plus, Pencil, Trash2 } from 'lucide-react'

type Props = {
  customerId: string
  reloadKey?: number
  onAdd?: () => void
  /** يُستدعى بعد تعديل/حذف قسط حتى تتحدث بقية لوحات العميل (الرصيد/الكشف) */
  onChanged?: () => void
}

function AddHeader({
  title,
  onAdd,
  actions,
}: {
  title: string
  onAdd?: () => void
  actions?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-sm font-bold">{title}</h3>
      <div className="flex items-center gap-2">
        {actions}
        {onAdd ? (
          <Button size="sm" onClick={onAdd}>
            <Plus className="size-4" />
            إضافة جديد
          </Button>
        ) : null}
      </div>
    </div>
  )
}

type InvoiceRow = {
  id: string
  number: string
  invoice_date: string
  sale_type: string
  total: number
  paid_amount: number
  remaining_amount: number
  payment_method: string
  status: string
}

type ContractRow = {
  id: string
  number: string
  contract_date: string
  total_amount: number
  down_payment: number
  financed_amount: number
  installment_count: number
  frequency: string
  status: string
}

type PaymentRow = {
  id: string
  payment_date: string
  payment_type: string
  amount: number
  payment_method: string
  receipt_number: string | null
}

type TransactionRow = {
  id: string
  transaction_date: string
  transaction_type: string
  amount: number
  notes: string | null
}

export function SalesPanel({ customerId, reloadKey, onAdd }: Props) {
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('sales_invoices')
      .select(
        'id, number, invoice_date, sale_type, total, paid_amount, remaining_amount, payment_method, status',
      )
      .eq('customer_id', customerId)
      .order('invoice_date', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!active) return
        if (error) toast.error('تعذر تحميل الفواتير')
        setRows((data ?? []) as unknown as InvoiceRow[])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [customerId, reloadKey])

  return (
    <Card className="p-4">
      <AddHeader title="الفواتير" onAdd={onAdd} />
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="لا توجد فواتير"
          description="لم يصدر لهذا العميل أي فواتير بيع بعد."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>رقم الفاتورة</TableHead>
              <TableHead>التاريخ</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>الإجمالي</TableHead>
              <TableHead>المدفوع</TableHead>
              <TableHead>المتبقي</TableHead>
              <TableHead>الحالة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.number}</TableCell>
                <TableCell>{formatDate(r.invoice_date)}</TableCell>
                <TableCell>{r.sale_type === 'installment' ? 'تقسيط' : 'نقدي'}</TableCell>
                <TableCell>{formatCurrency(r.total)}</TableCell>
                <TableCell>{formatCurrency(r.paid_amount)}</TableCell>
                <TableCell>{formatCurrency(r.remaining_amount)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{r.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}

export function ContractsPanel({ customerId, reloadKey, onAdd }: Props) {
  const [rows, setRows] = useState<ContractRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('contracts')
      .select(
        'id, number, contract_date, total_amount, down_payment, financed_amount, installment_count, frequency, status',
      )
      .eq('customer_id', customerId)
      .order('contract_date', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!active) return
        if (error) toast.error('تعذر تحميل العقود')
        setRows((data ?? []) as unknown as ContractRow[])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [customerId, reloadKey])

  return (
    <Card className="p-4">
      <AddHeader title="العقود" onAdd={onAdd} />
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="لا توجد عقود"
          description="لم يبرم هذا العميل عقود تقسيط بعد."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ربم العقد</TableHead>
              <TableHead>التاريخ</TableHead>
              <TableHead>الإجمالي</TableHead>
              <TableHead>المقدم</TableHead>
              <TableHead>الممول</TableHead>
              <TableHead>عدد الأقساط</TableHead>
              <TableHead>الحالة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.number}</TableCell>
                <TableCell>{formatDate(r.contract_date)}</TableCell>
                <TableCell>{formatCurrency(r.total_amount)}</TableCell>
                <TableCell>{formatCurrency(r.down_payment)}</TableCell>
                <TableCell>{formatCurrency(r.financed_amount)}</TableCell>
                <TableCell>{r.installment_count}</TableCell>
                <TableCell>
                  <Badge variant="outline">{r.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}

export function InstallmentsPanel({ customerId, reloadKey, onAdd, onChanged }: Props) {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('installments.reschedule')
  const [rows, setRows] = useState<InstallmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [localKey, setLocalKey] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    let active = true
    fetchInstallments({ customerId })
      .then((mine) => {
        if (!active) return
        const deletable = new Set(mine.filter(canDeleteInstallment).map((row) => row.id))
        setSelected((current) => {
          const next = new Set([...current].filter((id) => deletable.has(id)))
          return next.size === current.size ? current : next
        })
        setRows(mine)
        setLoading(false)
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [customerId, reloadKey, localKey])

  const deletableIds = rows.filter(canDeleteInstallment).map((row) => row.id)
  const allSelected = deletableIds.length > 0 && deletableIds.every((id) => selected.has(id))
  const someSelected = deletableIds.some((id) => selected.has(id))
  const selectedRow =
    selected.size === 1 ? (rows.find((row) => row.id === [...selected][0]) ?? null) : null

  function toggleRow(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((current) => {
      if (allSelected) {
        const next = new Set(current)
        deletableIds.forEach((id) => next.delete(id))
        return next
      }
      return new Set([...current, ...deletableIds])
    })
  }

  function reloadAfterChange() {
    setLocalKey((key) => key + 1)
    onChanged?.()
  }

  async function handleDeleteConfirm(reason: string) {
    try {
      const result = await deleteInstallments({ installment_ids: [...selected], reason })
      const count = result.reduce((sum, row) => sum + Number(row.deleted_count), 0)
      const total = result.reduce((sum, row) => sum + Number(row.deleted_amount), 0)
      toast.success(
        `تم حذف ${count} قسطًا بقيمة ${formatCurrency(total)} وأُعيد احتساب إجمالي العقد.`,
      )
      setSelected(new Set())
      reloadAfterChange()
    } catch (deleteError) {
      throw new Error(translateInstallmentError(deleteError), { cause: deleteError })
    }
  }

  const selectionActions = canEdit ? (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={selected.size !== 1}
        onClick={() => setEditOpen(true)}
        title={selected.size === 1 ? 'تعديل القسط المحدد' : 'اختر قسطًا واحدًا فقط للتعديل'}
      >
        <Pencil className="size-4" />
        تعديل
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={selected.size === 0}
        onClick={() => setDeleteOpen(true)}
        title="حذف الأقساط غير المدفوعة المحددة دفعة واحدة"
      >
        <Trash2 className="size-4" />
        حذف{selected.size > 0 ? ` (${selected.size})` : ''}
      </Button>
    </>
  ) : null

  return (
    <Card className="p-4">
      <AddHeader title="الأقساط" onAdd={onAdd} actions={selectionActions} />
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="لا توجد أقساط"
          description="لا يوجد جدول أقساط لهذا العميل."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {canEdit ? (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="تحديد كل الأقساط القابلة للحذف"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allSelected
                    }}
                    onChange={toggleAll}
                    disabled={deletableIds.length === 0}
                  />
                </TableHead>
              ) : null}
              <TableHead>العقد</TableHead>
              <TableHead>القسط</TableHead>
              <TableHead>الاستحقاق</TableHead>
              <TableHead>المبلغ</TableHead>
              <TableHead>المدفوع</TableHead>
              <TableHead>المتبقي</TableHead>
              <TableHead>الحالة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const deletable = canDeleteInstallment(r)
              return (
                <TableRow key={r.id}>
                  {canEdit ? (
                    <TableCell>
                      <Checkbox
                        aria-label={`تحديد القسط #${r.installment_no}`}
                        checked={selected.has(r.id)}
                        disabled={!deletable}
                        onChange={() => toggleRow(r.id)}
                        title={deletable ? undefined : 'لا يمكن تحديده للحذف — عليه تحصيل أو مسوى'}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="font-mono text-xs">{r.contract_number}</TableCell>
                  <TableCell>{r.installment_no}</TableCell>
                  <TableCell>{formatDate(r.due_date)}</TableCell>
                  <TableCell>{formatCurrency(r.amount)}</TableCell>
                  <TableCell>{formatCurrency(r.paid_amount)}</TableCell>
                  <TableCell>{formatCurrency(r.remaining_amount)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {installmentStatusLabels[resolveInstallmentStatus(r)]}
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <EditInstallmentDialog
        open={editOpen}
        installment={selectedRow}
        onOpenChange={setEditOpen}
        onUpdated={() => {
          setEditOpen(false)
          setSelected(new Set())
          reloadAfterChange()
        }}
      />

      <ConfirmActionDialog
        open={deleteOpen}
        title="حذف الأقساط المحددة"
        description={`سيتم حذف ${selected.size} قسطًا غير مدفوع نهائيًا، وإنقاص إجمالي العقد (والممول) بقيمة هذه الأقساط، وإعادة توزيع المبلغ المتبقي على باقي الأقساط وتحديث رقمها بالتسلسل. التحصيل المسدد على أقساط أخرى لن يتأثر. العملية لا يمكن التراجع عنها.`}
        confirmLabel={`حذف ${selected.size > 0 ? selected.size : ''} قسطًا`}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDeleteConfirm}
      />
    </Card>
  )
}

export function PaymentsPanel({ customerId, reloadKey, onAdd }: Props) {
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('payments')
      .select('id, payment_date, payment_type, amount, payment_method, receipt_number')
      .eq('customer_id', customerId)
      .order('payment_date', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!active) return
        if (error) toast.error('تعذر تحميل المدفوعات')
        setRows((data ?? []) as unknown as PaymentRow[])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [customerId, reloadKey])

  const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0)

  return (
    <Card className="p-4">
      <AddHeader title={`المدفوعات (إجمالي: ${formatCurrency(total)})`} onAdd={onAdd} />
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="لا توجد مدفوعات"
          description="لم يتم تسجيل أي مدفوعات لهذا العميل."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>التاريخ</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>المبلغ</TableHead>
              <TableHead>الطريقة</TableHead>
              <TableHead>الإيصال</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{formatDate(r.payment_date)}</TableCell>
                <TableCell>{r.payment_type}</TableCell>
                <TableCell>{formatCurrency(r.amount)}</TableCell>
                <TableCell>{r.payment_method}</TableCell>
                <TableCell>{r.receipt_number ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}

type StatementProps = {
  customerId: string
  customerName: string
  customerCode: string
  nationalId?: string | null
  mobile?: string | null
  creditBalance?: number
  reloadKey?: number
  onAdd?: () => void
}

export function StatementPanel({
  customerId,
  customerName,
  customerCode,
  nationalId,
  mobile,
  creditBalance,
  reloadKey,
  onAdd,
}: StatementProps) {
  const [rows, setRows] = useState<TransactionRow[]>([])
  const [installments, setInstallments] = useState<InstallmentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([
      supabase
        .from('customer_transactions')
        .select('id, transaction_date, transaction_type, amount, notes')
        .eq('customer_id', customerId)
        .order('transaction_date', { ascending: true })
        .limit(200),
      fetchInstallments({ customerId }).catch(() => [] as InstallmentRow[]),
    ]).then(([txRes, mine]) => {
      if (!active) return
      if (txRes.error) toast.error('تعذر تحميل كشف الحساب')
      setRows((txRes.data ?? []) as unknown as TransactionRow[])
      setInstallments(mine as InstallmentRow[])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [customerId, reloadKey])

  const withBalance = rows.reduce<Array<TransactionRow & { balance: number }>>(
    (accumulator, transactionRow) => {
      const previous = accumulator.length > 0 ? accumulator[accumulator.length - 1].balance : 0
      accumulator.push({ ...transactionRow, balance: previous + (transactionRow.amount ?? 0) })
      return accumulator
    },
    [],
  )

  const totalAmount = installments.reduce((s, r) => s + (r.amount ?? 0), 0)
  const totalPaid = installments.reduce((s, r) => s + (r.paid_amount ?? 0), 0)
  const totalRemaining = installments.reduce((s, r) => s + (r.remaining_amount ?? 0), 0)

  if (loading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-64 w-full" />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <AddHeader title="كشف الحساب" onAdd={onAdd} />
      <article
        dir="rtl"
        style={{ fontFamily: "'Cairo', sans-serif" }}
        className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border bg-white text-[#1f2937] shadow-sm print:shadow-none"
      >
        {/* Top header */}
        <header className="relative overflow-hidden bg-[#0b1f33] px-4 pt-4 pb-3 text-white">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[#c8a24a]/40 to-transparent" />
          <div className="relative flex flex-col items-center gap-2 text-center sm:flex-row sm:items-start sm:justify-between sm:text-start">
            <div className="flex items-center gap-3">
              <img
                src="/logo.PNG"
                alt="معرض البركة للتجارة"
                className="h-20 w-20 shrink-0 rounded-full border-2 border-[#c8a24a] bg-black object-cover"
              />
              <div className="min-w-0">
                <p className="text-sm text-[#c8a24a]">معرض</p>
                <h1 className="text-3xl font-extrabold leading-none text-[#c8a24a]">البركة</h1>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">للتجارة</p>
                <p className="mt-2 inline-block rounded-full bg-[#c8a24a] px-3 py-1 text-[11px] font-bold text-[#0b1f33]">
                  تكاتك - موتوسيكلات - تروسيكلات - اسكوتر
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Title */}
        <div className="flex items-center gap-3 px-4 pt-4 sm:px-8">
          <span className="h-px flex-1 bg-[#c8a24a]" />
          <h2 className="whitespace-nowrap text-2xl font-extrabold text-[#0b1f33] sm:text-4xl">
            كشف حساب
          </h2>
          <span className="h-px flex-1 bg-[#c8a24a]" />
        </div>

        <div className="relative px-4 py-4 sm:px-8 sm:py-6">
          <img
            src="/logo.PNG"
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 m-auto h-64 w-64 opacity-[0.04]"
          />
          <div className="relative grid gap-2 rounded-xl border border-[#e3dbc9] bg-[#fffdf8] p-4 text-sm sm:grid-cols-2">
            <p>
              <span className="font-bold text-[#0b1f33]">الاسم :</span> {customerName}
            </p>
            <p>
              <span className="font-bold text-[#0b1f33]">الكود :</span>{' '}
              <span className="font-mono">{customerCode}</span>
            </p>
            <p>
              <span className="font-bold text-[#0b1f33]">الرقم القومي :</span> {nationalId ?? '—'}
            </p>
            <p>
              <span className="font-bold text-[#0b1f33]">الموبايل :</span>{' '}
              <span dir="ltr">{mobile ?? '—'}</span>
            </p>
            <p>
              <span className="font-bold text-[#0b1f33]">الرصيد المتاح :</span>{' '}
              {formatCurrency(creditBalance ?? 0)}
            </p>
            <p>
              <span className="font-bold text-[#0b1f33]">التاريخ :</span>{' '}
              {formatDate(new Date().toISOString().slice(0, 10))}
            </p>
          </div>

          <h3 className="mt-6 mb-2 font-extrabold text-[#0b1f33]">الأقساط</h3>
          {installments.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-[#fffdf8] p-6 text-center text-sm text-muted-foreground">
              لا توجد أقساط لهذا العميل.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[#e3dbc9]">
              <table className="w-full min-w-[640px] text-xs sm:text-sm">
                <thead className="bg-[#0b1f33] text-white">
                  <tr>
                    <th className="px-3 py-2 text-start font-bold">العقد</th>
                    <th className="px-3 py-2 text-start font-bold">القسط</th>
                    <th className="px-3 py-2 text-start font-bold">الاستحقاق</th>
                    <th className="px-3 py-2 text-start font-bold">المبلغ</th>
                    <th className="px-3 py-2 text-start font-bold">المدفوع</th>
                    <th className="px-3 py-2 text-start font-bold">المتبقي</th>
                    <th className="px-3 py-2 text-start font-bold">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {installments.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-[#e3dbc9] odd:bg-white even:bg-[#fffdf8]"
                    >
                      <td className="px-3 py-2 font-mono text-[11px]">{r.contract_number}</td>
                      <td className="px-3 py-2">{r.installment_no}</td>
                      <td className="px-3 py-2">{formatDate(r.due_date)}</td>
                      <td className="px-3 py-2">{formatCurrency(r.amount)}</td>
                      <td className="px-3 py-2">{formatCurrency(r.paid_amount)}</td>
                      <td className="px-3 py-2">{formatCurrency(r.remaining_amount)}</td>
                      <td className="px-3 py-2">
                        {installmentStatusLabels[resolveInstallmentStatus(r)]}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#efe9dc] font-bold">
                  <tr>
                    <td colSpan={3} className="px-3 py-2">
                      الإجمالي
                    </td>
                    <td className="px-3 py-2">{formatCurrency(totalAmount)}</td>
                    <td className="px-3 py-2">{formatCurrency(totalPaid)}</td>
                    <td className="px-3 py-2">{formatCurrency(totalRemaining)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {withBalance.length > 0 ? (
            <>
              <h3 className="mt-6 mb-2 font-extrabold text-[#0b1f33]">حركات الحساب</h3>
              <div className="overflow-x-auto rounded-lg border border-[#e3dbc9]">
                <table className="w-full min-w-[520px] text-xs sm:text-sm">
                  <thead className="bg-[#efe9dc]">
                    <tr>
                      <th className="px-3 py-2 text-start font-bold">التاريخ</th>
                      <th className="px-3 py-2 text-start font-bold">النوع</th>
                      <th className="px-3 py-2 text-start font-bold">المبلغ</th>
                      <th className="px-3 py-2 text-start font-bold">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withBalance.map((r) => (
                      <tr
                        key={r.id}
                        className="border-t border-[#e3dbc9] odd:bg-white even:bg-[#fffdf8]"
                      >
                        <td className="px-3 py-2">{formatDate(r.transaction_date)}</td>
                        <td className="px-3 py-2">{r.transaction_type}</td>
                        <td className="px-3 py-2">{formatCurrency(r.amount)}</td>
                        <td className="px-3 py-2">{formatCurrency(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          <p className="mt-8 text-end text-sm font-semibold italic text-[#0b1f33]">معرض البركة</p>
        </div>

        <footer className="relative bg-[#0b1f33] px-4 py-4 text-white sm:px-8">
          <div className="grid gap-4 text-xs sm:grid-cols-3 sm:text-sm">
            <div>
              <p className="mb-1 font-extrabold text-[#c8a24a]">محافظة الشرقية - مركز صان الحجر</p>
              <p>بجوار مركز الشرطة</p>
            </div>
            <div dir="ltr" className="text-end sm:text-start">
              <p className="font-bold text-[#c8a24a]">أ/ أحمد عبدالهادي</p>
              <p>01000172840</p>
              <p>01010559737</p>
            </div>
            <div dir="ltr" className="text-end sm:text-start">
              <p className="font-bold text-[#c8a24a]">أ/ حمدي أحمد</p>
              <p>01029908833</p>
              <p>01026532231</p>
            </div>
          </div>
        </footer>
      </article>
    </div>
  )
}
