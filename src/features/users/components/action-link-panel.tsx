import { Check, Copy, Link2, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ActionLinkPanelProps {
  link: string
  title?: string
  description?: string
}

export function ActionLinkPanel({
  link,
  title = 'الرابط جاهز للإرسال',
  description,
}: ActionLinkPanelProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success('تم نسخ الرابط.')
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('تعذر النسخ تلقائيًا. حدد الرابط وانسخه يدويًا.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Link2 className="size-4 text-accent-strong" />
          {title}
        </div>
        {description ? (
          <p className="mt-1 text-xs leading-6 text-muted-foreground">{description}</p>
        ) : null}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            readOnly
            value={link}
            dir="ltr"
            aria-label="رابط الإجراء"
            className="font-mono text-xs"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleCopy()}
            className="shrink-0"
          >
            {copied ? <Check /> : <Copy />}
            {copied ? 'تم النسخ' : 'نسخ الرابط'}
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs leading-6 text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>
          هذا الرابط يمنح وصولًا لمرة واحدة. لا تشاركه في مجموعات عامة، وأرسله للمستخدم مباشرة.
        </span>
      </div>
    </div>
  )
}
