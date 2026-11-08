import { supabase } from '@/lib/supabase'
import { isFriendlyArabicMessage } from '@/lib/friendly-error'

import type {
  CustomerBalanceTransaction,
  CustomerDuplicates,
  CustomerInput,
  CustomerNote,
  CustomerRecord,
  CustomerStatus,
} from './types'

const errorMessages: Record<string, string> = {
  forbidden: 'لا تملك الصلاحية لتنفيذ هذه العملية.',
  not_authenticated: 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.',
  branch_required: 'اختر فرعًا أولًا.',
  invalid_branch: 'الفرع غير موجود أو غير نشط.',
  invalid_customer_name: 'اسم العميل يجب أن يكون 3 أحرف على الأقل.',
  invalid_national_id: 'الرقم القومي يجب أن يكون 14 رقمًا صحيحًا وفق الصيغة المصرية.',
  invalid_mobile: 'رقم الموبايل يجب أن يكون رقمًا مصريًا صحيحًا (010/011/012/015).',
  invalid_status: 'حالة العميل غير معروفة.',
  duplicate_national_id: 'يوجد عميل آخر بنفس الرقم القومي.',
  duplicate_customer_code: 'يوجد عميل آخر بنفس الكود.',
  invalid_customer_code: 'كود العميل غير صالح (أحرف/أرقام/شرطة، 1-20).',
  customer_missing: 'العميل غير موجود.',
  customer_archived: 'العميل مؤرشف ولا يمكن تعديله. فعّله أولًا.',
  customer_delete_forbidden: 'لا يمكن حذف العميل. استخدم الأرشفة بدلًا من الحذف.',
  has_history: 'لا يمكن الحذف — لهذا السجل تاريخ مرتبط (عقود أو فواتير أو مدفوعات). استخدم الأرشفة بدلًا منه.',
  has_payments: 'توجد مدفوعات مرتبطة — لا يمكن الحذف.',
  installment_locked: 'القسط مدفوع أو مسوّى ولا يمكن تعديله.',
  contract_has_payments: 'توجد تحصيلات على هذا العقد — لا يمكن تعديله أو إلغاؤه. استخدم الإعفاء أو إعادة الجدولة.',
  contract_locked: 'العقد ملغى أو لا يمكن تعديله في حالته الحالية.',
  expense_missing: 'المصروف غير موجود.',
  expense_archived: 'المصروف ملغى ولا يمكن تعديله.',
  note_missing: 'الملاحظة غير موجودة.',
  guarantor_missing: 'الضامن غير موجود.',
  invalid_title: 'العنوان مطلوب (حرفان على الأقل).',
  invalid_amount: 'أدخل مبلغًا صحيحًا أكبر من صفر.',
  invoice_locked: 'لا يمكن تعديل الفاتورة بعد اعتمادها أو إلغائها.',
  invalid_payment_method: 'طريقة الدفع غير مدعومة (نقدًا أو تحويل بنكي).',
  payment_source_missing: 'لا يوجد خزنة أو حساب بنكي نشط لهذا الفرع.',
  journal_account_missing: 'الحسابات غير جاهزة. أبلغ المسؤول.',
  unknown_code_entity: 'وحدة ترميز غير معروفة.',
}

export function translateCustomerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()

  if (isFriendlyArabicMessage(key)) return key

  if (errorMessages[key]) return errorMessages[key]

  if (key.toLowerCase().includes('duplicate key') && key.includes('national_id')) {
    return 'يوجد عميل آخر بنفس الرقم القومي.'
  }

  if (key.toLowerCase().includes('permission denied')) {
    return 'لا تملك الصلاحية لتنفيذ هذه العملية.'
  }

  return 'تعذر إكمال العملية. تحقق من الاتصال وحاول مرة أخرى.'
}

export async function fetchCustomers(options?: {
  status?: CustomerStatus | 'all'
  search?: string
}): Promise<CustomerRecord[]> {
  let query = supabase
    .from('customers')
    .select(
      'id, code, full_name, national_id, mobile, phone2, job, address, status, notes, branch_id, credit_balance, created_at',
    )
    .order('code')

  const status = options?.status ?? 'all'
  if (status !== 'all') query = query.eq('status', status)

  const search = options?.search?.trim()
  if (search) {
    const pattern = `%${search}%`
    query = query.or(
      `full_name.ilike.${pattern},code.ilike.${pattern},national_id.ilike.${pattern},mobile.ilike.%${search.replace(/\D/g, '')}%`,
    )
  }

  const { data, error } = await query

  if (error) throw new Error(translateCustomerError(error.message))

  return (data ?? []) as CustomerRecord[]
}

export async function fetchCustomer(customerId: string): Promise<CustomerRecord> {
  const { data, error } = await supabase.from('customers').select('*').eq('id', customerId).single()

  if (error) throw new Error(translateCustomerError(error.message))

  return data as CustomerRecord
}

