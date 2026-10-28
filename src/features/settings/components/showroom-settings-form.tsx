import { LoaderCircle, RefreshCw, Save, Store } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
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
import { formatDateTime } from '@/lib/utils'

import { updateSystemSettings } from '../api'

interface ShowroomSettingsFormProps {
  canEdit: boolean
}

interface FormState {
  app_name: string
  logo_url: string
  address: string
  phone: string
  email: string
  tax_number: string
  default_discount_limit: string
}

function toFormState(settings: ReturnType<typeof useSettings>['settings']): FormState {
  return {
    app_name: settings.app_name,
    logo_url: settings.logo_url ?? '',
    address: settings.address ?? '',
    phone: settings.phone ?? '',
    email: settings.email ?? '',
    tax_number: settings.tax_number ?? '',
    default_discount_limit: String(settings.default_discount_limit ?? 0),
  }
}

function nullable(value: string) {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function ShowroomSettingsForm({ canEdit }: ShowroomSettingsFormProps) {
  const { settings, loading, usingFallback, refresh } = useSettings()
  const [form, setForm] = useState<FormState>(() => toFormState(settings))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const settingsReady = !usingFallback
  const formDisabled = !canEdit || submitting || !settingsReady

  const updateField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const appName = form.app_name.trim()
    if (appName.length < 2 || appName.length > 120) {
      setError('اسم المعرض يجب أن يكون بين حرفين و120 حرفًا.')
      return
    }

    const discountLimit = Number(form.default_discount_limit)
    if (!Number.isFinite(discountLimit) || discountLimit < 0) {
      setError('حد الخصم الافتراضي يجب أن يكون صفرًا أو أكثر.')
      return
    }

    setSubmitting(true)

    try {
      await updateSystemSettings({
        app_name: appName,
        logo_url: nullable(form.logo_url),
        address: nullable(form.address),
        phone: nullable(form.phone),
        email: nullable(form.email),
        tax_number: nullable(form.tax_number),
        currency: settings.currency,
        timezone: settings.timezone,
        document_prefixes: settings.document_prefixes,
        default_discount_limit: discountLimit,
      })
      await refresh()
      toast.success('تم حفظ بيانات المعرض وتحديث الواجهة.')
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'تعذر حفظ الإعدادات. تحقق من الاتصال وحاول مرة أخرى.',
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
            <Store className="size-4 text-accent-foreground" />
            بيانات المعرض
          </CardTitle>
          <CardDescription className="mt-1.5">
            تظهر هذه البيانات في الشريط الجانبي والعنوان والطباعة. حقول العملة والمنطقة الزمنية
            معتمدة على إعدادات النسخة الأولى.
          </CardDescription>
        </div>
        {loading && usingFallback ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <RefreshCw className="size-3.5 animate-spin" />
            جارٍ التحميل
          </span>
        ) : null}
      </CardHeader>

      <form onSubmit={(event) => void handleSubmit(event)}>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="settings-app-name" className="text-xs font-bold">
                اسم المعرض
              </label>
              <Input
                id="settings-app-name"
                value={form.app_name}
                onChange={(event) => updateField('app_name', event.target.value)}
                maxLength={120}
                required
                disabled={formDisabled}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="settings-logo-url" className="text-xs font-bold">
                رابط الشعار <span className="font-normal text-muted-foreground">(اختياري)</span>
              </label>
              <Input
                id="settings-logo-url"
                value={form.logo_url}
                onChange={(event) => updateField('logo_url', event.target.value)}
                placeholder="https://..."
                dir="ltr"
                maxLength={500}
                disabled={formDisabled}
              />
              <p className="text-[11px] leading-5 text-muted-foreground">
                يُفضّل رفع الشعار عبر Cloudinary ثم لصق الرابط هنا. اترك الحقل فارغًا لاستخدام
                الشعار النصي المؤقت.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-phone" className="text-xs font-bold">
                هاتف المعرض
              </label>
              <Input
                id="settings-phone"
                value={form.phone}
                onChange={(event) => updateField('phone', event.target.value)}
                placeholder="01000172840"
                dir="ltr"
                maxLength={20}
                disabled={formDisabled}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-email" className="text-xs font-bold">
                البريد الإلكتروني
              </label>
              <Input
                id="settings-email"
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="showroom@example.com"
                dir="ltr"
                maxLength={160}
                disabled={formDisabled}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="settings-address" className="text-xs font-bold">
                العنوان
              </label>
              <Input
                id="settings-address"
                value={form.address}
                onChange={(event) => updateField('address', event.target.value)}
                placeholder="محافظة الشرقية — مركز صان الحجر — بجوار مركز الشرطة"
                maxLength={300}
                disabled={formDisabled}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-tax-number" className="text-xs font-bold">
                الرقم الضريبي <span className="font-normal text-muted-foreground">(اختياري)</span>
              </label>
              <Input
                id="settings-tax-number"
                value={form.tax_number}
                onChange={(event) => updateField('tax_number', event.target.value)}
                dir="ltr"
                maxLength={50}
                disabled={formDisabled}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-discount-limit" className="text-xs font-bold">
                حد الخصم الافتراضي (ج.م)
              </label>
              <Input
                id="settings-discount-limit"
                type="number"
                min={0}
                step="0.01"
                value={form.default_discount_limit}
                onChange={(event) => updateField('default_discount_limit', event.target.value)}
                disabled={formDisabled}
              />
              <p className="text-[11px] leading-5 text-muted-foreground">
                الحد الذي يمكن لمندوب المبيعات تطبيقه دون موافقة إضافية.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-currency" className="text-xs font-bold">
                العملة
              </label>
              <Input id="settings-currency" value="جنيه مصري (EGP)" readOnly disabled />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-timezone" className="text-xs font-bold">
                المنطقة الزمنية
              </label>
              <Input id="settings-timezone" value="القاهرة (Africa/Cairo)" readOnly disabled />
            </div>
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
              لديك صلاحية عرض الإعدادات فقط. تعديل بيانات المعرض يتطلب صلاحية
              <span className="mx-1 font-mono text-[10px]">settings.update</span>.
            </p>
          ) : null}

          {usingFallback && !loading ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-semibold leading-6 text-destructive">
              تعذر تحميل الإعدادات المحفوظة، لذلك تم تعطيل الحفظ لتجنب استبدال البيانات الحقيقية
              بقيم افتراضية. أعد تحميل الصفحة أو تواصل مع مدير النظام.
            </p>
          ) : null}
        </CardContent>

        <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-[11px] text-muted-foreground">
            {settings.updated_at
              ? `آخر تحديث: ${formatDateTime(settings.updated_at)}`
              : 'لم تُسجل بيانات تحديث بعد.'}
          </p>
          {canEdit ? (
            <Button type="submit" disabled={formDisabled}>
              {submitting ? <LoaderCircle className="animate-spin" /> : <Save />}
              {submitting ? 'جارٍ الحفظ...' : 'حفظ البيانات'}
            </Button>
          ) : null}
        </CardFooter>
      </form>
    </Card>
  )
}
