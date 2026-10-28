export const documentTypes = [
  'sales_invoice',
  'purchase_invoice',
  'contract',
  'receipt',
  'payment',
  'journal_entry',
] as const

export type DocumentType = (typeof documentTypes)[number]

export const documentTypeLabels: Record<DocumentType, string> = {
  sales_invoice: 'فواتير البيع',
  purchase_invoice: 'فواتير الشراء',
  contract: 'العقود',
  receipt: 'إيصالات القبض',
  payment: 'إيصالات الصرف',
  journal_entry: 'القيود اليومية',
}

export const documentTypeHints: Record<DocumentType, string> = {
  sales_invoice: 'مثال: SAL-2026-00001',
  purchase_invoice: 'مثال: PUR-2026-00001',
  contract: 'مثال: CON-2026-00001',
  receipt: 'مثال: REC-2026-00001',
  payment: 'مثال: PAY-2026-00001',
  journal_entry: 'مثال: JV-2026-00001',
}

export interface SystemSettings {
  id: boolean
  app_name: string
  branch_code: string
  currency: string
  timezone: string
  logo_url: string | null
  address: string | null
  phone: string | null
  email: string | null
  tax_number: string | null
  document_prefixes: Record<DocumentType, string>
  default_discount_limit: number
  updated_at?: string | null
}

export interface SystemSettingsInput {
  app_name: string
  logo_url: string | null
  address: string | null
  phone: string | null
  email: string | null
  tax_number: string | null
  currency: string
  timezone: string
  document_prefixes: Record<DocumentType, string>
  default_discount_limit: number
}

export interface BranchRecord {
  id: string
  code: string
  name: string
  address: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface BranchInput {
  code: string
  name: string
  address: string | null
  is_active: boolean
}

export interface DocumentSequence {
  document_type: DocumentType
  year: number
  prefix: string
  next_number: number
  padding: number
  sample: string
}
