import { supabase } from '@/lib/supabase'

import type {
  SupplierInput,
  SupplierProfile,
  SupplierRecord,
  SupplierStatementRow,
  SupplierStatus,
} from './types'

const errorMessages: Record<string, string> = {
  forbidden: 'لا تملك الصلاحية لتنفيذ هذه العملية.',
  not_authenticated: 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.',
  invalid_branch: 'الفرع غير موجود أو غير نشط.',
  invalid_supplier_name: 'اسم المورد مطلوب (حرفان على الأقل).',
  invalid_mobile: 'رقم الموبايل يجب أن يكون رقمًا مصريًا صحيحًا (010/011/012/015).',
  invalid_status: 'حالة المورد غير معروفة.',
  supplier_missing: 'المورد غير موجود.',
  unknown_code_entity: 'وحدة ترميز غير معروفة.',
}

export function translateSupplierError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()

  if (errorMessages[key]) return errorMessages[key]

  if (key.toLowerCase().includes('permission denied')) {
    return 'لا تملك الصلاحية لتنفيذ هذه العملية.'
  }

  return 'تعذر إكمال العملية. تحقق من الاتصال وحاول مرة أخرى.'
}

export async function fetchSuppliers(options?: {
  status?: SupplierStatus | 'all'
  search?: string
}): Promise<SupplierRecord[]> {
  const { data, error } = await supabase.rpc('list_suppliers', {
    p_status: options?.status ?? 'active',
    p_search: options?.search?.trim() || null,
  })

  if (error) throw new Error(translateSupplierError(error.message))

  return (data ?? []) as unknown as SupplierRecord[]
}

export async function createSupplier(input: SupplierInput): Promise<SupplierRecord> {
  const { data, error } = await supabase.rpc('create_supplier', {
    p_full_name: input.full_name,
    p_phone: input.phone,
    p_contact_name: input.contact_name || null,
    p_tax_number: input.tax_number || null,
    p_address: input.address || null,
    p_notes: input.notes || null,
    p_branch_id: input.branch_id ?? null,
  })

  if (error) throw new Error(translateSupplierError(error.message))

  return data as unknown as SupplierRecord
}

export async function updateSupplier(
  supplierId: string,
  input: Omit<SupplierInput, 'branch_id'>,
): Promise<SupplierRecord> {
  const { data, error } = await supabase.rpc('update_supplier', {
    p_supplier_id: supplierId,
    p_full_name: input.full_name,
    p_phone: input.phone,
    p_contact_name: input.contact_name || null,
    p_tax_number: input.tax_number || null,
    p_address: input.address || null,
    p_notes: input.notes || null,
  })

  if (error) throw new Error(translateSupplierError(error.message))

  return data as unknown as SupplierRecord
}

export async function setSupplierStatus(
  supplierId: string,
  status: SupplierStatus,
): Promise<SupplierRecord> {
  const { data, error } = await supabase.rpc('set_supplier_status', {
    p_supplier_id: supplierId,
    p_status: status,
  })

  if (error) throw new Error(translateSupplierError(error.message))

  return data as unknown as SupplierRecord
}

export async function fetchSupplierProfile(supplierId: string): Promise<SupplierProfile> {
  const { data, error } = await supabase.rpc('get_supplier_profile', {
    p_supplier_id: supplierId,
  })

  if (error) throw new Error(translateSupplierError(error.message))

  return data as unknown as SupplierProfile
}

export async function fetchSupplierStatement(
  supplierId: string,
  range?: { from?: string; to?: string },
): Promise<SupplierStatementRow[]> {
  const { data, error } = await supabase.rpc('list_supplier_statement', {
    p_supplier_id: supplierId,
    p_from: range?.from || null,
    p_to: range?.to || null,
  })

  if (error) throw new Error(translateSupplierError(error.message))

  return (data ?? []) as unknown as SupplierStatementRow[]
}
