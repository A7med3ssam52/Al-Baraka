export type CashboxRecord = {
  id: string
  branch_id: string
  code: string
  name_ar: string
  name_en: string | null
  currency: string
  opening_balance: number
  current_balance: number
  is_default: boolean
  is_active: boolean
}

export type CashTransactionType =
  | 'opening'
  | 'receipt'
  | 'payment'
  | 'transfer_in'
  | 'transfer_out'
  | 'adjustment'

export type CashTransactionRecord = {
  id: string
  branch_id: string
  cashbox_id: string | null
  bank_account_id: string | null
  transaction_type: CashTransactionType
  transaction_date: string
  amount: number
  currency: string
  reference_type: string | null
  reference_id: string | null
  description: string | null
  created_at: string
}

export const transactionTypeLabels: Record<CashTransactionType, string> = {
  opening: 'رصيد افتتاحي',
  receipt: 'قبض',
  payment: 'صرف',
  transfer_in: 'تحويل وارد',
  transfer_out: 'تحويل صادر',
  adjustment: 'تسوية',
}
