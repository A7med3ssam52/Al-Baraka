import { isFriendlyArabicMessage } from '@/lib/friendly-error'
import { supabase } from '@/lib/supabase'
import { tableOfflineAware } from '@/lib/offline'

import type { ExpenseRecord, ExpenseStatus } from './types'
import { rpcOfflineAware } from '@/lib/offline'

export function translateExpenseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()
  if (isFriendlyArabicMessage(key)) return key
  const map: Record<string, string> = {
    expense_missing: 'المصروف غير موجود.',
    expense_archived: 'المصروف ملغى ولا يمكن تعديله.',
    invalid_title: 'العنوان مطلوب (حرفان على الأقل).',
    invalid_amount: 'أدخل مبلغًا صحيحًا أكبر من صفر.',
  }
  if (map[key]) return map[key]
  if (key.toLowerCase().includes('permission denied') || key === 'forbidden') {
    return 'لا تملك الصلاحية لتنفيذ هذه العملية.'
  }
  if (key.toLowerCase().includes('jwt') || key.toLowerCase().includes('session')) {
    return 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.'
  }
  return 'تعذر إكمال العملية. حاول مرة أخرى.'
}

export async function fetchExpenses(options?: {
  status?: ExpenseStatus | 'all'
  branchId?: string
}): Promise<ExpenseRecord[]> {
  let query = supabase
    .from('expenses')
    .select('*')
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (options?.branchId) query = query.eq('branch_id', options.branchId)
  if (options?.status && options.status !== 'all') query = query.eq('status', options.status)

  const { data, error } = await query
  if (error) throw new Error(translateExpenseError(error.message))
  return (data ?? []) as unknown as ExpenseRecord[]
}

export async function createExpense(input: {
  branchId: string
  title: string
  category?: string
  amount: number
  expenseDate?: string
  cashboxId?: string | null
  notes?: string
}): Promise<void> {
  const { error } = await tableOfflineAware({
    table: 'expenses',
    op: 'insert',
    payload: {
      branch_id: input.branchId,
      title: input.title,
      category: input.category ?? 'general',
      amount: input.amount,
      expense_date: input.expenseDate ?? new Date().toISOString().slice(0, 10),
      cashbox_id: input.cashboxId ?? null,
      notes: input.notes || null,
      status: 'draft',
    },
    label: `إضافة مصروف «${input.title}»`,
  })

  if (error) throw new Error(translateExpenseError(error.message))
}

export async function updateExpense(input: {
  expenseId: string
  title: string
  category?: string
  amount: number
  expenseDate?: string
  cashboxId?: string | null
  notes?: string
}): Promise<ExpenseRecord> {
  const { data, error } = await rpcOfflineAware('update_expense', {
    p_expense_id: input.expenseId,
    p_title: input.title,
    p_category: input.category ?? null,
    p_amount: input.amount,
    p_expense_date: input.expenseDate ?? null,
    p_cashbox_id: input.cashboxId ?? null,
    p_notes: input.notes ?? null,
  })

  if (error) throw new Error(translateExpenseError(error.message))
  return data as unknown as ExpenseRecord
}

export async function deleteExpense(expenseId: string): Promise<ExpenseRecord> {
  const { data, error } = await rpcOfflineAware('delete_expense', {
    p_expense_id: expenseId,
  })

  if (error) throw new Error(translateExpenseError(error.message))
  return data as unknown as ExpenseRecord
}
