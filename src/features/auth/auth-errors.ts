export function translateAuthError(message: string) {
  const normalized = message.toLowerCase()

  if (normalized.includes('invalid login credentials')) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
  }

  if (normalized.includes('email not confirmed')) {
    return 'يجب تأكيد البريد الإلكتروني أولًا. راجع بريدك الوارد ثم حاول مرة أخرى.'
  }

  if (normalized.includes('banned')) {
    return 'تم تعطيل حسابك. تواصل مع مدير المعرض لإعادة تفعيله.'
  }

  if (normalized.includes('too many requests') || normalized.includes('rate limit')) {
    return 'محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.'
  }

  if (normalized.includes('password should be at least')) {
    return 'كلمة المرور يجب ألا تقل عن 8 أحرف.'
  }

  if (normalized.includes('user not found')) {
    return 'لا يوجد حساب مرتبط بهذا البريد الإلكتروني.'
  }

  if (normalized.includes('invalid email')) {
    return 'صيغة البريد الإلكتروني غير صحيحة.'
  }

  return 'تعذر إكمال العملية. تحقق من الاتصال وحاول مرة أخرى.'
}
