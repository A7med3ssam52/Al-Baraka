import { Eye, EyeOff, LoaderCircle, LogIn } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { APP_INFO } from '@/lib/constants'
import { AuthLayout } from '@/features/auth/components/auth-layout'
import { useAuth } from '@/features/auth/use-auth'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const rawFrom = (location.state as { from?: string } | null)?.from
  const from = rawFrom?.startsWith('/') ? rawFrom : '/'
  const resetSuccess = searchParams.get('reset') === 'success'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const result = await signIn(email.trim(), password)

    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    navigate(from, { replace: true })
  }

  return (
    <AuthLayout
      title="تسجيل الدخول"
      description="أدخل بيانات حسابك للوصول إلى نظام إدارة معرض البركة."
      footer={
        <>
          الحساب يُنشأ بواسطة مدير النظام. للاستفسار تواصل مع{' '}
          <span className="font-bold text-foreground">{APP_INFO.contacts[0].name}</span>.
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {resetSuccess ? (
          <div
            role="status"
            className="rounded-lg border border-success/20 bg-success/5 p-3 text-sm font-semibold leading-6 text-success"
          >
            تم تغيير كلمة المرور بنجاح. سجّل الدخول بكلمة المرور الجديدة.
          </div>
        ) : null}

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
            aria-invalid={Boolean(error)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="password" className="text-sm font-bold">
              كلمة المرور
            </label>
            <Link
              to="/forgot-password"
              className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
            >
              نسيت كلمة المرور؟
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              className="pe-11"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              aria-invalid={Boolean(error)}
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

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? <LoaderCircle className="animate-spin" /> : <LogIn />}
          {submitting ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}
        </Button>
      </form>
    </AuthLayout>
  )
}
