export type ExpenseStatus = 'draft' | 'approved' | 'cancelled'

export type ExpenseRecord = {
  id: string
  branch_id: string
  expense_number: string | null
  category: string
  title: string
  amount: number
  currency: string
  expense_date: string
  cashbox_id: string | null
  status: ExpenseStatus
  notes: string | null
  created_at: string
}

export const expenseStatusLabels: Record<ExpenseStatus, string> = {
  draft: 'مسودة',
  approved: 'معتمد',
  cancelled: 'ملغى',
}
