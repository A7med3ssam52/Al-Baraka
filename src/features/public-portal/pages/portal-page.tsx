import { AlertTriangle, LogOut, Printer, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMobileDisplay } from '@/features/customers/types'
import { installmentStatusLabels } from '@/features/installments/types'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

import { lookupPortal } from '../api'
import { clearPortalSession, loadPortalSession } from '../types'
import type { PortalLookupKind, PortalSnapshot } from '../types'

type SessionState = { kind: PortalLookupKind; value: string }

export function PortalPage() {
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionState | null>(() => loadPortalSession())
  const [snapshot, setSnapshot] = useState<PortalSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) {
      navigate('/', { replace: true })
    }
  }, [session, navigate])

  useEffect(() => {
    let mounted = true
    if (!session) return
    lookupPortal(session)
      .then((data) => {
        if (!mounted) return
        if (!data.found || !data.customer) {
          setError('انتهت جلسة الاستعلام أو لم يتم العثور على الحساب. ابدأ من صفحة الاستعلام من جديد.')
          clearPortalSession()
          return
        }
        setSnapshot(data)
      })
      .catch((loadError) => {
        if (!mounted) return
        setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل الحساب. حاول مرة أخرى.')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [session])

  function handleExit() {
    clearPortalSession()
    setSnapshot(null)
    setSession(null)
    navigate('/', { replace: true })
  }

  function handleReload() {
    if (!session) return
    setLoading(true)
    setError(null)
    lookupPortal(session)
      .then((data) => {
        if (data.found && data.customer) setSnapshot(data)
        else {
          setError('لم يتم العثور على الحساب. ابدأ من صفحة الاستعلام من جديد.')
          clearPortalSession()
          setSession(null)
        }
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'تعذر التحميل.'))
      .finally(() => setLoading(false))
  }

  if (!session) {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center p-4">
        <Card className="max-w-md p-6 text-center">
          <p className="font-bold">جارٍ التوجيه إلى صفحة الاستعلام…</p>
          <p className="mt-2 text-sm text-muted-foreground">لم يتم العثور على جلسة استعلام صالحة.</p>
          <Button className="mt-4" onClick={() => navigate('/')}>الذهاب لصفحة الاستعلام</Button>
        </Card>
      </div>
    )
  }

  if (loading && !snapshot) {
    return (
      <div dir="rtl" className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="mt-6 h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (error || !snapshot?.customer) {
    return (
      <div dir="rtl" className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <Card className="p-6">
          <EmptyState
            icon={AlertTriangle}
            title="تعذر عرض الحساب"
            description={error ?? 'لا توجد بيانات لعرضها.'}
            action={<Button onClick={handleExit}>ابدأ استعلامًا جديدًا</Button>}
          />
        </Card>
      </div>
    )
  }

  const customer = snapshot.customer

  return (
    <div dir="rtl" className="min-h-screen">
      <header className="border-b bg-[#0b1f33] text-white">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3" aria-label="العودة للاستعلام">
            <img src="/logo.PNG" alt="معرض البركة للتجارة" className="h-12 w-12 rounded-full border-2 border-[#c8a24a] bg-black object-cover" />
            <span className="leading-tight">
              <span className="block text-xs text-[#c8a24a]">معرض البركة للتجارة — كشف الحساب</span>
              <span className="block text-lg font-extrabold">{customer.full_name}</span>
              <span className="block font-mono text-[11px] text-white/60">{customer.code}</span>
            </span>
          </Link>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReload} disabled={loading} aria-label="تحديث البيانات">
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} /> تحديث
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} aria-label="طباعة كشف الحساب">
              <Printer className="size-4" /> طباعة
            </Button>
            <Button variant="outline" size="sm" onClick={handleExit}>
              <LogOut className="size-4" /> استعلام جديد
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <StatementPanel snapshot={snapshot} />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          مصدر البيانات: نظام معرض البركة • <Link to="/" className="font-bold underline">العودة لصفحة الاستعلام</Link>
        </p>
      </main>
    </div>
  )
}

