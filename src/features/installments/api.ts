import { supabase } from '@/lib/supabase'
import { isFriendlyArabicMessage } from '@/lib/friendly-error'
import { databaseErrorMessages, mapTechnicalMessage } from '@/lib/error-messages'

import type {
  CollectInstallmentInput,
  InstallmentComputedStatus,
  InstallmentFilters,
  InstallmentRow,
  InstallmentStoredStatus,
  RescheduleInstallmentInput,
  WaiveInstallmentInput,
} from './types'
import { resolveInstallmentStatus } from './types'
import { rpcOfflineAware } from '@/lib/offline'

const errorMessages: Record<string, string> = {
  forbidden: 'لا تملك الصلاحية لتنفيذ هذه العملية.',
  not_authenticated: 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.',
  installment_missing: 'القسط غير موجود أو تم حذفه.',
  installment_not_payable: 'هذا القسط مدفوع بالكامل أو مسوى بالفعل.',
  installment_already_paid: 'هذا القسط مدفوع بالكامل بالفعل.',
  installment_waived: 'هذا القسط مسوى ولا يمكن تحصيله.',
  installment_not_reschedulable: 'لا يمكن إعادة جدولة قسط مدفوع أو مسوى.',
  invalid_amount: 'أدخل مبلغًا صحيحًا أكبر من صفر.',
  invalid_payment_amount: 'أدخل مبلغًا صحيحًا أكبر من صفر.',
  amount_exceeds_remaining: 'المبلغ أكبر من المتبقي على القسط.',
  overpayment: 'المبلغ أكبر من المتبقي على القسط.',
  invalid_payment_method: 'طريقة الدفع غير مدعومة.',
  payment_source_missing: 'لا يوجد خزنة أو حساب بنكي نشط لهذا الفرع.',
  insufficient_cashbox_balance: 'رصيد الخزنة لا يكفي لتسجيل هذه الحركة.',
  contract_missing: 'العقد غير موجود.',
  contract_not_active: 'لا يمكن تنفيذ العملية إلا على عقد نشط.',
  vehicle_missing: 'المركبة غير موجودة أو غير متاحة.',
  vehicle_not_available: 'المركبة غير متاحة للبيع.',
  invalid_installment_count: 'أدخل عدد أقساط صحيحًا (1 أو أكثر).',
  invalid_frequency: 'دورية غير مدعومة.',
  invalid_down_payment: 'المقدم يجب أن يكون أقل من إجمالي العقد.',
  sales_invoice_missing: 'تعذر إنشاء فاتورة البيع.',
  contract_create_failed: 'تعذر إنشاء العقد.',
  invalid_due_date: 'تاريخ الاستحقاق الجديد يجب أن يكون بعد تاريخ اليوم.',
  reschedule_paid: 'لا يمكن إعادة جدولة قسط مدفوع أو مسوى.',
  installment_locked: 'القسط مدفوع أو مسوّى ولا يمكن تعديله أو حذفه.',
  no_selection: 'اختر قسطًا واحدًا على الأقل.',
  cannot_delete_all_installments: 'لا يمكن حذف كل أقساط العقد — استخدم إلغاء العقد بدلًا من ذلك.',
  contract_has_payments:
    'توجد تحصيلات على هذا العقد — لا يمكن تعديله أو إلغاؤه. استخدم الإعفاء أو إعادة الجدولة.',
  contract_locked: 'العقد ملغى أو لا يمكن تعديله في حالته الحالية.',
  invalid_custom_days: 'أيام الدورية المخصصة غير صحيحة.',
  invalid_first_due_date: 'اختر تاريخ أول قسط صحيحًا.',
  invalid_installment_date: 'أدخل تاريخًا صحيحًا — التواريخ لازم تكون تصاعدية وبدون تكرار.',
  invalid_installment_amount: 'أدخل مبلغًا صحيحًا أكبر من صفر لكل قسط.',
  manual_items_required: 'أدخل صفوف الأقساط المخصصة (تاريخ + مبلغ لكل قسط).',
  manual_items_date_order: 'التواريخ لازم تكون تصاعدية بدون تواريخ متكررة.',
  installment_items_count_mismatch: 'عدد صفوف الأقساط لا يطابق عدد الأقساط المحدد في العقد.',
  installment_sum_mismatch: 'مجموع مبالغ الأقساط لازم يساوي المبلغ الممول بالظبط.',
  legacy_installment_invalid: 'تعذر تعليم القسط كدفعة قديمة — لازم يكون القسط غير مدفوع.',
  invoice_missing: 'فاتورة البيع غير موجودة.',
  invalid_reason: 'أدخل سببًا واضحًا للعملية.',
}

