import { supabase } from '@/lib/supabase'

import type { ExpenseRecord, ExpenseStatus } from './types'

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
  if (error) throw new Error(error.message)
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
}): Promise<ExpenseRecord> {
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      branch_id: input.branchId,
      title: input.title,
      category: input.category ?? 'general',
      amount: input.amount,
      expense_date: input.expenseDate ?? new Date().toISOString().slice(0, 10),
      cashbox_id: input.cashboxId ?? null,
      notes: input.notes || null,
      status: 'draft',
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as ExpenseRecord
}