function StatementPanel({ snapshot }: { snapshot: PortalSnapshot }) {
  const customer = snapshot.customer!
  const installments = snapshot.installments
  const rows = snapshot.transactions
  // آخر تاريخ تحصيل لكل قسط (من سطور الدفتر: reference_type='installment').
  const collectionDateByInstallment = new Map<string, string>()
  for (const row of rows) {
    if (row.reference_type === 'installment' && row.reference_id) {
      collectionDateByInstallment.set(row.reference_id, row.transaction_date)
    }
  }
  const summary = snapshot.summary
  const withBalance = rows.reduce<Array<(typeof rows)[number] & { balance: number }>>(
    (accumulator, row) => {
      const previous = accumulator.length > 0 ? accumulator[accumulator.length - 1].balance : 0
      accumulator.push({ ...row, balance: previous + (row.amount ?? 0) })
      return accumulator
    },
    [],
  )
  const totalAmount = summary?.total_amount ?? installments.reduce((sum, row) => sum + row.amount, 0)
  const totalPaid = summary?.total_paid ?? installments.reduce((sum, row) => sum + row.paid_amount, 0)
  const totalRemaining = summary?.total_remaining ?? installments.reduce((sum, row) => sum + row.remaining_amount, 0)

  return (
    <div className="space-y-4">
      <article
        dir="rtl"
        style={{ fontFamily: "'Cairo', sans-serif" }}
        className="print-sheet relative mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border bg-white text-[#1f2937] shadow-sm print:shadow-none"
      >
        <header className="relative overflow-hidden bg-[#0b1f33] px-4 pt-4 pb-3 text-white">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[#c8a24a]/40 to-transparent" />
          <div className="relative flex flex-col items-center gap-2 text-center sm:flex-row sm:items-start sm:justify-between sm:text-start">
            <div className="flex items-center gap-3">
              <img src="/logo.PNG" alt="معرض البركة للتجارة" className="h-20 w-20 shrink-0 rounded-full border-2 border-[#c8a24a] bg-black object-cover" />
              <div className="min-w-0">
                <p className="text-sm text-[#c8a24a]">معرض</p>
                <h2 className="text-3xl font-extrabold leading-none text-[#c8a24a]">البركة</h2>
                <p className="mt-1 text-xs text-white/70 sm:text-sm">للتجارة</p>
                <p className="mt-2 inline-block rounded-full bg-[#c8a24a] px-3 py-1 text-[11px] font-bold text-[#0b1f33]">
                  تكاتك - موتوسيكلات - تروسيكلات - اسكوتر
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="flex items-center gap-3 px-4 pt-4 sm:px-8">
          <span className="h-px flex-1 bg-[#c8a24a]" />
          <h3 className="whitespace-nowrap text-2xl font-extrabold text-[#0b1f33] sm:text-4xl">كشف حساب</h3>
          <span className="h-px flex-1 bg-[#c8a24a]" />
        </div>

        <div className="relative px-4 py-4 sm:px-8 sm:py-6">
          <img src="/logo.PNG" alt="" aria-hidden className="pointer-events-none absolute inset-0 m-auto h-64 w-64 opacity-[0.04]" />
          <div className="relative grid gap-2 rounded-xl border border-[#e3dbc9] bg-[#fffdf8] p-4 text-sm sm:grid-cols-2">
            <p><span className="font-bold text-[#0b1f33]">الاسم :</span> {customer.full_name}</p>
            <p><span className="font-bold text-[#0b1f33]">الكود :</span> <span className="font-mono">{customer.code}</span></p>
            <p><span className="font-bold text-[#0b1f33]">الرقم القومي :</span> {customer.national_id}</p>
            <p><span className="font-bold text-[#0b1f33]">الموبايل :</span> <span dir="ltr">{formatMobileDisplay(customer.mobile)}</span></p>
            <p><span className="font-bold text-[#0b1f33]">الرصيد المتاح :</span> {formatCurrency(Number(customer.credit_balance ?? 0))}</p>
            <p>
              <span className="font-bold text-[#0b1f33]">التاريخ :</span> {formatDate(new Date().toISOString().slice(0, 10))}
              <span className="ms-3 text-xs text-muted-foreground">(عرض للاطلاع — لا يمكن التعديل من هنا)</span>
            </p>
          </div>

          <h4 className="mt-6 mb-2 font-extrabold text-[#0b1f33]">الأقساط</h4>
          {installments.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-[#fffdf8] p-6 text-center text-sm text-muted-foreground">
              لا توجد أقساط لهذا العميل.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[#e3dbc9]">
              <table className="w-full min-w-[720px] text-xs sm:text-sm">
                <thead className="bg-[#0b1f33] text-white">
                  <tr>
                    <th className="px-3 py-2 text-start font-bold">العقد</th>
                    <th className="px-3 py-2 text-start font-bold">القسط</th>
                    <th className="px-3 py-2 text-start font-bold">الاستحقاق</th>
                    <th className="px-3 py-2 text-start font-bold">تاريخ التحصيل</th>
                    <th className="px-3 py-2 text-start font-bold">المبلغ</th>
                    <th className="px-3 py-2 text-start font-bold">المدفوع</th>
                    <th className="px-3 py-2 text-start font-bold">المتبقي</th>
                    <th className="px-3 py-2 text-start font-bold">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {installments.map((row) => (
                    <tr key={row.id} className="border-t border-[#e3dbc9] odd:bg-white even:bg-[#fffdf8]">
                      <td className="px-3 py-2 font-mono text-[11px]">{row.contract_number}</td>
                      <td className="px-3 py-2">{row.installment_no}</td>
                      <td className="px-3 py-2">{formatDate(row.due_date)}</td>
                      <td className="px-3 py-2">
                        {collectionDateByInstallment.get(row.id)
                          ? formatDate(collectionDateByInstallment.get(row.id) as string)
                          : '—'}
                      </td>
                      <td className="px-3 py-2">{formatCurrency(row.amount)}</td>
                      <td className="px-3 py-2">{formatCurrency(row.paid_amount)}</td>
                      <td className="px-3 py-2">{formatCurrency(row.remaining_amount)}</td>
                      <td className="px-3 py-2">{installmentStatusLabels[row.display_status]}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#efe9dc] font-bold">
                  <tr>
                    <td colSpan={4} className="px-3 py-2">الإجمالي</td>
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
              <h4 className="mt-6 mb-2 font-extrabold text-[#0b1f33]">حركات الحساب</h4>
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
                    {withBalance.map((row) => (
                      <tr key={row.id} className="border-t border-[#e3dbc9] odd:bg-white even:bg-[#fffdf8]">
                        <td className="px-3 py-2">{formatDate(row.transaction_date)}</td>
                        <td className="px-3 py-2">{row.transaction_type}</td>
                        <td className="px-3 py-2">{formatCurrency(row.amount)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.balance)}</td>
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