export function translateInstallmentError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()

  if (isFriendlyArabicMessage(key)) return key

  if (errorMessages[key]) return errorMessages[key]

  if (databaseErrorMessages[key]) return databaseErrorMessages[key]

  const common = mapTechnicalMessage(key)
  if (common) return common

  const lower = key.toLowerCase()

  if (
    lower.includes('pgrst202') ||
    lower.includes('schema cache') ||
    lower.includes('could not find the function')
  ) {
    return 'قاعدة البيانات لسه ماحدّثتش الدالة الجديدة — حدّث الصفحة وحاول مرة أخرى، أو بلغ الإدارة لإجبار تحديث الكاش.'
  }

  if (
    lower.includes('permission denied for function') ||
    lower.includes('insufficient_privilege')
  ) {
    return 'لا تملك الصلاحية لتنفيذ هذه العملية.'
  }

  if (lower.includes('permission denied') || lower.includes('forbidden')) {
    return 'لا تملك الصلاحية لتنفيذ هذه العملية.'
  }

  if (lower.includes('ambiguous')) {
    return 'تعذر تحميل الأقساط بسبب خطأ في قاعدة البيانات. أبلغ المسؤول.'
  }

  if (lower.includes('jwt') || lower.includes('session')) {
    return 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.'
  }

  return 'تعذر إكمال العملية. تحقق من الاتصال وحاول مرة أخرى.'
}

interface InstallmentViewRow {
  id: string
  schedule_id: string
  installment_no: number
  due_date: string
  amount: number
  paid_amount: number
  stored_status: InstallmentStoredStatus
  computed_status: InstallmentComputedStatus
  remaining_amount: number
  contract_id: string
  customer_id: string
  branch_id: string
  legacy_paid: boolean
}

interface ContractJoinRow {
  id: string
  number: string
  status: string
  frequency: string
}

interface CustomerJoinRow {
  id: string
  code: string
  full_name: string
  mobile: string | null
}

interface BranchJoinRow {
  id: string
  code: string
  name: string
}

function uniqueIds(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

async function fetchInChunks<T>(table: string, columns: string, ids: string[]): Promise<T[]> {
  if (ids.length === 0) return []

  const chunks: string[][] = []
  for (let index = 0; index < ids.length; index += 100) {
    chunks.push(ids.slice(index, index + 100))
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await supabase.from(table).select(columns).in('id', chunk)

      if (error) throw new Error(translateInstallmentError(error.message))

      return (data ?? []) as T[]
    }),
  )

  return results.flat()
}

/**
 * Loads installments from `v_installment_status` and enriches them with the
 * contract, customer, and branch labels needed by the screen. The
 * `list_contract_installments` RPC is intentionally not used: the remote copy
 * raises `column reference "schedule_id" is ambiguous`.
 */
export async function fetchInstallments(filters?: InstallmentFilters): Promise<InstallmentRow[]> {
  let query = supabase
    .from('v_installment_status')
    .select(
      'id, schedule_id, installment_no, due_date, amount, paid_amount, stored_status, computed_status, remaining_amount, contract_id, customer_id, branch_id, legacy_paid',
    )
    .order('due_date', { ascending: true })
    .order('installment_no', { ascending: true })
    .limit(2000)

  if (filters?.branchId) {
    query = query.eq('branch_id', filters.branchId)
  }

  if (filters?.customerId) {
    query = query.eq('customer_id', filters.customerId)
  }

  if (filters?.contractId) {
    query = query.eq('contract_id', filters.contractId)
  }

  if (filters?.dueFrom) {
    query = query.gte('due_date', filters.dueFrom)
  }

  if (filters?.dueTo) {
    query = query.lte('due_date', filters.dueTo)
  }

  const { data, error } = await query

  if (error) throw new Error(translateInstallmentError(error.message))

  const rows = (data ?? []) as unknown as InstallmentViewRow[]

  if (rows.length === 0) return []

  const [contracts, customers, branches] = await Promise.all([
    fetchInChunks<ContractJoinRow>(
      'contracts',
      'id, number, status, frequency',
      uniqueIds(rows.map((row) => row.contract_id)),
    ),
    fetchInChunks<CustomerJoinRow>(
      'customers',
      'id, code, full_name, mobile',
      uniqueIds(rows.map((row) => row.customer_id)),
    ),
    fetchInChunks<BranchJoinRow>(
      'branches',
      'id, code, name',
      uniqueIds(rows.map((row) => row.branch_id)),
    ),
  ])

  const contractMap = new Map(contracts.map((row) => [row.id, row]))
  const customerMap = new Map(customers.map((row) => [row.id, row]))
  const branchMap = new Map(branches.map((row) => [row.id, row]))

  const enriched = rows.map<InstallmentRow>((row) => {
    const contract = contractMap.get(row.contract_id)
    const customer = customerMap.get(row.customer_id)
    const branch = branchMap.get(row.branch_id)

    return {
      ...row,
      amount: Number(row.amount ?? 0),
      paid_amount: Number(row.paid_amount ?? 0),
      remaining_amount: Number(row.remaining_amount ?? 0),
      contract_number: contract?.number ?? '—',
      contract_status: contract?.status ?? '',
      frequency: contract?.frequency ?? '',
      customer_name: customer?.full_name ?? 'عميل',
      customer_code: customer?.code ?? '',
      customer_mobile: customer?.mobile ?? null,
      branch_name: branch?.name ?? '—',
    }
  })

  const status = filters?.status ?? 'all'
  const search = filters?.search?.trim().toLowerCase() ?? ''

  return enriched.filter((row) => {
    if (status !== 'all' && resolveInstallmentStatus(row) !== status) {
      return false
    }

    if (!search) return true

    return (
      row.customer_name.toLowerCase().includes(search) ||
      row.customer_code.toLowerCase().includes(search) ||
      row.contract_number.toLowerCase().includes(search) ||
      (row.customer_mobile ?? '').includes(search)
    )
  })
}

