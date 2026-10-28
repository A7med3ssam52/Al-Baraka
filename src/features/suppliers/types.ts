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
