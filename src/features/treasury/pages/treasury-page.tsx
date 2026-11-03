import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Wallet } from 'lucide-react'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/features/auth/use-auth'
import { createExpense, fetchExpenses } from '@/features/expenses/api'
import { expenseStatusLabels, type ExpenseStatus } from '@/features/expenses/types'
import { formatCurrency, formatDate } from '@/lib/utils'

import { fetchCashboxes, fetchCashTransactions } from '../api'
import {
  transactionTypeLabels,
  type CashTransactionRecord,
  type CashboxRecord,
} from '../types'

type ExpenseRow = {
  id: string
  category: string
  title: string
  amount: number
  expense_date: string
  status: ExpenseStatus
}

export function TreasuryPage() {
  const { appUser, hasPermission } = useAuth()
  const branches = appUser?.branches ?? []
  const defaultBranchId = branches.find((b) => b.isDefault)?.id ?? branches[0]?.id ?? ''

  const [cashboxes, setCashboxes] = useState<CashboxRecord[]>([])
  const [transactions, setTransactions] = useState<CashTransactionRecord[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [selectedCashbox, setSelectedCashbox] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  const canCreateExpense = hasPermission('expenses.create')
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [expenseForm, setExpenseForm] = useState({
    title: '',
    amount: '',
    category: 'general',
    cashboxId: '',
    notes: '',
  })
  const [savingExpense, setSavingExpense] = useState(false)

  useEffect(() => {
    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    Promise.all([
      fetchCashboxes(defaultBranchId || undefined),
      fetchCashTransactions({ limit: 100 }),
      fetchExpenses({ branchId: defaultBranchId || undefined }),
    ])
      .then(([boxes, txs, exps]) => {
        if (!active) return
        setCashboxes(boxes)
        setTransactions(txs)
        setExpenses(exps as unknown as ExpenseRow[])
      })
      .catch((e) => {
        if (active) toast.error(e instanceof Error ? e.message : 'تعذر تحميل بيانات الخزنة')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [defaultBranchId])

  const filteredTransactions =
    selectedCashbox === 'all'
      ? transactions
      : transactions.filter((t) => t.cashbox_id === selectedCashbox)

  const totalBalance = cashboxes.reduce((sum, c) => sum + (c.current_balance ?? 0), 0)
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0)

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!expenseForm.title.trim() || !expenseForm.amount) return
    setSavingExpense(true)
    try {
      await createExpense({
        branchId: defaultBranchId,
        title: expenseForm.title.trim(),
        category: expenseForm.category || 'general',
        amount: Number(expenseForm.amount),
        cashboxId: expenseForm.cashboxId || null,
        notes: expenseForm.notes,
      })
      toast.success('تم إضافة المصروف')
      setExpenseForm({ title: '', amount: '', category: 'general', cashboxId: '', notes: '' })
      setShowExpenseForm(false)
      setLoading(true)
      fetchExpenses({ branchId: defaultBranchId || undefined })
        .then((rows) => setExpenses(rows as unknown as ExpenseRow[]))
        .catch(() => undefined)
        .finally(() => setLoading(false))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر إضافة المصروف')
    } finally {
      setSavingExpense(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="الخزنة والمصروفات"
        description="أرصدة الخزائن وحركات القبض والصرف و المصروفات"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">إجمالي الأرصدة</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(totalBalance)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">عدد الخزائن</p>
          <p className="mt-1 text-xl font-bold">{cashboxes.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">عدد الحركات</p>
          <p className="mt-1 text-xl font-bold">{transactions.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">إجمالي المصروفات</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(totalExpenses)}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold">المصروفات</h2>
          {canCreateExpense && (
            <Button size="sm" onClick={() => setShowExpenseForm((v) => !v)}>
              {showExpenseForm ? (
                'إلغاء'
              ) : (
                <>
                  <Plus className="size-4" />
                  إضافة مصروف
                </>
              )}
            </Button>
          )}
        </div>

        {showExpenseForm && (
          <form onSubmit={handleCreateExpense} className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              placeholder="عنوان المصروف"
              value={expenseForm.title}
              onChange={(e) => setExpenseForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
            <Input
              placeholder="المبلغ"
              type="number"
              min="0.01"
              step="0.01"
              value={expenseForm.amount}
              onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
              required
            />
            <Input
              placeholder="التصنيف (مثال: إيجار، كهرباء)"
              value={expenseForm.category}
              onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))}
            />
            <Select
              value={expenseForm.cashboxId}
              onChange={(e) => setExpenseForm((f) => ({ ...f, cashboxId: e.target.value }))}
            >
              <option value="">بدون خزنة محددة</option>
              {cashboxes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_ar}
                </option>
              ))}
            </Select>
            <Input
              placeholder="ملاحظات"
              value={expenseForm.notes}
              onChange={(e) => setExpenseForm((f) => ({ ...f, notes: e.target.value }))}
            />
            <Button type="submit" disabled={savingExpense}>
              {savingExpense ? 'جارٍ الحفظ...' : 'حفظ المصروف'}
            </Button>
          </form>
        )}

        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : expenses.length === 0 ? (
          <EmptyState icon={Wallet} title="لا توجد مصروفات" description="لم يتم تسجيل أي مصروفات بعد." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>التاريخ</TableHead>
                <TableHead>العنوان</TableHead>
                <TableHead>التصنيف</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{formatDate(e.expense_date)}</TableCell>
                  <TableCell>{e.title}</TableCell>
                  <TableCell>{e.category}</TableCell>
                  <TableCell>{formatCurrency(e.amount)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{expenseStatusLabels[e.status] ?? e.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-bold">الخزائن</h2>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : cashboxes.length === 0 ? (
          <EmptyState icon={Wallet} title="لا توجد خزائن" description="لم يتم العثور على خزائن للفرع." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cashboxes.map((c) => (
              <div key={c.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{c.name_ar}</span>
                  {c.is_default && <Badge variant="secondary">افتراضية</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{c.code}</p>
                <p className="mt-2 text-lg font-bold">{formatCurrency(c.current_balance)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold">حركات الخزنة</h2>
          <Select
            value={selectedCashbox}
            onChange={(e) => setSelectedCashbox(e.target.value)}
            className="w-48"
          >
            <option value="all">كل الخزائن</option>
            {cashboxes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_ar}
              </option>
            ))}
          </Select>
        </div>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : filteredTransactions.length === 0 ? (
          <EmptyState icon={Wallet} title="لا توجد حركات" description="لا توجد حركات خزنة مسجلة." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>التاريخ</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>الوصف</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{formatDate(t.transaction_date)}</TableCell>
                  <TableCell>{transactionTypeLabels[t.transaction_type] ?? t.transaction_type}</TableCell>
                  <TableCell>{formatCurrency(t.amount)}</TableCell>
                  <TableCell>{t.description ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