export async function collectInstallment(input: CollectInstallmentInput) {
  const { data, error } = await rpcOfflineAware('collect_installment', {
    p_installment_id: input.installment_id,
    p_amount: input.amount,
    p_payment_method: input.payment_method,
    p_payment_date: input.payment_date,
    p_notes: input.notes?.trim() || null,
  })

  if (error) throw new Error(translateInstallmentError(error.message))

  return Array.isArray(data) ? data[0] : data
}

export async function waiveInstallment(input: WaiveInstallmentInput) {
  const { data, error } = await rpcOfflineAware('waive_installment', {
    p_installment_id: input.installment_id,
    p_reason: input.reason?.trim() || null,
  })

  if (error) throw new Error(translateInstallmentError(error.message))

  return Array.isArray(data) ? data[0] : data
}

export async function rescheduleInstallment(input: RescheduleInstallmentInput) {
  const { data, error } = await rpcOfflineAware('reschedule_installment', {
    p_installment_id: input.installment_id,
    p_new_due_date: input.new_due_date,
    p_reason: input.reason?.trim() || null,
  })

  if (error) throw new Error(translateInstallmentError(error.message))

  return Array.isArray(data) ? data[0] : data
}

export async function generateOverdueNotifications(branchId?: string | null): Promise<number> {
  const { data, error } = await rpcOfflineAware('generate_overdue_notifications', {
    p_branch_id: branchId ?? null,
  })

  if (error) throw new Error(translateInstallmentError(error.message))

  return Number(data ?? 0)
}

export async function deleteInstallments(input: { installment_ids: string[] }) {
  const { data, error } = await rpcOfflineAware('delete_installments', {
    p_installment_ids: input.installment_ids,
  })

  if (error) throw new Error(translateInstallmentError(error.message))

  return data as unknown as Array<{
    contract_id: string
    contract_number: string
    deleted_count: number
    deleted_amount: number
    new_financed_amount: number
    new_installment_count: number
  }>
}

export async function updateInstallment(input: {
  installment_id: string
  amount?: number | null
  due_date?: string | null
  reason?: string
}) {
  const { data, error } = await rpcOfflineAware('update_installment', {
    p_installment_id: input.installment_id,
    p_amount: input.amount ?? null,
    p_due_date: input.due_date ?? null,
    p_reason: input.reason?.trim() || null,
  })

  if (error) throw new Error(translateInstallmentError(error.message))

  return Array.isArray(data) ? data[0] : data
}

export async function updateContractTerms(input: {
  contract_id: string
  total_amount?: number | null
  installment_count?: number | null
  frequency?: string | null
  custom_days?: number | null
  first_due_date?: string | null
  notes?: string | null
  items?: Array<{ due_date: string; amount: number }> | null
}) {
  const { data, error } = await rpcOfflineAware('update_contract_terms', {
    p_contract_id: input.contract_id,
    p_total_amount: input.total_amount ?? null,
    p_installment_count: input.installment_count ?? null,
    p_frequency: input.frequency ?? null,
    p_custom_days: input.custom_days ?? null,
    p_first_due_date: input.first_due_date ?? null,
    p_notes: input.notes ?? null,
    p_items: input.items ?? null,
  })

  if (error) throw new Error(translateInstallmentError(error.message))

  return Array.isArray(data) ? data[0] : data
}

export async function cancelActiveContract(contractId: string, reason?: string) {
  const { data, error } = await rpcOfflineAware('cancel_active_contract', {
    p_contract_id: contractId,
    p_reason: reason?.trim() || null,
  })

  if (error) throw new Error(translateInstallmentError(error.message))

  return Array.isArray(data) ? data[0] : data
}

export async function fetchContract(contractId: string) {
  const { data, error } = await rpcOfflineAware('get_contract', {
    p_contract_id: contractId,
  })

  if (error) throw new Error(translateInstallmentError(error.message))

  return data as { contract: Record<string, unknown>; guarantors: unknown[]; payments: unknown[] }
}

export async function listContracts(options?: {
  status?: string
  customerId?: string
  search?: string
}) {
  const { data, error } = await rpcOfflineAware('list_contracts', {
    p_status: options?.status ?? 'all',
    p_customer_id: options?.customerId ?? null,
    p_search: options?.search?.trim() || null,
  })

  if (error) throw new Error(translateInstallmentError(error.message))

  return (data ?? []) as unknown as Array<{
    id: string
    number: string
    customer_id: string
    customer_name: string
    customer_code: string
    total_amount: number
    down_payment: number
    financed_amount: number
    installment_count: number
    frequency: string
    first_due_date: string | null
    status: string
  }>
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function addDaysIsoDate(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}