export async function checkCustomerDuplicates(
  nationalId: string,
  mobile: string,
  excludeId?: string,
): Promise<CustomerDuplicates> {
  const { data, error } = await supabase.rpc('check_customer_duplicates', {
    p_national_id: nationalId,
    p_mobile: mobile,
    p_exclude_id: excludeId ?? null,
  })

  if (error) throw new Error(translateCustomerError(error.message))

  return (data ?? { national_id: null, mobiles: [] }) as unknown as CustomerDuplicates
}

export async function createCustomer(input: CustomerInput): Promise<CustomerRecord> {
  const { data, error } = await supabase.rpc('create_customer', {
    p_full_name: input.full_name,
    p_national_id: input.national_id,
    p_mobile: input.mobile,
    p_code: input.code ?? null,
    p_phone2: input.phone2 ?? null,
    p_job: input.job ?? null,
    p_address: input.address ?? null,
    p_notes: input.notes ?? null,
    p_branch_id: input.branch_id ?? null,
  })

  if (error) throw new Error(translateCustomerError(error.message))

  return data as unknown as CustomerRecord
}

export async function updateCustomer(
  customerId: string,
  input: Omit<CustomerInput, 'national_id' | 'branch_id'>,
): Promise<CustomerRecord> {
  const { data, error } = await supabase.rpc('update_customer', {
    p_customer_id: customerId,
    p_full_name: input.full_name,
    p_mobile: input.mobile,
    p_phone2: input.phone2 ?? null,
    p_job: input.job ?? null,
    p_address: input.address ?? null,
    p_notes: input.notes ?? null,
  })

  if (error) throw new Error(translateCustomerError(error.message))

  return data as unknown as CustomerRecord
}

export async function setCustomerStatus(
  customerId: string,
  status: CustomerStatus,
): Promise<CustomerRecord> {
  const { data, error } = await supabase.rpc('set_customer_status', {
    p_customer_id: customerId,
    p_status: status,
  })

  if (error) throw new Error(translateCustomerError(error.message))

  return data as unknown as CustomerRecord
}

const noteTypeMessages: Record<string, string> = {
  invalid_note: 'الملاحظة مطلوبة ولا تزيد عن 2000 حرف.',
  invalid_note_type: 'نوع المتابعة غير معروف.',
}

export async function fetchCustomerNotes(customerId: string, limit = 50): Promise<CustomerNote[]> {
  const { data, error } = await supabase.rpc('list_customer_notes', {
    p_customer_id: customerId,
    p_limit: limit,
  })

  if (error) {
    throw new Error(noteTypeMessages[error.message.trim()] ?? translateCustomerError(error.message))
  }

  return (data ?? []) as unknown as CustomerNote[]
}

export async function addCustomerNote(input: {
  customerId: string
  note: string
  noteType?: CustomerNote['note_type']
  nextFollowupAt?: string | null
}): Promise<CustomerNote> {
  const { data, error } = await supabase.rpc('add_customer_note', {
    p_customer_id: input.customerId,
    p_note: input.note,
    p_note_type: input.noteType ?? 'note',
    p_next_followup_at: input.nextFollowupAt ?? null,
  })

  if (error) {
    throw new Error(noteTypeMessages[error.message.trim()] ?? translateCustomerError(error.message))
  }

  return (Array.isArray(data) ? data[0] : data) as unknown as CustomerNote
}

export async function updateCustomerNote(input: {
  noteId: string
  note: string
  noteType?: CustomerNote['note_type']
  nextFollowupAt?: string | null
}): Promise<CustomerNote> {
  const { data, error } = await supabase.rpc('update_customer_note', {
    p_note_id: input.noteId,
    p_note: input.note,
    p_note_type: input.noteType ?? 'note',
    p_next_followup_at: input.nextFollowupAt ?? null,
  })

  if (error) {
    throw new Error(noteTypeMessages[error.message.trim()] ?? translateCustomerError(error.message))
  }

  return (Array.isArray(data) ? data[0] : data) as unknown as CustomerNote
}

export async function deleteCustomerNote(noteId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_customer_note', {
    p_note_id: noteId,
  })

  if (error) throw new Error(translateCustomerError(error.message))
}

const contactMessages: Record<string, string> = {
  invalid_contact_label: 'عنوان جهة الاتصال مطلوب ولا يزيد عن 50 حرفًا.',
  contact_missing: 'جهة الاتصال غير موجودة.',
}

function translateContactError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()
  if (contactMessages[key]) return contactMessages[key]
  return translateCustomerError(message)
}

export async function listCustomerContacts(customerId: string): Promise<unknown[]> {
  const { data, error } = await supabase.rpc('list_customer_contacts', {
    p_customer_id: customerId,
  })

  if (error) throw new Error(translateContactError(error.message))

  return data ?? []
}

export async function addCustomerContact(input: {
  customerId: string
  label: string
  mobile: string
  note?: string
}): Promise<unknown> {
  const { data, error } = await supabase.rpc('add_customer_contact', {
    p_customer_id: input.customerId,
    p_label: input.label,
    p_mobile: input.mobile,
    p_note: input.note || null,
  })

  if (error) throw new Error(translateContactError(error.message))

  return data
}

