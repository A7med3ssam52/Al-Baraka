import { supabase } from '@/lib/supabase'
import { isFriendlyArabicMessage } from '@/lib/friendly-error'

import type {
  PurchaseInvoiceDetail,
  PurchaseInvoiceInput,
  PurchaseInvoicePrint,
  PurchaseInvoiceRecord,
  PurchasePaymentMethod,
  PurchaseStatus,
} from './types'

const errorMessages: Record<string, string> = {
  forbidden: 'لا تملك الصلاحية لتنفيذ هذه العملية.',
  not_authenticated: 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.',
  invalid_branch: 'الفرع غير موجود أو غير نشط.',
  supplier_missing: 'المورد غير موجود أو غير نشط.',
  invalid_invoice_items: 'أضف صنفًا واحدًا على الأقل (حتى 50 صنفًا).',
  invalid_invoice_item_target: 'كل سطر يجب أن يكون منتجًا أو مركبة واحدة فقط.',
  invalid_invoice_item_numbers: 'كمية أو سعر السطر غير صحيح.',
  invalid_invoice_numbers: 'قيم الفاتورة غير صحيحة (خصم/مدفوع سالب أو يتجاوز الإجمالي).',
  invalid_invoice_discount: 'الخصم أكبر من إجمالي الأصناف.',
  invalid_payment_method: 'طريقة السداد لا تناسب المبلغ المدفوع.',
  cashbox_missing: 'لا توجد خزنة نشطة لهذا الفرع.',
  bank_account_missing: 'لا يوجد حساب بنكي نشط لهذا الفرع.',
  invoice_missing: 'الفاتورة غير موجودة أو خارج نطاق فرعك.',
  invoice_locked: 'الفاتورة ملغاة بالفعل ولا يمكن إلغاؤها مرة أخرى.',
  invoice_not_draft: 'لا يمكن تعديل الفاتورة بعد اعتمادها أو إلغائها.',
  vehicle_unavailable: 'المركبة غير متاحة للشراء (مباعة أو مؤرشفة).',
  document_mismatch: 'المستند المرفق لا يخص مورد هذه الفاتورة.',
  product_missing: 'المنتج غير موجود.',
  supplier_inactive: 'المورد غير نشط. أعد تنشيطه قبل الاعتماد.',
  journal_account_missing: 'الحسابات المحاسبية الأساسية غير مهيأة.',
  payment_source_missing: 'لا يوجد مصدر سداد صالح لهذه الفاتورة.',
  insufficient_cashbox_balance: 'رصيد الخزنة لا يكفي لسداد هذه الفاتورة.',
}

export function translatePurchaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()

  if (isFriendlyArabicMessage(key)) return key

  if (errorMessages[key]) return errorMessages[key]

  return 'تعذر إكمال العملية. تحقق من الاتصال وحاول مرة أخرى.'
}

export async function fetchPurchaseInvoices(options?: {
  status?: PurchaseStatus | 'all'
  supplierId?: string
  search?: string
}): Promise<PurchaseInvoiceRecord[]> {
  const { data, error } = await supabase.rpc('list_purchase_invoices', {
    p_status: options?.status ?? 'all',
    p_supplier_id: options?.supplierId ?? null,
    p_search: options?.search?.trim() || null,
  })

  if (error) throw new Error(translatePurchaseError(error.message))

  return (data ?? []) as unknown as PurchaseInvoiceRecord[]
}

export async function fetchPurchaseInvoice(invoiceId: string): Promise<PurchaseInvoiceDetail> {
  const { data, error } = await supabase.rpc('get_purchase_invoice', {
    p_invoice_id: invoiceId,
  })

  if (error) throw new Error(translatePurchaseError(error.message))

  return data as unknown as PurchaseInvoiceDetail
}

export async function fetchPurchaseInvoicePrint(invoiceId: string): Promise<PurchaseInvoicePrint> {
  const { data, error } = await supabase.rpc('get_purchase_invoice_print', {
    p_invoice_id: invoiceId,
  })

  if (error) throw new Error(translatePurchaseError(error.message))

  return data as unknown as PurchaseInvoicePrint
}

export async function savePurchaseInvoice(
  input: PurchaseInvoiceInput,
  invoiceId?: string,
): Promise<PurchaseInvoiceRecord> {
  const { data, error } = await supabase.rpc('save_purchase_invoice', {
    p_supplier_id: input.supplier_id,
    p_items: input.items,
    p_invoice_id: invoiceId ?? null,
    p_invoice_date: input.invoice_date,
    p_discount: input.discount,
    p_transport_cost: input.transport_cost,
    p_prep_cost: input.prep_cost,
    p_payment_method: input.payment_method as PurchasePaymentMethod,
    p_paid_amount: input.paid_amount,
    p_notes: input.notes ?? null,
    p_supplier_reference: input.supplier_reference ?? null,
  })

  if (error) throw new Error(translatePurchaseError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as PurchaseInvoiceRecord
}

export async function approvePurchaseInvoice(invoiceId: string) {
  const { data, error } = await supabase.rpc('approve_purchase_invoice', {
    p_invoice_id: invoiceId,
  })

  if (error) throw new Error(translatePurchaseError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as PurchaseInvoiceRecord
}

export async function cancelPurchaseInvoice(invoiceId: string, reason?: string) {
  const { data, error } = await supabase.rpc('cancel_purchase_invoice', {
    p_invoice_id: invoiceId,
    p_reason: reason ?? null,
  })

  if (error) throw new Error(translatePurchaseError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as PurchaseInvoiceRecord
}

export async function cancelApprovedPurchaseInvoice(invoiceId: string, reason?: string) {
  const { data, error } = await supabase.rpc('cancel_approved_purchase_invoice', {
    p_invoice_id: invoiceId,
    p_reason: reason ?? null,
  })

  if (error) throw new Error(translatePurchaseError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as PurchaseInvoiceRecord
}
