import { ArrowRight, Printer, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchPurchaseInvoicePrint, translatePurchaseError } from '@/features/purchases/api'
import { purchasePaymentLabels, purchaseStatusLabels } from '@/features/purchases/types'
import type { PurchaseInvoicePrint } from '@/features/purchases/types'
import { formatCurrency, formatDate } from '@/lib/utils'

function money(value: number, currency: string) {
  return formatCurrency(value, currency)
}

export function PurchaseInvoicePrintPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const [payload, setPayload] = useState<PurchaseInvoicePrint | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!invoiceId) return
    fetchPurchaseInvoicePrint(invoiceId)
      .then((row) => {
        if (active) setPayload(row)
      })
      .catch((loadError) => {
        if (active) setError(translatePurchaseError(loadError))
      })
    return () => {
      active = false
    }
  }, [invoiceId])

  if (!invoiceId) {
    return <Card className="p-6 text-sm text-destructive">معرّف الفاتورة غير موجود في الرابط.</Card>
  }

  if (error) {
    return (
      <Card className="flex items-center gap-2 p-6 text-sm text-destructive">
        <TriangleAlert className="size-4" />
        {error}
      </Card>
    )
  }

  if (!payload) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    )
  }

  const { invoice, supplier, branch, settings, document, items } = payload
  const currency = settings.currency || 'EGP'
  const subtotal = items.reduce((sum, item) => sum + item.line_total, 0)

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={`فاتورة شراء ${invoice.number}`}
          description="معاينة للطباعة بترويسة المعرض — استخدم زر الطباعة ثم اختر الطابعة أو حفظ PDF."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link to="/inventory/purchases">
                  <ArrowRight className="size-4" /> المشتريات
                </Link>
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="size-4" /> طباعة
              </Button>
            </div>
          }
        />
      </div>

      <article className="print-sheet mx-auto w-full max-w-4xl rounded-xl border bg-white p-6 text-[#1f2937] shadow-sm sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#0b1f33] pb-4">
          <div>
            <h1 className="text-2xl font-extrabold text-[#0b1f33]">{settings.app_name}</h1>
            <p className="mt-1 text-xs text-[#5c6673]">
              {[settings.address, settings.phone, settings.email].filter(Boolean).join(' • ') ||
                'معرض البركة للدراجات والمركبات'}
            </p>
            {settings.tax_number ? (
              <p className="text-xs text-[#5c6673]">السجل الضريبي: {settings.tax_number}</p>
            ) : null}
          </div>
          <div className="text-left">
            <p className="text-lg font-extrabold">فاتورة شراء</p>
            <p className="font-mono text-sm">{invoice.number}</p>
            <p className="text-xs text-[#5c6673]">التاريخ: {formatDate(invoice.invoice_date)}</p>
            <p className="text-xs text-[#5c6673]">الحالة: {purchaseStatusLabels[invoice.status]}</p>
          </div>
        </header>

        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-[#e3dbc9] p-3">
            <h2 className="mb-2 text-xs font-extrabold text-[#8a6a1f]">بيانات المورد</h2>
            <p className="text-sm font-bold">{supplier.full_name}</p>
            <p className="text-xs text-[#5c6673]">الكود: {supplier.code}</p>
            <p className="text-xs text-[#5c6673]">الهاتف: {supplier.phone || '—'}</p>
            {supplier.tax_number ? (
              <p className="text-xs text-[#5c6673]">السجل الضريبي: {supplier.tax_number}</p>
            ) : null}
            {supplier.address ? (
              <p className="text-xs text-[#5c6673]">العنوان: {supplier.address}</p>
            ) : null}
          </div>
          <div className="rounded-lg border border-[#e3dbc9] p-3">
            <h2 className="mb-2 text-xs font-extrabold text-[#8a6a1f]">بيانات الفرع والفاتورة</h2>
            <p className="text-sm font-bold">
              {branch.name} ({branch.code})
            </p>
            {branch.address ? <p className="text-xs text-[#5c6673]">{branch.address}</p> : null}
            <p className="text-xs text-[#5c6673]">
              طريقة السداد: {purchasePaymentLabels[invoice.payment_method]}
            </p>
            {invoice.supplier_reference ? (
              <p className="text-xs text-[#5c6673]">مرجع المورد: {invoice.supplier_reference}</p>
            ) : null}
            {invoice.approved_at ? (
              <p className="text-xs text-[#5c6673]">
                تاريخ الاعتماد: {formatDate(invoice.approved_at)}
              </p>
            ) : null}
          </div>
        </section>

        <section className="mt-4 overflow-hidden rounded-lg border border-[#e3dbc9]">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#efe9dc] text-[#0b1f33]">
              <tr>
                <th className="px-2 py-2 font-bold">#</th>
                <th className="px-2 py-2 font-bold">الكود</th>
                <th className="px-2 py-2 font-bold">الصنف</th>
                <th className="px-2 py-2 font-bold">الكمية</th>
                <th className="px-2 py-2 font-bold">سعر الوحدة</th>
                <th className="px-2 py-2 font-bold">الخصم</th>
                <th className="px-2 py-2 font-bold">الإجمالي</th>
                <th className="px-2 py-2 font-bold">نقل</th>
                <th className="px-2 py-2 font-bold">تجهيز</th>
                <th className="px-2 py-2 font-bold">تكلفة الوحدة</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.line_no} className="border-t border-[#e3dbc9]">
                  <td className="px-2 py-2 font-mono">{item.line_no}</td>
                  <td className="px-2 py-2 font-mono">{item.code || '—'}</td>
                  <td className="px-2 py-2">{item.description || '—'}</td>
                  <td className="px-2 py-2">{item.quantity}</td>
                  <td className="px-2 py-2">{money(item.unit_price, currency)}</td>
                  <td className="px-2 py-2">{money(item.discount, currency)}</td>
                  <td className="px-2 py-2 font-semibold">{money(item.line_total, currency)}</td>
                  <td className="px-2 py-2">{money(item.allocated_transport, currency)}</td>
                  <td className="px-2 py-2">{money(item.allocated_prep, currency)}</td>
                  <td className="px-2 py-2 font-bold">{money(item.landed_unit_cost, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-[1fr_18rem]">
          <div className="rounded-lg border border-[#e3dbc9] p-3 text-xs">
            <h2 className="mb-1 font-extrabold text-[#8a6a1f]">توزيع التكاليف المباشرة</h2>
            <p className="text-[#5c6673]">
              تُوزَّع تكاليف النقل والتجهيز على البنود بنسبة قيمة كل بند، ويُضاف نصيب البند إلى
              تكلفة وحدته المعتمدة. آخر بند يستوعب فرق التقريب.
            </p>
            {document ? (
              <p className="mt-2">
                مرفق الفاتورة: <span className="font-mono">{document.doc_number}</span> —{' '}
                {document.title}
              </p>
            ) : (
              <p className="mt-2 text-[#5c6673]">لا يوجد مستند مرفق بهذه الفاتورة.</p>
            )}
          </div>
          <dl className="grid gap-1 rounded-lg border border-[#e3dbc9] p-3 text-xs">
            <div className="flex justify-between">
              <dt>إجمالي البنود</dt>
              <dd className="font-semibold">{money(subtotal, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>خصم الفاتورة</dt>
              <dd className="font-semibold">-{money(invoice.discount, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>نقل</dt>
              <dd className="font-semibold">{money(invoice.transport_cost, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>تجهيز</dt>
              <dd className="font-semibold">{money(invoice.prep_cost, currency)}</dd>
            </div>
            <div className="mt-1 flex justify-between border-t border-[#e3dbc9] pt-2 text-sm">
              <dt className="font-extrabold">الإجمالي</dt>
              <dd className="font-extrabold">{money(invoice.total, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>المدفوع</dt>
              <dd className="font-semibold">{money(invoice.paid_amount, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>المتبقي</dt>
              <dd className="font-bold text-[#b42318]">
                {money(invoice.total - invoice.paid_amount, currency)}
              </dd>
            </div>
          </dl>
        </section>

        {invoice.notes ? (
          <p className="mt-4 rounded-lg bg-[#f7f4ec] p-3 text-xs whitespace-pre-wrap">
            ملاحظات: {invoice.notes}
          </p>
        ) : null}

        <footer className="mt-8 grid gap-6 text-center text-xs sm:grid-cols-3">
          <div className="border-t border-dashed border-[#5c6673] pt-2">المورد</div>
          <div className="border-t border-dashed border-[#5c6673] pt-2">أمين المخزن</div>
          <div className="border-t border-dashed border-[#5c6673] pt-2">المدير</div>
        </footer>

        <p className="mt-6 text-center text-[10px] text-[#5c6673]">
          {settings.app_name} — {branch.name} • وُلِّدت من نظام إدارة معرض البركة
        </p>
      </article>
    </>
  )
}