export async function deleteCustomerContact(contactId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_customer_contact', {
    p_contact_id: contactId,
  })

  if (error) throw new Error(translateContactError(error.message))
}

export async function updateCustomerContact(input: {
  contactId: string
  label: string
  mobile: string
  note?: string
}): Promise<unknown> {
  const { data, error } = await supabase.rpc('update_customer_contact', {
    p_contact_id: input.contactId,
    p_label: input.label,
    p_mobile: input.mobile,
    p_note: input.note || null,
  })

  if (error) throw new Error(translateContactError(error.message))

  return data
}

export async function deleteCustomer(customerId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_customer', {
    p_customer_id: customerId,
  })

  if (error) throw new Error(translateCustomerError(error.message))
}

const guarantorMessages: Record<string, string> = {
  invalid_guarantor_name: 'اسم الضامن يجب أن يكون 3 أحرف على الأقل.',
  duplicate_national_id: 'يوجد ضامن آخر بنفس الرقم القومي.',
}

function translateGuarantorError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()
  if (guarantorMessages[key]) return guarantorMessages[key]
  if (key.toLowerCase().includes('duplicate key') && key.includes('national_id')) {
    return 'يوجد ضامن آخر بنفس الرقم القومي.'
  }
  return translateCustomerError(message)
}

export async function listGuarantors(search?: string): Promise<unknown[]> {
  const { data, error } = await supabase.rpc('list_guarantors', {
    p_search: search?.trim() || null,
  })

  if (error) throw new Error(translateGuarantorError(error.message))

  return data ?? []
}

export async function listCustomerGuarantors(
  customerId: string,
  search?: string,
): Promise<unknown[]> {
  const { data, error } = await supabase.rpc('list_customer_guarantors', {
    p_customer_id: customerId,
    p_search: search?.trim() || null,
  })

  if (error) throw new Error(translateGuarantorError(error.message))

  return data ?? []
}

export async function addGuarantor(input: {
  full_name: string
  national_id: string
  mobile: string
  job?: string
  address?: string
  customerId?: string
}): Promise<unknown> {
  const { data, error } = await supabase.rpc('add_guarantor', {
    p_full_name: input.full_name,
    p_national_id: input.national_id,
    p_mobile: input.mobile,
    p_job: input.job || null,
    p_address: input.address || null,
    p_customer_id: input.customerId || null,
  })

  if (error) throw new Error(translateGuarantorError(error.message))

  return data
}

export async function updateGuarantor(input: {
  guarantorId: string
  full_name: string
  national_id: string
  mobile: string
  job?: string
  address?: string
}): Promise<unknown> {
  const { data, error } = await supabase.rpc('update_guarantor', {
    p_guarantor_id: input.guarantorId,
    p_full_name: input.full_name,
    p_national_id: input.national_id,
    p_mobile: input.mobile,
    p_job: input.job || null,
    p_address: input.address || null,
  })

  if (error) throw new Error(translateGuarantorError(error.message))

  return data
}

export async function deleteGuarantor(guarantorId: string, customerId?: string): Promise<unknown> {
  const { data, error } = await supabase.rpc('delete_guarantor', {
    p_guarantor_id: guarantorId,
    p_customer_id: customerId ?? null,
  })

  if (error) throw new Error(translateGuarantorError(error.message))

  return data
}

export async function listCustomerBalanceTransactions(
  customerId: string,
  limit = 100,
): Promise<CustomerBalanceTransaction[]> {
  const { data, error } = await supabase.rpc('list_customer_balance_transactions', {
    p_customer_id: customerId,
    p_limit: limit,
  })

  if (error) throw new Error(translateCustomerError(error.message))

  return (data ?? []) as unknown as CustomerBalanceTransaction[]
}

export async function addCustomerBalance(input: {
  customerId: string
  amount: number
  paymentMethod: 'cash' | 'bank'
  paymentDate: string
  notes?: string | null
}): Promise<{
  amount: number
  applied_amount: number
  applied_count: number
  remaining_balance: number
}> {
  const { data, error } = await supabase.rpc('add_customer_balance', {
    p_customer_id: input.customerId,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod,
    p_payment_date: input.paymentDate,
    p_notes: input.notes?.trim() || null,
  })

  if (error) throw new Error(translateCustomerError(error.message))

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  return {
    amount: Number(row?.amount ?? input.amount),
    applied_amount: Number(row?.applied_amount ?? 0),
    applied_count: Number(row?.applied_count ?? 0),
    remaining_balance: Number(row?.remaining_balance ?? 0),
  }
}

export async function applyCustomerBalance(customerId: string): Promise<{
  paid_count: number
  applied_amount: number
  remaining_balance: number
}> {
  const { data, error } = await supabase.rpc('apply_customer_balance', {
    p_customer_id: customerId,
    p_branch_id: null,
  })

  if (error) throw new Error(translateCustomerError(error.message))

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  return {
    paid_count: Number(row?.paid_count ?? 0),
    applied_amount: Number(row?.applied_amount ?? 0),
    remaining_balance: Number(row?.remaining_balance ?? 0),
  }
}
