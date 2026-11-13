import { supabase } from '@/lib/supabase'
import { isFriendlyArabicMessage } from '@/lib/friendly-error'
import { databaseErrorMessages, mapTechnicalMessage } from '@/lib/error-messages'

import type {
  BranchInput,
  BranchRecord,
  DocumentSequence,
  SystemSettings,
  SystemSettingsInput,
} from './types'
import { rpcOfflineAware, tableOfflineAware } from '@/lib/offline'

const errorMessages: Record<string, string> = {
  forbidden: 'لا تملك الصلاحية لتنفيذ هذه العملية.',
  not_authenticated: 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.',
  invalid_document_prefix: 'بادئة المستند يجب أن تكون من 2 إلى 6 أحرف لاتينية أو أرقام.',
  invalid_document_prefixes: 'بيانات بادئات المستندات غير صحيحة.',
  invalid_document_type: 'نوع المستند غير مدعوم.',
  invalid_timezone: 'المنطقة الزمنية غير صحيحة.',
  invalid_currency: 'العملة يجب أن تكون رمزًا من ثلاثة أحرف.',
  invalid_app_name: 'اسم المعرض يجب أن يكون بين حرفين و120 حرفًا.',
  invalid_phone: 'صيغة رقم الهاتف غير صحيحة.',
  invalid_email: 'صيغة البريد الإلكتروني غير صحيحة.',
  invalid_logo_url: 'رابط الشعار يجب أن يبدأ بـ http أو https.',
  invalid_address: 'العنوان أطول من الحد المسموح.',
  invalid_discount_limit: 'حد الخصم الافتراضي يجب أن يكون صفرًا أو أكثر.',
  invalid_branch: 'الفرع غير موجود أو غير نشط.',
  branch_required: 'اختر فرعًا أولًا.',
  launch_branch_active_required: 'لا يمكن تعطيل فرع صان الحجر الرئيسي.',
  launch_branch_code_immutable: 'كود فرع صان الحجر ثابت ولا يمكن تعديله.',
  branch_id_immutable: 'معرّف الفرع ثابت ولا يمكن تعديله.',
  settings_missing: 'إعدادات المعرض غير مهيأة. تواصل مع مدير النظام.',
  settings_id_immutable: 'معرّف الإعدادات ثابت.',
  settings_branch_code_immutable: 'كود الفرع في الإعدادات ثابت.',
}

export function translateSettingsError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()

  if (isFriendlyArabicMessage(key)) return key

  if (errorMessages[key]) return errorMessages[key]

  if (databaseErrorMessages[key]) return databaseErrorMessages[key]

  const common = mapTechnicalMessage(key)
  if (common) return common

  if (key.toLowerCase().includes('duplicate key')) {
    return 'كود الفرع مستخدم بالفعل. اختر كودًا آخر.'
  }

  if (key.toLowerCase().includes('permission denied')) {
    return 'لا تملك الصلاحية لتنفيذ هذه العملية.'
  }

  return 'تعذر إكمال العملية. تحقق من الاتصال وحاول مرة أخرى.'
}

export async function fetchSystemSettings(): Promise<SystemSettings> {
  const { data, error } = await supabase.from('system_settings').select('*').eq('id', true).single()

  if (error) throw new Error(translateSettingsError(error.message))

  return data as unknown as SystemSettings
}

export async function updateSystemSettings(input: SystemSettingsInput): Promise<SystemSettings> {
  const { data, error } = await rpcOfflineAware('update_system_settings', {
    p_app_name: input.app_name,
    p_logo_url: input.logo_url,
    p_address: input.address,
    p_phone: input.phone,
    p_email: input.email,
    p_tax_number: input.tax_number,
    p_currency: input.currency,
    p_timezone: input.timezone,
    p_document_prefixes: input.document_prefixes,
    p_default_discount_limit: input.default_discount_limit,
  })

  if (error) throw new Error(translateSettingsError(error.message))

  return data as unknown as SystemSettings
}

export async function fetchBranches(): Promise<BranchRecord[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('id, code, name, address, is_active, created_at, updated_at')
    .order('code')

  if (error) throw new Error(translateSettingsError(error.message))

  return (data ?? []) as BranchRecord[]
}

export async function createBranch(input: BranchInput): Promise<void> {
  const { error } = await tableOfflineAware({
    table: 'branches',
    op: 'insert',
    payload: {
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      address: input.address?.trim() || null,
      is_active: input.is_active,
    },
    label: `تعديل الفرع ${input.code}`,
  })

  if (error) throw new Error(translateSettingsError(error.message))
}

export async function updateBranch(
  branchId: string,
  input: Omit<BranchInput, 'code'>,
): Promise<void> {
  const { error } = await tableOfflineAware({
    table: 'branches',
    op: 'update',
    payload: {
      name: input.name.trim(),
      address: input.address?.trim() || null,
      is_active: input.is_active,
    },
    match: { id: branchId },
    label: `تعديل الفرع ${input.name}`,
  })

  if (error) throw new Error(translateSettingsError(error.message))
}

export async function fetchDocumentSequences(branchId: string): Promise<DocumentSequence[]> {
  const { data, error } = await rpcOfflineAware('list_document_sequences', {
    p_branch_id: branchId,
  })

  if (error) throw new Error(translateSettingsError(error.message))

  return (data ?? []) as DocumentSequence[]
}
