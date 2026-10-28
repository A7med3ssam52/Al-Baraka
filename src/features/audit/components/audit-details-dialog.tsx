import { Copy, History } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDateTime } from '@/lib/utils'

import { auditActionLabels, auditTableLabels, type AuditLogEntry } from '../types'

interface AuditDetailsDialogProps {
  entry: AuditLogEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function JsonBlock({ title, value }: { title: string; value: Record<string, unknown> | null }) {
  const text = value ? JSON.stringify(value, null, 2) : '—'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold">{title}</p>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard
                .writeText(text)
                .then(() => toast.success('تم نسخ البيانات.'))
                .catch(() => toast.error('تعذر النسخ. حدّد النص يدويًا.'))
            }}
          >
            <Copy />
            نسخ
          </Button>
        ) : null}
      </div>
      <pre
        dir="ltr"
        className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-start font-mono text-[11px] leading-5 text-foreground"
      >
        {text}
      </pre>
    </div>
  )
}

export function AuditDetailsDialog({ entry, open, onOpenChange }: AuditDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5 text-accent-foreground" />
            تفاصيل عملية المراجعة
          </DialogTitle>
          <DialogDescription>
            {entry
              ? `${auditActionLabels[entry.action] ?? entry.action} على ${
                  auditTableLabels[entry.table_name] ?? entry.table_name
                } — ${formatDateTime(entry.created_at)}`
              : 'بيانات العملية المسجلة.'}
          </DialogDescription>
        </DialogHeader>

        {entry ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-muted-foreground">المستخدم</dt>
                <dd className="mt-0.5 font-semibold">{entry.user_name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">الفرع</dt>
                <dd className="mt-0.5 font-semibold">
                  {entry.branch_name ?? 'إعداد عام'}
                  {entry.branch_id ? (
                    <span className="ms-1 font-mono text-[10px] text-muted-foreground">
                      ({entry.branch_id.slice(0, 8)})
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">النوع</dt>
                <dd className="mt-0.5">
                  <Badge variant="outline">{auditActionLabels[entry.action] ?? entry.action}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">الجدول</dt>
                <dd className="mt-0.5">
                  <Badge variant="secondary" className="font-mono">
                    {entry.table_name}
                  </Badge>
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">معرّف السجل</dt>
                <dd className="mt-0.5 break-all font-mono text-[10px]">{entry.record_id ?? '—'}</dd>
              </div>
            </dl>

            <JsonBlock title="البيانات قبل التغيير" value={entry.old_data} />
            <JsonBlock title="البيانات بعد التغيير" value={entry.new_data} />
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
