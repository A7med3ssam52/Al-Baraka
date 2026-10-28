export type CustomerStatus = 'active' | 'inactive' | 'archived'

export interface CustomerRecord {
  id: string
  code: string
  full_name: string
  national_id: string
  mobile: string
  phone2: string | null
  job: string | null
  address: string | null
  status: CustomerStatus
  notes: string | null
  branch_id: string
  created_at: string
  updated_at?: string
  updated_by?: string | null
}

export interface CustomerInput {
  full_name: string
  national_id: string
  mobile: string
  phone2?: string | null
  job?: string | null
  address?: string | null
  notes?: string | null
  branch_id?: string | null
}

export interface CustomerDuplicates {
  national_id: { id: string; code: string; name: string } | null
  mobiles: { id: string; code: string; name: string }[]
}

export const customerStatusLabels: Record<CustomerStatus, string> = {
  active: 'نشط',
  inactive: 'غير نشط',
  archived: 'مؤرشف',
}

export interface CustomerNote {
  id: string
  customer_id: string
  note: string
  note_type: 'note' | 'call' | 'visit' | 'promise'
  next_followup_at: string | null
  created_at: string
  created_by: string | null
  created_by_name: string
}

export function formatNationalId(value: string) {
  return value.replace(/\D/g, '').slice(0, 14)
}

export function formatMobileInput(value: string) {
  return value.replace(/[^\d+]/g, '').slice(0, 15)
}

export function formatMobileDisplay(value: string | null) {
  if (!value) return '—'
  const digits = value.replace(/\D/g, '')
  return digits.startsWith('20') ? `+${digits}` : digits
}

export function maskNationalId(value: string) {
  if (value.length < 4) return value
  return `${value.slice(0, 6)}•${value.slice(-4)}`
}
