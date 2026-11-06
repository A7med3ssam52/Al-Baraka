import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
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
import { fetchInstallments } from '@/features/installments/api'
import {
  installmentStatusLabels,
  resolveInstallmentStatus,
  type InstallmentRow,
} from '@/features/installments/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Receipt, FileText, CreditCard, Wallet, BookOpen } from 'lucide-react'

type Props = { customerId: string }

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

export function SalesPanel({ customerId }: Props) {
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('sales_invoices')
      .select('id, number, invoice_date, sale_type, total, paid_amount, remaining_amount, payment_method, status')
      .eq('customer_id', customerId)
      .order('invoice_date', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!active) return
        if (error) toast.error('تعذر تحميل الفواتير')
        setRows((data ?? []) as unknown as InvoiceRow[])
        setLoading(false)
      })
    return () => { active = false }
  }, [customerId])

  return (
    <Card className="p-4">
      {loading ? <Skeleton className="h-32 w-full" /> : rows.length === 0 ? (
        <EmptyState icon={Receipt} title="لا توجد فواتير" description="لم يصدر لهذا العميل أي فواتير بيع بعد." />
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
                <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}

export function ContractsPanel({ customerId }: Props) {
  const [rows, setRows] = useState<ContractRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('contracts')
      .select('id, number, contract_date, total_amount, down_payment, financed_amount, installment_count, frequency, status')
      .eq('customer_id', customerId)
      .order('contract_date', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!active) return
        if (error) toast.error('تعذر تحميل العقود')
        setRows((data ?? []) as unknown as ContractRow[])
        setLoading(false)
      })
    return () => { active = false }
  }, [customerId])

  return (
    <Card className="p-4">
      {loading ? <Skeleton className="h-32 w-full" /> : rows.length === 0 ? (
        <EmptyState icon={FileText} title="لا توجد عقود" description="لم يبرم هذا العميل عقود تقسيط بعد." />
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
                <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}

export function InstallmentsPanel({ customerId }: Props) {
  const [rows, setRows] = useState<InstallmentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetchInstallments({})
      .then((all) => {
        if (!active) return
        setRows(all.filter((r) => r.customer_id === customerId))
        setLoading(false)
      })
      .catch(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [customerId])

  return (
    <Card className="p-4">
      {loading ? <Skeleton className="h-32 w-full" /> : rows.length === 0 ? (
        <EmptyState icon={CreditCard} title="لا توجد أقساط" description="لا يوجد جدول أقساط لهذا العميل." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
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
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.contract_number}</TableCell>
                <TableCell>{r.installment_no}</TableCell>
                <TableCell>{formatDate(r.due_date)}</TableCell>
                <TableCell>{formatCurrency(r.amount)}</TableCell>
                <TableCell>{formatCurrency(r.paid_amount)}</TableCell>
                <TableCell>{formatCurrency(r.remaining_amount)}</TableCell>
                <TableCell><Badge variant="outline">{installmentStatusLabels[resolveInstallmentStatus(r)]}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}

export function PaymentsPanel({ customerId }: Props) {
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
    return () => { active = false }
  }, [customerId])

  const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0)

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold">إجمالي المدفوع: {formatCurrency(total)}</h3>
      </div>
      {loading ? <Skeleton className="h-32 w-full" /> : rows.length === 0 ? (
        <EmptyState icon={Wallet} title="لا توجد مدفوعات" description="لم يتم تسجيل أي مدفوعات لهذا العميل." />
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

export function StatementPanel({ customerId }: Props) {
  const [rows, setRows] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('customer_transactions')
      .select('id, transaction_date, transaction_type, amount, notes')
      .eq('customer_id', customerId)
      .order('transaction_date', { ascending: true })
      .limit(200)
      .then(({ data, error }) => {
        if (!active) return
        if (error) toast.error('تعذر تحميل كشف الحساب')
        setRows((data ?? []) as unknown as TransactionRow[])
        setLoading(false)
      })
    return () => { active = false }
  }, [customerId])

  let balance = 0
  const withBalance = rows.map((r) => {
    balance += r.amount ?? 0
    return { ...r, balance }
  })

  return (
    <Card className="p-4">
      {loading ? <Skeleton className="h-32 w-full" /> : rows.length === 0 ? (
        <EmptyState icon={BookOpen} title="لا توجد حركات" description="لا يوجد كشف حساب لهذا العميل بعد." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>التاريخ</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>المبلغ</TableHead>
              <TableHead>الرصيد</TableHead>
              <TableHead>ملاحظات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {withBalance.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{formatDate(r.transaction_date)}</TableCell>
                <TableCell>{r.transaction_type}</TableCell>
                <TableCell>{formatCurrency(r.amount)}</TableCell>
                <TableCell>{formatCurrency(r.balance)}</TableCell>
                <TableCell>{r.notes ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
