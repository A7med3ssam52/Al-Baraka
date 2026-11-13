import { isFriendlyArabicMessage } from '@/lib/friendly-error'
import { databaseErrorMessages, mapTechnicalMessage } from '@/lib/error-messages'
import { supabase } from '@/lib/supabase'

import type { CashTransactionRecord, CashTransactionType, CashboxRecord } from './types'

export function translateTreasuryError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()
  if (isFriendlyArabicMessage(key)) return key
  if (databaseErrorMessages[key]) return databaseErrorMessages[key]
  const common = mapTechnicalMessage(key)
  if (common) return common
  if (key.toLowerCase().includes('permission denied')) {
    return 'لا تملك الصلاحية لتنفيذ هذه العملية.'
  }
  if (key.toLowerCase().includes('jwt') || key.toLowerCase().includes('session')) {
    return 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.'
  }
  return 'تعذر إكمال العملية. حاول مرة أخرى.'
}

export async function fetchCashboxes(branchId?: string): Promise<CashboxRecord[]> {
  let query = supabase
    .from('cashboxes')
    .select('*')
    .order('is_default', { ascending: false })
    .order('code', { ascending: true })

  if (branchId) query = query.eq('branch_id', branchId)

  const { data, error } = await query
  if (error) throw new Error(translateTreasuryError(error.message))
  return (data ?? []) as unknown as CashboxRecord[]
}

export async function fetchCashTransactions(options?: {
  cashboxId?: string
  type?: CashTransactionType | 'all'
  limit?: number
}): Promise<CashTransactionRecord[]> {
  let query = supabase
    .from('cash_transactions')
    .select('*')
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(options?.limit ?? 100)

  if (options?.cashboxId) query = query.eq('cashbox_id', options.cashboxId)
  if (options?.type && options.type !== 'all') query = query.eq('transaction_type', options.type)

  const { data, error } = await query
  if (error) throw new Error(translateTreasuryError(error.message))
  return (data ?? []) as unknown as CashTransactionRecord[]
}
