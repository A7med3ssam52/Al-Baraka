import { isUserRole, roleDescriptions, roleLabels, userRoles } from '@/features/auth/roles'
import { supabase } from '@/lib/supabase'
import type { UserRole } from '@/types'

import type {
  AccessSelection,
  BranchOption,
  CreateInvitationInput,
  CreateInvitationResult,
  DirectoryUser,
  InvitationLinkResult,
  RoleOption,
  StaffInvitation,
  StaffInvitationPreview,
  UserActionLinkResult,
} from './types'

const errorMessages: Record<string, string> = {
  email_exists: 'يوجد حساب مسجل بهذا البريد الإلكتروني بالفعل.',
  invalid_email: 'صيغة البريد الإلكتروني غير صحيحة.',
  invalid_full_name: 'أدخل اسمًا صحيحًا لا يقل عن حرفين.',
  full_name_required: 'اسم الموظف مطلوب.',
  full_name_too_long: 'اسم الموظف أطول من الحد المسموح.',
  invalid_phone: 'رقم الهاتف غير صحيح أو لا يطابق رقم الدعوة.',
  invalid_json: 'تعذر قراءة البيانات المرسلة. حاول مرة أخرى.',
  roles_required: 'اختر دورًا واحدًا على الأقل.',
  branches_required: 'اختر فرعًا واحدًا على الأقل.',
  invalid_branches: 'اختر فرعًا صحيحًا واحدًا على الأقل.',
  invalid_branch: 'أحد الفروع المحددة غير متاح.',
  invalid_role: 'أحد الأدوار المحددة غير متاح.',
  invalid_default_branch: 'الفرع الافتراضي يجب أن يكون ضمن الفروع المحددة.',
  invalid_primary_role: 'الدور الأساسي يجب أن يكون ضمن الأدوار المحددة.',
  branch_out_of_scope: 'لا تملك صلاحية إسناد أحد الفروع المحددة.',
  owner_required: 'تعديل حساب المالك أو إسناد دور المالك متاح للمالك فقط.',
  invitation_exists: 'توجد دعوة معلقة لنفس رقم الهاتف. ألغِها أو أنشئ رابطًا جديدًا لها.',
  invitation_not_found: 'رابط الدعوة غير صالح. تأكد من نسخه كاملًا.',
  invitation_used: 'تم استخدام هذه الدعوة بالفعل. سجّل الدخول بحسابك.',
  invitation_cancelled: 'أُلغيت هذه الدعوة. تواصل مع المدير لإرسال دعوة جديدة.',
  invitation_expired: 'انتهت صلاحية الدعوة. اطلب من المدير إنشاء رابط جديد.',
  invitation_locked: 'تم قفل الدعوة بعد محاولات تحقق خاطئة متعددة. اطلب من المدير إنشاء رابط جديد.',
  invitation_in_use: 'الدعوة قيد الاستخدام الآن. انتظر قليلًا ثم حاول مرة أخرى.',
  invitation_already_accepted: 'تم قبول هذه الدعوة بالفعل.',
  invitation_required: 'معرّف الدعوة مطلوب.',
  weak_password: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.',
  user_creation_failed: 'تعذر إنشاء الحساب. حاول مرة أخرى أو تواصل مع المدير.',
  acceptance_failed: 'تعذر إكمال الدعوة. حاول مرة أخرى.',
  rate_limited: 'محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.',
  already_confirmed: 'الحساب مؤكد بالفعل؛ استخدم رابط إعادة تعيين كلمة المرور.',
  user_not_found: 'المستخدم غير موجود أو خارج نطاق صلاحيتك.',
  forbidden: 'لا تملك الصلاحية لتنفيذ هذه العملية.',
  unauthorized: 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.',
  cannot_modify_self: 'لا يمكنك تغيير أدوارك أو تعطيل حسابك بنفسك.',
  last_owner: 'لا يمكن تعطيل أو خفض آخر مالك نشط في النظام.',
  user_out_of_scope: 'هذا المستخدم خارج نطاق الفروع التي تديرها.',
  permission_denied: 'لا تملك الصلاحية لتنفيذ هذه العملية.',
  not_authenticated: 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.',
  user_required: 'اختر مستخدمًا أولًا.',
  active_state_required: 'حالة الحساب غير صحيحة.',
  invite_failed: 'تعذر إنشاء الدعوة. حاول مرة أخرى.',
  assignment_failed: 'تم إنشاء الحساب لكن تعذر إسناد الأدوار. راجع سجل الأخطاء.',
  link_failed: 'تعذر إنشاء الرابط. حاول مرة أخرى.',
  lookup_failed: 'تعذر تحميل البيانات.',
  invalid_action: 'الإجراء المطلوب غير مدعوم.',
  invalid_user: 'بيانات المستخدم غير صحيحة.',
  method_not_allowed: 'طريقة الطلب غير مدعومة.',
  supabase_not_configured: 'إعدادات Supabase غير مكتملة على الخادم.',
  service_role_required: 'هذه العملية متاحة للخادم فقط.',
}

