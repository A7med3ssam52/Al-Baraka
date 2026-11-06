import { AlertTriangle, CreditCard, FileText, LogOut, Lock, PhoneCall, Printer, RefreshCw, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell, TableFooter } from '@/components/ui/table'
import { customerStatusLabels, formatMobileDisplay } from '@/features/customers/types'
import { documentStatusLabels, documentTypeLabels } from '@/features/documents/types'
import { installmentStatusLabels, installmentStatusBadge } from '@/features/installments/types'
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils'

import { lookupPortal } from '../api'
import { clearPortalSession, loadPortalSession, portalTabs } from '../types'
import type { PortalLookupKind, PortalSnapshot, PortalTabId } from '../types'

type SessionState = { kind: PortalLookupKind; value: string }

export function PortalPage() {
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionState | null>(() => loadPortalSession())
  const [snapshot, setSnapshot] = useState<PortalSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<PortalTabId>('personal')

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
      <div dir="rtl" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="mt-6 h-10 w-full rounded-lg" />
        <Skeleton className="mt-4 h-64 w-full rounded-xl" />
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
  const summary = snapshot.summary

  return (
    <div dir="rtl" className="min-h-screen">
      <header className="border-b bg-[#0b1f33] text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3" aria-label="العودة للاستعلام">
            <img src="/logo.PNG" alt="معرض البركة للتجارة" className="h-12 w-12 rounded-full border-2 border-[#c8a24a] bg-black object-cover" />
            <span className="leading-tight">
              <span className="block text-xs text-[#c8a24a]">معرض البركة للتجارة — حساب العميل</span>
              <span className="block text-lg font-extrabold">{customer.full_name}</span>
              <span className="block font-mono text-[11px] text-white/60">{customer.code}</span>
            </span>
          </Link>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Badge variant="accent"><Lock className="size-3" /> عرض للقراءة فقط</Badge>
            <Button variant="outline" size="sm" onClick={handleReload} disabled={loading} aria-label="تحديث البيانات">
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} /> تحديث
            </Button>
            <Button variant="outline" size="sm" onClick={handleExit}>
              <LogOut className="size-4" /> استعلام جديد / خروج
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Summary */}
        {summary ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs font-bold text-muted-foreground">إجمالي المبلغ</p>
              <p className="mt-1 text-xl font-extrabold">{formatCurrency(summary.total_amount)}</p>
              <p className="text-[11px] text-muted-foreground">{summary.contract_count} عقد (النشط: {summary.active_contract_count})</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-bold text-muted-foreground">المدفوع</p>
              <p className="mt-1 text-xl font-extrabold text-success">{formatCurrency(summary.total_paid)}</p>
              <p className="text-[11px] text-muted-foreground">({summary.paid_count} قسط مدفوع)</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-bold text-muted-foreground">المتبقي</p>
              <p className="mt-1 text-xl font-extrabold">{formatCurrency(summary.total_remaining)}</p>
              <p className="text-[11px] text-muted-foreground">شامل المتأخر والمستحق</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-bold text-muted-foreground">متأخر الآن</p>
              <p className="mt-1 text-xl font-extrabold text-destructive">{formatCurrency(summary.overdue_amount)}</p>
              <p className="text-[11px] text-muted-foreground">{summary.overdue_count} قسط متأخر</p>
            </Card>
          </div>
        ) : null}

        <Card className="mt-4 p-4">
          <p className="text-xs leading-6 text-muted-foreground">
            هذه الصفحة معروضة للاطلاع فقط ولا يمكن تعديل أي بيان منها. عند وجود أي اختلاف
            في الأقساط أو على المستندات تواصل مع فرع صان الحجر مباشرة.
            {summary?.next_due_date ? (
              <span> القسط القادم: <strong className="text-foreground">{formatDate(summary.next_due_date)}</strong>
                {summary.next_due_amount != null ? ` بقيمة ${formatCurrency(summary.next_due_amount)}` : ''}.
              </span>
            ) : null}
          </p>
        </Card>

        {/* Menu */}
        <nav aria-label="أقسام حساب العميل" className="mt-4 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1 text-sm">
          {portalTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-md px-3 py-2 font-bold transition-colors',
                activeTab === tab.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Panels */}
        <div className="mt-4">
          {activeTab === 'personal' ? <PersonalPanel snapshot={snapshot} /> : null}
          {activeTab === 'notes' ? <NotesPanel snapshot={snapshot} /> : null}
          {activeTab === 'contacts' ? <ContactsPanel snapshot={snapshot} /> : null}
          {activeTab === 'guarantors' ? <GuarantorsPanel snapshot={snapshot} /> : null}
          {activeTab === 'installments' ? <InstallmentsPanel snapshot={snapshot} /> : null}
          {activeTab === 'documents' ? <DocumentsPanel snapshot={snapshot} /> : null}
          {activeTab === 'statement' ? <StatementPanel snapshot={snapshot} /> : null}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          مصدر البيانات: نظام معرض البركة — عرض للقراءة فقط • <Link to="/" className="font-bold underline">العودة لصفحة الاستعلام</Link>
        </p>
      </main>
    </div>
  )
}

