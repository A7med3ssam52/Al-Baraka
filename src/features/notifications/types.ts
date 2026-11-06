export type NotificationType = 'info' | 'warning' | 'error' | 'success'

export interface NotificationRecord {
  id: string
  user_id: string | null
  branch_id: string | null
  title: string
  body: string | null
  notification_type: NotificationType
  reference_type: string | null
  reference_id: string | null
  is_read: boolean
  created_at: string
}

export const notificationTypeLabels: Record<NotificationType, string> = {
  info: 'معلومة',
  warning: 'تحذير',
  error: 'خطأ',
  success: 'نجاح',
}