export function translateUserError(codeOrMessage: string) {
  const key = codeOrMessage.trim()
  if (errorMessages[key]) return errorMessages[key]

  if (key.toLowerCase().includes('permission denied')) {
    return 'لا تملك الصلاحية لتنفيذ هذه العملية.'
  }

  return 'تعذر إكمال العملية. تحقق من الاتصال وحاول مرة أخرى.'
}

async function readFunctionError(error: unknown) {
  if (typeof error === 'object' && error !== null && 'context' in error) {
    const context = (error as { context?: Response }).context
    if (context) {
      const payload = (await context
        .clone()
        .json()
        .catch(() => null)) as { error?: string } | null
      if (payload?.error) return payload.error
    }
  }

  if (error instanceof Error) return error.message
  return 'unknown'
}

function buildInviteLink(token: string) {
  return `${window.location.origin}/invite/${token}`
}

export async function fetchDirectoryUsers(searchText = ''): Promise<DirectoryUser[]> {
  const { data, error } = await supabase.rpc('list_users', {
    search_text: searchText.trim() || null,
  })

  if (error) throw new Error(translateUserError(error.message))

  return (data ?? []) as DirectoryUser[]
}

export async function fetchRoleOptions(): Promise<RoleOption[]> {
  const { data, error } = await supabase
    .from('roles')
    .select('code, name_ar, description, is_system')
    .eq('is_active', true)

  if (error) throw new Error(error.message)

  return (
    (data ?? []) as {
      code: string
      name_ar: string
      description: string | null
      is_system: boolean
    }[]
  )
    .filter((row) => isUserRole(row.code))
    .map((row) => ({
      code: row.code as UserRole,
      nameAr: row.name_ar,
      description: row.description,
      isSystem: row.is_system,
    }))
    .sort((first, second) => userRoles.indexOf(first.code) - userRoles.indexOf(second.code))
}

export async function fetchBranchOptions(): Promise<BranchOption[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('id, code, name')
    .eq('is_active', true)
    .order('code')

  if (error) throw new Error(error.message)

  return (data ?? []) as BranchOption[]
}

export function fallbackRoleOptions(isOwner: boolean): RoleOption[] {
  return userRoles
    .filter((code) => isOwner || code !== 'owner')
    .map((code) => ({
      code,
      nameAr: roleLabels[code],
      description: roleDescriptions[code],
      isSystem: code === 'owner',
    }))
}

export async function fetchStaffInvitations(searchText = ''): Promise<StaffInvitation[]> {
  const { data, error } = await supabase.rpc('list_staff_invitations', {
    search_text: searchText.trim() || null,
  })

  if (error) throw new Error(translateUserError(error.message))

  return (data ?? []) as StaffInvitation[]
}

