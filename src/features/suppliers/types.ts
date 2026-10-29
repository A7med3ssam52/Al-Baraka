export type SupplierStatus = 'active' | 'inactive' | 'archived'

export interface SupplierRecord {
  id: string
  code: string
  full_name: string
  contact_name: string | null
  phone: string
  phone2: string | null
  tax_number: string | null
  address: string | null
  status: SupplierStatus
  notes: string | null
  created_at: string
}

export interface SupplierInput {
  full_name: string
  phone: string
  contact_name?: string
  tax_number?: string
  address?: string
  notes?: string
  branch_id?: string | null
}

export const supplierStatusLabels: Record<SupplierStatus, string> = {
  active: 'نشط',
  inactive: 'متوقف',
  archived: 'مؤرشف',
}

export interface SupplierProfileInvoice {
  id: string
  number: string
  invoice_date: string
  status: 'draft' | 'approved' | 'cancelled'
  payment_method: 'cash' | 'bank' | 'credit'
  total: number
  paid_amount: number
  remaining_amount: number
  document_id: string | null
  item_count: number
}

export interface SupplierProfileTotals {
  invoice_count: number
  invoiced_total: number
  paid_total: number
  balance: number
  last_invoice_date: string | null
}

export interface SupplierProfile {
  supplier: SupplierRecord & {
    branch_id: string
    branch_name: string | null
    updated_at: string
  }
  totals: SupplierProfileTotals
  invoices: SupplierProfileInvoice[]
}

export interface SupplierStatementRow {
  transaction_id: string
  transaction_date: string
  transaction_type: 'invoice' | 'payment' | 'return' | 'adjustment'
  reference_type: string | null
  reference_id: string | null
  reference_number: string | null
  description: string | null
  debit: number
  credit: number
  running_balance: number
  created_at: string
}

export const supplierTransactionLabels: Record<SupplierStatementRow['transaction_type'], string> = {
  invoice: 'فاتورة شراء',
  payment: 'سداد',
  return: 'مرتجع',
  adjustment: 'تسوية',
}
