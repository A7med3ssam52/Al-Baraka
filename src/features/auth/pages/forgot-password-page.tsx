import { ArrowRight, LoaderCircle, MailCheck, Send } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthLayout } from '@/features/auth/components/auth-layout'
import { translateAuthError } from '@/features/auth/auth-errors'
import { supabase } from '@/lib/supabase'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setSubmitting(false)

    if (resetError) {
      setError(translateAuthError(resetError.message))
      return
    }

    setSent(true)
  }

  return (
    <AuthLayout
      title="استعادة كلمة المرور"
      description="أدخل بريدك الإلكتروني وسنرسل لك رابطًا آمنًا لإعادة تعيين كلمة المرور."
      footer={
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline"
        >
          <ArrowRight className="size-3.5" />
          العودة إلى تسجيل الدخول
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-5">
          <div
            role="status"
            className="rounded-xl border border-success/20 bg-success/5 p-4 text-sm leading-7 text-success"
          >
            <div className="flex items-start gap-3">
              <MailCheck className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-bold">تم إرسال رابط إعادة التعيين.</p>
                <p className="mt-1 text-success/90">
                  راجع بريد <span className="font-mono text-xs">{email}</span> واتبع الرابط. قد
                  يستغرق البريد دقيقة أو دقيقتين.
                </p>
              </div>
            </div>
          </div>

          <Button asChild variant="outline" className="w-full">
            <Link to="/login">
              <ArrowRight />
              العودة إلى تسجيل الدخول
            </Link>
          </Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm font-semibold leading-6 text-destructive"
            >
              {error}
            </div>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-bold">
              البريد الإلكتروني
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="name@example.com"
              dir="ltr"
              className="text-start"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <LoaderCircle className="animate-spin" /> : <Send />}
            {submitting ? 'جارٍ إرسال الرابط...' : 'إرسال رابط إعادة التعيين'}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
