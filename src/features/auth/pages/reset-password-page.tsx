import { ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthLoadingScreen } from '@/features/auth/components/auth-loading-screen'
import { AuthLayout } from '@/features/auth/components/auth-layout'
import { translateAuthError } from '@/features/auth/auth-errors'
import { useAuth } from '@/features/auth/use-auth'
import { supabase } from '@/lib/supabase'

export function ResetPasswordPage() {
  const { user, loading, signOut } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('كلمة المرور يجب ألا تقل عن 8 أحرف.')
      return
    }

    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.')
      return
    }

    setSubmitting(true)

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setSubmitting(false)
      setError(translateAuthError(updateError.message))
      return
    }

    await signOut()
    setSubmitting(false)
    navigate('/login?reset=success', { replace: true })
  }

  if (loading) return <AuthLoadingScreen />

  if (!user) {
    return (
      <AuthLayout
        title="رابط غير صالح"
        description="رابط إعادة تعيين كلمة المرور غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا."
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
        <Button asChild className="w-full">
          <Link to="/forgot-password">
            <KeyRound />
            طلب رابط جديد
          </Link>
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="تعيين كلمة مرور جديدة"
      description="اختر كلمة مرور قوية لا تقل عن 8 أحرف، ثم سجّل الدخول بها."
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
          <label htmlFor="password" className="text-sm font-bold">
            كلمة المرور الجديدة
          </label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="8 أحرف على الأقل"
              className="pe-11"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
              autoFocus
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute end-1 top-1/2 -translate-y-1/2"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="confirm-password" className="text-sm font-bold">
            تأكيد كلمة المرور
          </label>
          <Input
            id="confirm-password"
            name="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="أعد كتابة كلمة المرور"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={8}
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
          {submitting ? 'جارٍ حفظ كلمة المرور...' : 'حفظ كلمة المرور'}
        </Button>
      </form>
    </AuthLayout>
  )
}
