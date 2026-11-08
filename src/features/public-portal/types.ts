export type PortalTabId = 'statement'

export const portalTabs: Array<{ id: PortalTabId; label: string }> = [
  { id: 'statement', label: 'كشف الحساب' },
]

export type PortalLookupKind = 'national_id' | 'mobile'

export interface PortalLookupInput {
  kind: PortalLookupKind
  /** National ID: 14 digits, digits-only. Mobile: raw user input (normalized in DB). */
  value: string
}

export interface PortalSession {
  kind: PortalLookupKind
  value: string
}

export interface PortalCustomer {
  id: string
  code: string
  full_name: string
  national_id: string
  mobile: string
  phone2: string | null
  job: string | null
  address: string | null
  status: string
  notes: string | null
  branch_id: string
  branch_name: string | null
  credit_balance?: number | string | null
  created_at: string
  updated_at?: string
}

export interface PortalNote {
  id: string
  note: string
  note_type: 'note' | 'call' | 'visit' | 'promise'
  next_followup_at: string | null
  created_at: string
  created_by_name: string
}

export interface PortalContact {
  id: string
  label: string
  mobile: string
  note: string | null
  created_at: string
}

export interface PortalGuarantor {
  id: string
  full_name: string
  national_id: string
  mobile: string
  job: string | null
  address: string | null
  contract_number: string
  role: string
}

export interface PortalContract {
  id: string
  number: string
  contract_date: string
  total_amount: number
  down_payment: number
  financed_amount: number
  installment_count: number
  frequency: string
  first_due_date: string | null
  status: string
}

export interface PortalInstallment {
  id: string
  contract_number: string
  installment_no: number
  due_date: string
  amount: number
  paid_amount: number
  remaining_amount: number
  stored_status: string
  computed_status: string
  display_status: 'pending' | 'due' | 'overdue' | 'partial' | 'paid' | 'waived'
}

export interface PortalDocument {
  id: string
  doc_number: string
  title: string
  doc_type: string
  status: string
  notes: string | null
  created_at: string
  file_count: number
}

export interface PortalTransaction {
  id: string
  transaction_date: string
  transaction_type: string
  amount: number
  notes: string | null
}

export interface PortalSummary {
  total_amount: number
  total_paid: number
  total_remaining: number
  overdue_count: number
  overdue_amount: number
  due_count: number
  due_amount: number
  paid_count: number
  next_due_date: string | null
  next_due_amount: number | null
  contract_count: number
  active_contract_count: number
}

export interface PortalMatch {
  id: string
  code: string
  full_name: string
}

export interface PortalSnapshot {
  found: boolean
  reason: 'ok' | 'not_found' | 'multiple_matches' | 'rate_limited' | 'invalid_identifier'
  customer: PortalCustomer | null
  notes: PortalNote[]
  contacts: PortalContact[]
  guarantors: PortalGuarantor[]
  contracts: PortalContract[]
  installments: PortalInstallment[]
  documents: PortalDocument[]
  transactions: PortalTransaction[]
  summary: PortalSummary | null
  matches: PortalMatch[]
}

const PORTAL_SESSION_KEY = 'albaraka-portal-session-v1'

export function savePortalSession(session: PortalSession) {
  try {
    sessionStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify(session))
  } catch {
    // storage unavailable — portal will ask again
  }
}

export function loadPortalSession(): PortalSession | null {
  try {
    const raw = sessionStorage.getItem(PORTAL_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PortalSession>
    if ((parsed.kind === 'national_id' || parsed.kind === 'mobile') && typeof parsed.value === 'string') {
      return { kind: parsed.kind, value: parsed.value }
    }
    return null
  } catch {
    return null
  }
}

export function clearPortalSession() {
  try {
    sessionStorage.removeItem(PORTAL_SESSION_KEY)
  } catch {
    // ignore
  }
}

export function maskNationalId(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 4) return value
  return `${digits.slice(0, 3)}••••${digits.slice(-4)}`
}

export function normalizeNationalIdInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 14)
}

export function validateNationalIdBasic(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 14) return 'الرقم القومي يجب أن يكون ١٤ رقمًا بالضبط.'
  if (!/^[23]/.test(digits)) return 'الرقم القومي غير صالح. تحقق من الرقم وحاول مرة أخرى.'
  const century = Number(digits[0])
  const yy = Number(digits.slice(1, 3))
  const mm = Number(digits.slice(3, 5))
  const dd = Number(digits.slice(5, 7))
  const gov = Number(digits.slice(7, 9))
  const year = century === 2 ? 1900 + yy : 2000 + yy
  if (mm < 1 || mm > 12) return 'الرقم القومي غير صالح. تحقق من الرقم وحاول مرة أخرى.'
  if (gov < 1 || gov > 88) return 'الرقم القومي غير صالح. تحقق من الرقم وحاول مرة أخرى.'
  const dt = new Date(Date.UTC(year, mm - 1, dd))
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) {
    return 'الرقم القومي غير صالح (تاريخ الميلاد غير صحيح).'
  }
  if (dt > new Date()) return 'الرقم القومي غير صالح (تاريخ ميلاد في المستقبل).'
  return null
}

export function validateMobileBasic(value: string): string | null {
  const raw = value.trim()
  if (!raw) return 'أدخل رقم الموبايل.'
  let digits = raw.replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '')
  if (/^20\d+$/.test(digits)) digits = digits.slice(2)
  else if (/^0\d+$/.test(digits)) digits = digits.slice(1)
  if (!/^1[0125]\d{8}$/.test(digits)) {
    return 'رقم الموبايل يجب أن يكون رقمًا مصريًا صحيحًا (010 / 011 / 012 / 015 + 8 أرقام).'
  }
  return null
}
