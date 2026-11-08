import { isFriendlyArabicMessage } from '@/lib/friendly-error'
import { supabase } from '@/lib/supabase'

import type { PortalLookupInput, PortalSnapshot } from './types'

export function translatePortalError(error: unknown): string {
  const raw: Record<string, unknown> =
    error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const code = typeof raw.code === 'string' ? raw.code : ''
  const details = typeof raw.details === 'string' ? raw.details : ''
  const message = error instanceof Error ? error.message : String(error ?? '')

  if (isFriendlyArabicMessage(message.trim())) return message.trim()

  // No technical details in the user-facing message.
  if (code === 'PGRST202' || message.includes('Could not find the function')) {
    return 'خدمة الاستعلام غير جاهزة حاليًا. حاول مرة أخرى بعد قليل.'
  }

  const key = message.trim()
  const map: Record<string, string> = {
    identifier_required: 'أدخل الرقم القومي أو رقم الموبايل للبحث.',
    invalid_national_id: 'الرقم القومي غير صالح. تحقق من الرقم (١٤ رقمًا) وحاول مرة أخرى.',
    invalid_mobile: 'رقم الموبايل غير صالح. أدخل رقمًا مصريًا صحيحًا (010/011/012/015).',
    rate_limited: 'تم تجاوز عدد المحاولات المسموح. انتظر قليلًا وحاول مرة أخرى.',
  }
  if (map[key]) return map[key]
  const haystack = `${message} ${details} ${code}`.toLowerCase()
  if (haystack.includes('rate_limited')) return map.rate_limited
  if (haystack.includes('invalid_national_id')) return map.invalid_national_id
  if (haystack.includes('invalid_mobile')) return map.invalid_mobile
  if (haystack.includes('identifier_required')) return map.identifier_required
  return 'تعذر الاتصال بخدمة الاستعلام. تحقق من الاتصال وحاول مرة أخرى.'
}

/**
 * Calls the single public read-only RPC. Never queries customer tables
 * directly (they are RLS-locked to authenticated users).
 */
export async function lookupPortal(input: PortalLookupInput): Promise<PortalSnapshot> {
  const params =
    input.kind === 'national_id'
      ? { p_national_id: input.value, p_mobile: null }
      : { p_national_id: null, p_mobile: input.value }

  const { data, error } = await supabase.rpc('public_portal_lookup', params)

  if (error) throw new Error(translatePortalError(error))

  const snapshot = (data ?? {
    found: false,
    reason: 'not_found',
    customer: null,
    notes: [],
    contacts: [],
    guarantors: [],
    contracts: [],
    installments: [],
    documents: [],
    transactions: [],
    summary: null,
    matches: [],
  }) as unknown as PortalSnapshot

  // Normalize numeric fields that may arrive as strings from Postgres.
  const num = (v: unknown) => Number(v ?? 0)
  if (snapshot.summary) {
    snapshot.summary.total_amount = num(snapshot.summary.total_amount)
    snapshot.summary.total_paid = num(snapshot.summary.total_paid)
    snapshot.summary.total_remaining = num(snapshot.summary.total_remaining)
    snapshot.summary.overdue_count = num(snapshot.summary.overdue_count)
    snapshot.summary.overdue_amount = num(snapshot.summary.overdue_amount)
    snapshot.summary.due_count = num(snapshot.summary.due_count)
    snapshot.summary.due_amount = num(snapshot.summary.due_amount)
    snapshot.summary.paid_count = num(snapshot.summary.paid_count)
    snapshot.summary.next_due_amount =
      snapshot.summary.next_due_amount == null ? null : num(snapshot.summary.next_due_amount)
    snapshot.summary.contract_count = num(snapshot.summary.contract_count)
    snapshot.summary.active_contract_count = num(snapshot.summary.active_contract_count)
  }
  snapshot.installments = (snapshot.installments ?? []).map((row) => ({
    ...row,
    installment_no: num(row.installment_no),
    amount: num(row.amount),
    paid_amount: num(row.paid_amount),
    remaining_amount: num(row.remaining_amount),
  }))
  snapshot.contracts = (snapshot.contracts ?? []).map((row) => ({
    ...row,
    total_amount: num(row.total_amount),
    down_payment: num(row.down_payment),
    financed_amount: num(row.financed_amount),
    installment_count: num(row.installment_count),
  }))
  snapshot.transactions = (snapshot.transactions ?? []).map((row) => ({
    ...row,
    amount: num(row.amount),
  }))
  snapshot.documents = (snapshot.documents ?? []).map((row) => ({
    ...row,
    file_count: num(row.file_count),
  }))
  if (snapshot.customer && snapshot.customer.credit_balance != null) {
    snapshot.customer.credit_balance = num(snapshot.customer.credit_balance)
  }

  return snapshot
}