export async function createStaffInvitation(
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  const { data, error } = await supabase.rpc('create_staff_invitation', {
    invite_full_name: input.fullName.trim(),
    invite_phone: input.phone.trim(),
    invite_roles: input.access.roles,
    invite_branch_ids: input.access.branchIds,
    invite_default_branch_id: input.access.defaultBranchId,
    invite_primary_role: input.access.primaryRole,
  })

  if (error) throw new Error(translateUserError(error.message))

  const payload = data as { invitation_id?: string; token?: string; expires_at?: string } | null

  if (!payload?.invitation_id || !payload.token) {
    throw new Error(translateUserError('invite_failed'))
  }

  return {
    invitationId: payload.invitation_id,
    token: payload.token,
    expiresAt: payload.expires_at ?? new Date().toISOString(),
    link: buildInviteLink(payload.token),
  }
}

export async function cancelStaffInvitation(invitationId: string) {
  const { error } = await supabase.rpc('cancel_staff_invitation', {
    invitation_id: invitationId,
  })

  if (error) throw new Error(translateUserError(error.message))
}

export async function regenerateStaffInvitation(
  invitationId: string,
): Promise<InvitationLinkResult> {
  const { data, error } = await supabase.rpc('regenerate_staff_invitation', {
    invitation_id: invitationId,
  })

  if (error) throw new Error(translateUserError(error.message))

  const payload = data as { invitation_id?: string; token?: string; expires_at?: string } | null

  if (!payload?.invitation_id || !payload.token) {
    throw new Error(translateUserError('link_failed'))
  }

  return {
    invitationId: payload.invitation_id,
    link: buildInviteLink(payload.token),
    expiresAt: payload.expires_at ?? new Date().toISOString(),
  }
}

export async function fetchStaffInvitationPreview(
  token: string,
): Promise<StaffInvitationPreview | null> {
  const { data, error } = await supabase.rpc('get_staff_invitation', {
    invite_token: token,
  })

  if (error) throw new Error(translateUserError(error.message))

  return (data as StaffInvitationPreview | null) ?? null
}

export async function verifyStaffInvitation(token: string, phone: string) {
  const { data, error } = await supabase.rpc('verify_staff_invitation', {
    invite_token: token,
    invite_phone: phone,
  })

  if (error) throw new Error(translateUserError(error.message))

  return data as StaffInvitationPreview
}

export async function acceptStaffInvitation(input: {
  token: string
  phone: string
  email: string
  password: string
}) {
  const { data, error } = await supabase.functions.invoke('accept-staff-invite', {
    body: input,
  })

  if (error) throw new Error(translateUserError(await readFunctionError(error)))

  const payload = data as { ok?: boolean; email?: string } | null
  if (!payload?.ok) throw new Error(translateUserError('acceptance_failed'))

  return payload
}

export async function assignUserAccess(targetUserId: string, access: AccessSelection) {
  const { error } = await supabase.rpc('assign_user_access', {
    target_user_id: targetUserId,
    target_roles: access.roles,
    target_branch_ids: access.branchIds,
    target_default_branch_id: access.defaultBranchId,
    target_primary_role: access.primaryRole,
  })

  if (error) throw new Error(translateUserError(error.message))
}

export async function updateUserProfile(
  targetUserId: string,
  fullName: string,
  phone: string | null,
) {
  const { error } = await supabase.rpc('update_user_profile', {
    target_user_id: targetUserId,
    target_full_name: fullName.trim(),
    target_phone: phone?.trim() || null,
  })

  if (error) throw new Error(translateUserError(error.message))
}

export async function setUserActive(targetUserId: string, active: boolean) {
  const { error } = await supabase.rpc('set_user_active', {
    target_user_id: targetUserId,
    target_active: active,
  })

  if (error) throw new Error(translateUserError(error.message))
}

export async function generateUserActionLink(targetUserId: string): Promise<UserActionLinkResult> {
  const { data, error } = await supabase.functions.invoke('admin-user-actions', {
    body: { action: 'reset_password', user_id: targetUserId },
  })

  if (error) throw new Error(translateUserError(await readFunctionError(error)))

  const payload = data as { user_id?: string; action_link?: string } | null

  if (!payload?.user_id || !payload.action_link) {
    throw new Error(translateUserError('link_failed'))
  }

  return { userId: payload.user_id, actionLink: payload.action_link }
}
