import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthLayout } from '@/features/auth/components/auth-layout'
import { getRoleLabel } from '@/features/auth/roles'
import { useAuth } from '@/features/auth/use-auth'
import { formatDateTime } from '@/lib/utils'

import {
  acceptStaffInvitation,
  fetchStaffInvitationPreview,
  translateUserError,
  verifyStaffInvitation,
} from '../api'
import type { InvitationStatus, StaffInvitationPreview } from '../types'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const statusMessages: Record<InvitationStatus, { title: string; description: string }> = {
  pending: {
    title: 'الدعوة جاهزة',
    description: 'أكمل بياناتك لتفعيل حسابك.',
  },
  processing: {
    title: 'الدعوة قيد الاستخدام',
    description: 'يبدو أن الرابط مفتوح في نافذة أخرى. انتظر خمس دقائق ثم أعد المحاولة.',
  },
  accepted: {
    title: 'تم استخدام الدعوة',
    description: 'هذا الرابط مستخدم بالفعل. سجّل الدخول بحسابك أو تواصل مع المدير.',
  },
  cancelled: {
    title: 'الدعوة ملغاة',
    description: 'ألغى المدير هذه الدعوة. تواصل معه لإرسال دعوة جديدة.',
  },
  expired: {
    title: 'انتهت صلاحية الدعوة',
    description: 'صلاحية الرابط سبعة أيام فقط. اطلب من المدير إنشاء رابط جديد.',
  },
  locked: {
    title: 'الدعوة مقفلة',
    description: 'تم قفل الدعوة بعد محاولات تحقق خاطئة متعددة. اطلب من المدير إنشاء رابط جديد.',
  },
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function InvitationSummary({ preview }: { preview: StaffInvitationPreview }) {
  return (
    <div className="mb-5 space-y-3 rounded-xl border border-border bg-muted/40 p-4 text-xs">
      <div>
        <p className="text-[10px] font-bold tracking-wide text-muted-foreground">الدعوة باسم</p>
        <p className="mt-0.5 text-base font-extrabold">{preview.full_name}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground">رقم الهاتف</p>
          <p className="mt-0.5 font-mono font-bold" dir="ltr">
            {preview.phone_masked}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-muted-foreground">صلاحية الرابط</p>
          <p className="mt-0.5 flex items-center gap-1 font-semibold">
            <Clock className="size-3.5" />
            {formatDateTime(preview.expires_at)}
          </p>
        </div>
      </div>
      <div>
        <p className="text-[10px] font-bold text-muted-foreground">الأدوار</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {(preview.roles ?? []).map((role) => (
            <Badge
              key={role.code}
              variant={role.code === preview.primary_role ? 'accent' : 'outline'}
            >
              {getRoleLabel(role.code)}
            </Badge>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-bold text-muted-foreground">الفروع</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {(preview.branches ?? []).map((branch) => (
            <Badge key={branch.id} variant="secondary" className="font-mono">
              {branch.code}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  )
}

export function AcceptInvitationPage() {
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { signIn } = useAuth()

  const [loadedToken, setLoadedToken] = useState<string | null>(null)
  const [preview, setPreview] = useState<StaffInvitationPreview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [step, setStep] = useState<'phone' | 'account'>('phone')
  const [phone, setPhone] = useState('')
  const [verifiedPhone, setVerifiedPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true

    fetchStaffInvitationPreview(token)
      .then((result) => {
        if (!active) return
        setPreview(result)
        setLoadError(null)
      })
      .catch((fetchError: unknown) => {
        if (!active) return
        setLoadError(
          fetchError instanceof Error
            ? fetchError.message
            : translateUserError('invitation_not_found'),
        )
      })
      .finally(() => {
        if (active) setLoadedToken(token)
      })

    return () => {
      active = false
    }
  }, [token])

  // Derived so a token change shows the loader without a setState in the effect.
  const loading = loadedToken !== token

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const normalized = normalizePhone(phone)
    if (normalized.length < 10 || normalized.length > 15) {
      setError('أدخل رقم الهاتف المسجل في الدعوة (10 إلى 15 رقمًا).')
      return
    }

    setSubmitting(true)

    try {
      const result = await verifyStaffInvitation(token, normalized)

      if (result.ok) {
        setPreview(result)
        setVerifiedPhone(normalized)
        setStep('account')
        return
      }

      const code = result.error ?? 'invalid_phone'
      const remaining = result.attempts_remaining

      if (code === 'invalid_phone' && typeof remaining === 'number') {
        setError(`${translateUserError(code)} المحاولات المتبقية: ${remaining}.`)
      } else {
        setError(translateUserError(code))
      }

      if (
        code === 'invitation_locked' ||
        code === 'invitation_expired' ||
        code === 'invitation_cancelled' ||
        code === 'invitation_used'
      ) {
        const nextPreview = await fetchStaffInvitationPreview(token)
        setPreview(nextPreview)
      }
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : translateUserError('invitation_not_found'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleAccept = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const normalizedEmail = email.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError('صيغة البريد الإلكتروني غير صحيحة.')
      return
    }

    if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل.')
      return
    }

    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.')
      return
    }

    setSubmitting(true)

    try {
      await acceptStaffInvitation({
        token,
        phone: verifiedPhone,
        email: normalizedEmail,
        password,
      })

      const signInResult = await signIn(normalizedEmail, password)
      if (signInResult.error) {
        setDone(true)
        return
      }

      navigate('/', { replace: true })
    } catch (acceptError) {
      setError(
        acceptError instanceof Error
          ? acceptError.message
          : translateUserError('acceptance_failed'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const status = preview?.status ?? null
  const blockedMessage =
    status && !preview?.can_accept && status !== 'pending' ? statusMessages[status] : null

  if (loading) {
    return (
      <AuthLayout title="جارٍ التحقق من الدعوة" description="نحمّل تفاصيل الدعوة المرتبطة بالرابط.">
        <div className="flex items-center justify-center py-10" role="status" aria-live="polite">
          <LoaderCircle className="size-8 animate-spin text-accent-strong" />
        </div>
      </AuthLayout>
    )
  }

  if (loadError || !preview) {
    return (
      <AuthLayout
        title="دعوة غير صالحة"
        description="الرابط غير صحيح أو لم يعد موجودًا. تأكد من نسخ الرابط كاملًا من رسالة المدير."
        footer={
          <Link to="/login" className="font-bold text-accent-strong hover:underline">
            العودة لتسجيل الدخول
          </Link>
        }
      >
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm leading-7 text-destructive">
          <AlertTriangle className="mt-1 size-5 shrink-0" />
          <p>{loadError ?? translateUserError('invitation_not_found')}</p>
        </div>
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout
        title="تم إنشاء حسابك"
        description="يمكنك الآن تسجيل الدخول بالبريد الإلكتروني وكلمة المرور اللذين اخترتهما."
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-success/20 bg-success/5 p-4 text-sm leading-7 text-success">
            <CheckCircle2 className="mt-1 size-5 shrink-0" />
            <p>الحساب جاهز. سجّل الدخول للمتابعة إلى النظام.</p>
          </div>
          <Button type="button" className="w-full" onClick={() => navigate('/login')}>
            الانتقال لتسجيل الدخول
          </Button>
        </div>
      </AuthLayout>
    )
  }

  if (blockedMessage) {
    return (
      <AuthLayout
        title={blockedMessage.title}
        description={blockedMessage.description}
        footer={
          <Link to="/login" className="font-bold text-accent-strong hover:underline">
            العودة لتسجيل الدخول
          </Link>
        }
      >
        <div className="space-y-4">
          <InvitationSummary preview={preview} />
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm leading-7 text-warning">
            <LockKeyhole className="mt-1 size-5 shrink-0" />
            <p>لا يمكن استخدام هذا الرابط. تواصل مع مدير المعرض للحصول على دعوة جديدة.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => window.location.reload()}
          >
            إعادة التحقق
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={step === 'phone' ? 'تأكيد رقم الهاتف' : 'إكمال إنشاء الحساب'}
      description={
        step === 'phone'
          ? 'لحماية الدعوة، أدخل رقم الهاتف الذي أرسله لك المدير. الدعوة مرتبطة بهذا الرقم.'
          : 'اختر بريدك الإلكتروني وكلمة مرور قوية. سيُستخدم البريد لتسجيل الدخول لاحقًا.'
      }
      footer={
        <Link to="/login" className="inline-flex items-center gap-1 font-bold text-accent-strong">
          <ArrowLeft className="size-3.5 rotate-180" />
          العودة لتسجيل الدخول
        </Link>
      }
    >
      <InvitationSummary preview={preview} />

      {step === 'phone' ? (
        <form className="space-y-4" onSubmit={handleVerify}>
          <div className="space-y-2">
            <label htmlFor="invite-phone" className="text-sm font-bold">
              رقم الهاتف
            </label>
            <div className="relative">
              <Smartphone className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="invite-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="01xxxxxxxxx"
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
                className="ps-9"
                autoFocus
                disabled={submitting}
              />
            </div>
            <p className="text-[11px] leading-6 text-muted-foreground">
              لديك {preview.attempts_remaining} محاولات متبقية. بعد استنفادها تُقفل الدعوة تلقائيًا.
            </p>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm font-semibold leading-6 text-destructive"
            >
              {error}
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
            تأكيد الرقم والمتابعة
          </Button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={handleAccept}>
          <div className="space-y-2">
            <label htmlFor="invite-email" className="text-sm font-bold">
              البريد الإلكتروني
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                dir="ltr"
                autoComplete="email"
                className="ps-9"
                autoFocus
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="invite-password" className="text-sm font-bold">
              كلمة المرور
            </label>
            <Input
              id="invite-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8 أحرف على الأقل"
              autoComplete="new-password"
              minLength={8}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="invite-confirm-password" className="text-sm font-bold">
              تأكيد كلمة المرور
            </label>
            <Input
              id="invite-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="أعد كتابة كلمة المرور"
              autoComplete="new-password"
              minLength={8}
              disabled={submitting}
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-[11px] leading-6 text-muted-foreground">
            <Building2 className="mt-0.5 size-4 shrink-0 text-accent-strong" />
            <span>
              سيتم ربط حسابك بالأدوار والفروع الموضحة أعلاه. تواصل مع المدير إذا كانت غير صحيحة.
            </span>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm font-semibold leading-6 text-destructive"
            >
              {error}
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}
            إنشاء الحساب والدخول
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
