import { isFriendlyArabicMessage } from '@/lib/friendly-error'
import { supabase } from '@/lib/supabase'

import type { NotificationRecord } from './types'

export function translateNotificationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()
  if (isFriendlyArabicMessage(key)) return key
  if (key.toLowerCase().includes('permission denied')) {
    return 'لا تملك الصلاحية لتنفيذ هذه العملية.'
  }
  if (key.toLowerCase().includes('jwt') || key.toLowerCase().includes('session')) {
    return 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.'
  }
  return 'تعذر إكمال العملية. حاول مرة أخرى.'
}

export async function fetchNotifications(limit = 50): Promise<NotificationRecord[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(translateNotificationError(error.message))
  return (data ?? []) as unknown as NotificationRecord[]
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)

  if (error) throw new Error(translateNotificationError(error.message))
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false)

  if (error) throw new Error(translateNotificationError(error.message))
}

export async function generateOverdueNotifications(branchId?: string | null): Promise<number> {
  const { data, error } = await supabase.rpc('generate_overdue_notifications', {
    p_branch_id: branchId ?? null,
  })

  if (error) throw new Error(translateNotificationError(error.message))
  return Number(data ?? 0)
}
