import { Hash, LoaderCircle, Save } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useSettings } from '@/features/settings/use-settings'

import { updateSystemSettings } from '../api'
import { documentTypeLabels, documentTypes, type DocumentType } from '../types'

interface DocumentPrefixFormProps {
  canEdit: boolean
}

const defaultPrefixes: Record<DocumentType, string> = {
  sales_invoice: 'SAL',
  purchase_invoice: 'PUR',
  contract: 'CON',
  receipt: 'REC',
  payment: 'PAY',
  journal_entry: 'JV',
}

function currentYear() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
  }).format(new Date())
}

function buildSample(prefix: string) {
  return `${prefix || '---'}-${currentYear()}-00001`
}

function initialPrefixes(prefixes: Record<DocumentType, string>) {
  return documentTypes.reduce<Record<DocumentType, string>>(
    (result, type) => {
      result[type] = prefixes[type] ?? defaultPrefixes[type]
      return result
    },
    { ...defaultPrefixes },
  )
}

export function DocumentPrefixForm({ canEdit }: DocumentPrefixFormProps) {
  const { settings, loading, usingFallback, refresh } = useSettings()
  const [prefixes, setPrefixes] = useState<Record<DocumentType, string>>(() =>
    initialPrefixes(settings.document_prefixes),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const settingsReady = !usingFallback
  const formDisabled = !canEdit || submitting || !settingsReady

  const handlePrefixChange = (type: DocumentType, value: string) => {
    const normalized = value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6)
    setPrefixes((current) => ({ ...current, [type]: normalized }))
  }

  const handleSave = async () => {
    setError(null)

    const invalidType = documentTypes.find((type) => !/^[A-Z0-9]{2,6}$/.test(prefixes[type]))
    if (invalidType) {
      setError(
        `بادئة «${documentTypeLabels[invalidType]}» يجب أن تكون من 2 إلى 6 أحرف لاتينية أو أرقام.`,
      )
      return
    }

    setSubmitting(true)

    try {
      await updateSystemSettings({
        app_name: settings.app_name,
        logo_url: settings.logo_url,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        tax_number: settings.tax_number,
        currency: settings.currency,
        timezone: settings.timezone,
        document_prefixes: prefixes,
        default_discount_limit: settings.default_discount_limit,
      })
      await refresh()
      toast.success('تم حفظ بادئات المستندات وتحديث مسلسلات الترقيم.')
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'تعذر حفظ بادئات المستندات. حاول مرة أخرى.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Hash className="size-4 text-accent-foreground" />
            بادئات المستندات
          </CardTitle>
          <CardDescription className="mt-1.5">
            البادئة تُطبَّق على كل الفروع، ولكل فرع وسنة مسلسل مستقل يبدأ من 00001. تغيير البادئة لا
            يعيد ترقيم المستندات السابقة.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documentTypes.map((type) => (
            <div key={type} className="space-y-1.5">
              <label htmlFor={`prefix-${type}`} className="text-xs font-bold">
                {documentTypeLabels[type]}
              </label>
              <Input
                id={`prefix-${type}`}
                value={prefixes[type]}
                onChange={(event) => handlePrefixChange(type, event.target.value)}
                dir="ltr"
                maxLength={6}
                className="font-mono tracking-widest"
                disabled={formDisabled}
                aria-describedby={`prefix-hint-${type}`}
              />
              <p id={`prefix-hint-${type}`} className="text-[10px] text-muted-foreground">
                مثال: {buildSample(prefixes[type])}
              </p>
            </div>
          ))}
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-semibold leading-6 text-destructive"
          >
            {error}
          </p>
        ) : null}

        {!canEdit ? (
          <p className="rounded-lg border border-border bg-muted/50 p-3 text-xs leading-6 text-muted-foreground">
            لديك صلاحية عرض الإعدادات فقط. تعديل البادئات يتطلب صلاحية
            <span className="mx-1 font-mono text-[10px]">settings.update</span>.
          </p>
        ) : null}

        {usingFallback && !loading ? (
          <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-semibold leading-6 text-destructive">
            تعذر تحميل الإعدادات المحفوظة، لذلك تم تعطيل الحفظ لتجنب استبدال البادئات الحقيقية بقيم
            افتراضية.
          </p>
        ) : null}
      </CardContent>

      {canEdit ? (
        <CardFooter className="justify-end">
          <Button type="button" onClick={() => void handleSave()} disabled={formDisabled}>
            {submitting ? <LoaderCircle className="animate-spin" /> : <Save />}
            {submitting ? 'جارٍ الحفظ...' : 'حفظ البادئات'}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}
