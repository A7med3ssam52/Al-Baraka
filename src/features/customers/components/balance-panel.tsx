import { Loader2, Plus, RefreshCw, TriangleAlert, Wallet } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/use-auth'
import { formatCurrency, formatDate } from '@/lib/utils'

import {
  addCustomerBalance,
  applyCustomerBalance,
  fetchCustomer,
  listCustomerBalanceTransactions,
  translateCustomerError,
} from '../api'
import type { CustomerBalanceTransaction } from '../types'

export function CustomerBalancePanel({
  customerId,
  customerCode,
  reloadKey,
  onBalanceChanged,
}: {
  customerId: string
  customerCode: string
  reloadKey?: number
  onBalanceChanged?: () => void
}) {
  const { hasPermission } = useAuth()
  const canCollect = hasPermission('installments.collect')
  const [balance, setBalance] = useState<number | null>(null)
  const [rows, setRows] = useState<CustomerBalanceTransaction[] | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [applying, setApplying] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [customer, txs] = await Promise.all([
        fetchCustomer(customerId),
        listCustomerBalanceTransactions(customerId),
      ])
      setBalance(Number(customer.credit_balance ?? 0))
      setRows(txs)
    } catch (loadError) {
      setError(translateCustomerError(loadError))
    }
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load, reloadKey])

  async function handleApply() {
    setApplying(true)
    try {
      const result = await applyCustomerBalance(customerId)
      if (result.applied_amount > 0) {
        toast.success(
          `تم خصم ${formatCurrency(result.applied_amount)} من الرصيد على ${result.paid_count} قسط.`,
        )
      } else {
        toast.info('لا توجد أقساط جديدة لخصمها من الرصيد.')
      }
      await load()
      onBalanceChanged?.()
    } catch (applyError) {
      toast.error(translateCustomerError(applyError))
    } finally {
      setApplying(false)
    }
  }

  const loading = balance === null || rows === undefined

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-bold text-muted-foreground">الرصيد المتاح للعميل {customerCode}</p>
          <p className="mt-1 text-2xl font-extrabold">{loading ? '…' : formatCurrency(balance ?? 0)}</p>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            رصيد مدفوع مقدمًا — الخصم يتم تلقائيًا: عند إضافة رصيد، وعند تفعيل جدول
            أقساط جديد، ويخصم من الأقساط القادمة الأقدم استحقاقًا أولًا من غير تحريك كاش جديد.
          </p>
        </div>
        {canCollect ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleApply} disabled={applying || loading}>
              {applying ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              خصم تلقائي الآن
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" /> إضافة رصيد
            </Button>
          </div>
        ) : null}
      </Card>

      {error ? (
        <Card className="p-4 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-4" />
            {error}
          </div>
        </Card>
      ) : loading ? (
        <Card className="p-4">
          <Skeleton className="h-32 w-full" />
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Wallet}
            title="لا حركات رصيد بعد"
            description="أضف رصيدًا وسُيخصم تلقائيًا من الأقساط القادمة."
          />
        </Card>
      ) : (
        <Card className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>التاريخ</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>ملاحظة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDate(row.transaction_date)}</TableCell>
                  <TableCell>
                    <Badge variant={row.transaction_type === 'top_up' ? 'success' : 'warning'}>
                      {row.transaction_type === 'top_up' ? 'إضافة رصيد' : 'خصم تلقائي (قسط)'}
                    </Badge>
                  </TableCell>
                  <TableCell className={row.amount >= 0 ? 'font-bold text-success' : 'font-bold text-destructive'}>
                    {formatCurrency(row.amount)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.notes ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <AddBalanceDialog
        open={dialogOpen}
        customerId={customerId}
        currentBalance={balance ?? 0}
        onOpenChange={setDialogOpen}
        onSaved={async () => {
          await load()
          onBalanceChanged?.()
        }}
      />
    </div>
  )
}

export function AddBalanceDialog({
  open,
  customerId,
  currentBalance,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  customerId: string
  currentBalance: number
  onOpenChange: (open: boolean) => void
  onSaved: () => void | Promise<void>
}) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'cash' | 'bank'>('cash')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setAmount('')
    setMethod('cash')
    setDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setFormError(null)
  }, [open])

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setFormError('أدخل مبلغًا صحيحًا أكبر من صفر.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const result = await addCustomerBalance({
        customerId,
        amount: value,
        paymentMethod: method,
        paymentDate: date,
        notes: notes.trim() || null,
      })
      onOpenChange(false)
      if (result.applied_amount > 0) {
        toast.success(
          `أضفت ${formatCurrency(result.amount)} وخصم النظام تلقائيًا ${formatCurrency(result.applied_amount)} على ${result.applied_count} قسط. المتبقي: ${formatCurrency(result.remaining_balance)}.`,
        )
      } else {
        toast.success(`تمت إضافة ${formatCurrency(result.amount)} للرصيد.`)
      }
      await onSaved()
    } catch (submitError) {
      setFormError(translateCustomerError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>إضافة رصيد للعميل</DialogTitle>
          <DialogDescription>
            الرصيد الحالي: {formatCurrency(currentBalance)}. المبلغ يدخل الخزنة/البنك،
            ويخصم تلقائيًا من الأقساط القادمة الأقدم استحقاقًا أولًا.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">المبلغ *</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">طريقة الدفع</span>
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value as 'cash' | 'bank')}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="cash">نقدًا (إلى الخزنة)</option>
              <option value="bank">تحويل بنكي</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">التاريخ</span>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">ملاحظة</span>
            <Input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="اختياري — مثل: دفعة مقدمة للأقساط"
            />
          </label>
          {formError ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{formError}</span>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              إضافة وخصم تلقائي
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
