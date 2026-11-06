import { Bell, CheckCheck, CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { formatDateTime } from '@/lib/utils'

import {
  fetchNotifications,
  generateOverdueNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api'
import type { NotificationRecord, NotificationType } from '../types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUnreadChange?: (count: number) => void
}

const typeIcon: Record<NotificationType, typeof Info> = {
  info: Info,
  warning: TriangleAlert,
  error: CircleX,
  success: CircleCheck,
}

const typeClass: Record<NotificationType, string> = {
  info: 'text-sky-600 bg-sky-500/10',
  warning: 'text-amber-600 bg-amber-500/10',
  error: 'text-destructive bg-destructive/10',
  success: 'text-emerald-600 bg-emerald-500/10',
}

export function NotificationsCenter({ open, onOpenChange, onUnreadChange }: Props) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)

  const unread = notifications.filter((item) => !item.is_read).length

  const applyUnread = (rows: NotificationRecord[]) => {
    onUnreadChange?.(rows.filter((item) => !item.is_read).length)
  }

  const load = async () => {
    setLoading(true)
    try {
      await generateOverdueNotifications().catch(() => 0)
      const rows = await fetchNotifications(50)
      setNotifications(rows)
      applyUnread(rows)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل التنبيهات')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id)
      const rows = notifications.map((item) => (item.id === id ? { ...item, is_read: true } : item))
      setNotifications(rows)
      applyUnread(rows)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحديث التنبيه')
    }
  }

  const handleMarkAll = async () => {
    setMarkingAll(true)
    try {
      await markAllNotificationsRead()
      const rows = notifications.map((item) => ({ ...item, is_read: true }))
      setNotifications(rows)
      applyUnread(rows)
      toast.success('تم تعليم كل التنبيهات كمقروءة')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحديث التنبيهات')
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" className="w-full sm:max-w-md">
        <SheetHeader className="border-b border-border pb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <SheetTitle>مركز التنبيهات</SheetTitle>
              <SheetDescription>
                {unread > 0 ? `${unread} تنبيه غير مقروء` : 'لا توجد تنبيهات غير مقروءة'}
              </SheetDescription>
            </div>
            {unread > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleMarkAll()}
                disabled={markingAll}
              >
                <CheckCheck className="size-4" />
                تعليم الكل
              </Button>
            ) : null}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-full" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="لا توجد تنبيهات"
              description="ستظهر هنا تنبيهات الأقساط المتأخرة والعمليات المهمة."
            />
          ) : (
            <ul className="space-y-2">
              {notifications.map((item) => {
                const Icon = typeIcon[item.notification_type] ?? Info
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!item.is_read) void handleMarkRead(item.id)
                      }}
                      className={`w-full rounded-lg border p-3 text-start transition-colors hover:bg-muted/60 ${
                        item.is_read ? 'border-border/60 bg-card' : 'border-accent/40 bg-accent/5'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${typeClass[item.notification_type] ?? typeClass.info}`}>
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-bold">{item.title}</p>
                            {!item.is_read ? (
                              <span className="size-2 shrink-0 rounded-full bg-accent" />
                            ) : null}
                          </div>
                          {item.body ? (
                            <p className="mt-1 line-clamp-2 text-xs leading-6 text-muted-foreground">
                              {item.body}
                            </p>
                          ) : null}
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {formatDateTime(item.created_at)}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
