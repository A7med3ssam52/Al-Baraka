import { supabase } from '@/lib/supabase'

import type { NotificationRecord } from './types'

export async function fetchNotifications(limit = 50): Promise<NotificationRecord[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as NotificationRecord[]
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)

  if (error) throw new Error(error.message)
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false)

  if (error) throw new Error(error.message)
}

export async function generateOverdueNotifications(branchId?: string | null): Promise<number> {
  const { data, error } = await supabase.rpc('generate_overdue_notifications', {
    p_branch_id: branchId ?? null,
  })

  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}