function PersonalPanel({ snapshot }: { snapshot: PortalSnapshot }) {
  const customer = snapshot.customer!
  const statusLabel =
    customer.status === 'active' || customer.status === 'inactive' || customer.status === 'archived'
      ? customerStatusLabels[customer.status]
      : customer.status
  const rows: { label: string; value: string }[] = [
    { label: 'الاسم بالكامل', value: customer.full_name },
    { label: 'الكود', value: customer.code },
    { label: 'الرقم القومي', value: customer.national_id },
    { label: 'الموبايل', value: formatMobileDisplay(customer.mobile) },
    { label: 'هاتف إضافي', value: formatMobileDisplay(customer.phone2) },
    { label: 'المهنة', value: customer.job || '—' },
    { label: 'العنوان', value: customer.address || '—' },
    { label: 'الفرع', value: customer.branch_name || '—' },
    { label: 'الحالة', value: statusLabel },
    { label: 'ملاحظات', value: customer.notes || '—' },
    { label: 'أُضيف في', value: formatDateTime(customer.created_at) },
  ]
  return (
    <Card className="p-4">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-xs font-bold text-muted-foreground">{row.label}</dt>
            <dd className="mt-1 break-words font-semibold">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

const noteTypeLabels: Record<string, string> = {
  note: 'ملاحظة',
  call: 'اتصال',
  visit: 'زيارة',
  promise: 'وعد سداد',
}

function NotesPanel({ snapshot }: { snapshot: PortalSnapshot }) {
  const notes = snapshot.notes
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <h2 className="font-bold">سجل المتابعة</h2>
        <p className="text-xs text-muted-foreground">يعرض سجل المتابعة المسجل بالفرع للاطلاع فقط (لا يمكن الإضافة أو التعديل من هنا).</p>
      </Card>
      {notes.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={PhoneCall} title="لا ملاحظات بعد" description="لم تُسجل أي متابعة لهذا الحساب بعد." />
        </Card>
      ) : (
        <ol className="grid gap-2">
          {notes.map((note) => (
            <li key={note.id}>
              <Card className="gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{noteTypeLabels[note.note_type] ?? note.note_type}</Badge>
                  {note.next_followup_at ? (
                    <Badge variant="warning">متابعة: {formatDateTime(note.next_followup_at)}</Badge>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {note.created_by_name} • {formatDateTime(note.created_at)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6">{note.note}</p>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function ContactsPanel({ snapshot }: { snapshot: PortalSnapshot }) {
  const contacts = snapshot.contacts
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <h2 className="font-bold">جهات التواصل الإضافية</h2>
        <p className="text-xs text-muted-foreground">أرقام بديلة مسجلة للعميل (عمل / أسرة / إحالة) — للاطلاع فقط.</p>
      </Card>
      {contacts.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={PhoneCall} title="لا جهات اتصال إضافية" description="لم يتم تسجيل جهات تواصل إضافية لهذا العميل." />
        </Card>
      ) : (
        <ol className="grid gap-2">
          {contacts.map((contact) => (
            <li key={contact.id}>
              <Card className="p-4">
                <Badge variant="outline">{contact.label}</Badge>
                <p dir="ltr" className="mt-1 text-left font-mono text-sm">{formatMobileDisplay(contact.mobile)}</p>
                {contact.note ? <p className="text-xs text-muted-foreground">{contact.note}</p> : null}
                <p className="text-xs text-muted-foreground">{formatDateTime(contact.created_at)}</p>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function GuarantorsPanel({ snapshot }: { snapshot: PortalSnapshot }) {
  const guarantors = snapshot.guarantors
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <h2 className="font-bold">الضامنون المرتبطون بعقودك</h2>
        <p className="text-xs text-muted-foreground">الضامنون المربوطون فعليًا بعقودك النشطة — للاطلاع فقط.</p>
      </Card>
      {guarantors.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={UserRound} title="لا ضامنين مرتبطين" description="لم يتم ربط ضامنين بعقودك الحالية." />
        </Card>
      ) : (
        <ol className="grid gap-2">
          {guarantors.map((g) => (
            <li key={`${g.id}-${g.contract_number}`}>
              <Card className="gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{g.full_name}</span>
                  {g.job ? <Badge variant="outline">{g.job}</Badge> : null}
                  <Badge variant="secondary">عقد {g.contract_number}</Badge>
                </div>
                <p className="font-mono text-xs text-muted-foreground" dir="ltr">
                  {g.national_id} • {formatMobileDisplay(g.mobile)}
                </p>
                {g.address ? <p className="text-xs text-muted-foreground">{g.address}</p> : null}
                {g.role ? <p className="text-xs text-muted-foreground">دور: {g.role === 'co_signer' ? 'موقّع مساعد' : 'ضامن'}</p> : null}
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function InstallmentsPanel({ snapshot }: { snapshot: PortalSnapshot }) {
  const rows = snapshot.installments
  const summary = snapshot.summary
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <h2 className="font-bold">الأقساط</h2>
        <p className="text-xs text-muted-foreground">
          جدول الأقساط للعقود النشطة فقط. الحالة «متأخر / مدفوع جزئيًا» تُحسب تلقائيًا — لا يمكن التعديل من هنا.
        </p>
      </Card>
      {rows.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={CreditCard} title="لا توجد أقساط" description="لا يوجد جدول أقساط نشط لهذا العميل." />
        </Card>
      ) : (
        <Card className="p-4">
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
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.contract_number}</TableCell>
                  <TableCell>{row.installment_no}</TableCell>
                  <TableCell>{formatDate(row.due_date)}</TableCell>
                  <TableCell>{formatCurrency(row.amount)}</TableCell>
                  <TableCell>{formatCurrency(row.paid_amount)}</TableCell>
                  <TableCell>{formatCurrency(row.remaining_amount)}</TableCell>
                  <TableCell>
                    <Badge variant={installmentStatusBadge[row.display_status] ?? 'outline'}>
                      {installmentStatusLabels[row.display_status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {summary ? (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>الإجمالي</TableCell>
                  <TableCell>{formatCurrency(summary.total_amount)}</TableCell>
                  <TableCell>{formatCurrency(summary.total_paid)}</TableCell>
                  <TableCell>{formatCurrency(summary.total_remaining)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
        </Card>
      )}
    </div>
  )
}

function DocumentsPanel({ snapshot }: { snapshot: PortalSnapshot }) {
  const docs = snapshot.documents
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <h2 className="font-bold">المستندات المسجلة</h2>
        <p className="text-xs leading-6 text-muted-foreground">
          تُعرض بيانات المستندات فقط (الرقم والعنوان والتاريخ وعدد المرفقات). صور المستندات
          لا تُعرض هنا حمايةً لخصوصيتك — لطلب صورة مستند تواصل مع الفرع مباشرة.
        </p>
      </Card>
      {docs.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={FileText} title="لا مستندات مسجلة" description="لم يتم إرفاق مستندات بهذا الحساب." />
        </Card>
      ) : (
        <ol className="grid gap-3">
          {docs.map((doc) => (
            <li key={doc.id}>
              <Card className="gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{doc.doc_number}</span>
                  <Badge variant={doc.status === 'complete' ? 'success' : 'warning'}>
                    {documentStatusLabels[(doc.status as 'complete' | 'pending')] ?? doc.status}
                  </Badge>
                  <Badge variant="outline">
                    {documentTypeLabels[(doc.doc_type as keyof typeof documentTypeLabels)] ?? doc.doc_type}
                  </Badge>
                </div>
                <p className="font-bold">{doc.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(doc.created_at)} • المرفقات: {doc.file_count} ملف
                </p>
                {doc.notes ? <p className="text-xs text-muted-foreground">{doc.notes}</p> : null}
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function StatementPanel({ snapshot }: { snapshot: PortalSnapshot }) {
  const customer = snapshot.customer!
  const installments = snapshot.installments
  const rows = snapshot.transactions
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold">كشف الحساب</h2>
          <p className="text-xs text-muted-foreground">نسخة للاطلاع. اطبع هذه الصفحة للاحتفاظ بها.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> طباعة كشف الحساب
        </Button>
      </div>

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
            <p className="text-xs italic text-[#c8a24a]">اختيارك الأفضل ... طريقك أسهل</p>
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
            <p className="sm:col-span-2">
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
                  {installments.map((row) => (
                    <tr key={row.id} className="border-t border-[#e3dbc9] odd:bg-white even:bg-[#fffdf8]">
                      <td className="px-3 py-2 font-mono text-[11px]">{row.contract_number}</td>
                      <td className="px-3 py-2">{row.installment_no}</td>
                      <td className="px-3 py-2">{formatDate(row.due_date)}</td>
                      <td className="px-3 py-2">{formatCurrency(row.amount)}</td>
                      <td className="px-3 py-2">{formatCurrency(row.paid_amount)}</td>
                      <td className="px-3 py-2">{formatCurrency(row.remaining_amount)}</td>
                      <td className="px-3 py-2">{installmentStatusLabels[row.display_status]}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#efe9dc] font-bold">
                  <tr>
                    <td colSpan={3} className="px-3 py-2">الإجمالي</td>
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
