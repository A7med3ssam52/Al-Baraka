import { KeyRound, LoaderCircle, LogOut, ShieldCheck, UploadCloud, UserRound } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
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
import { Separator } from '@/components/ui/separator'
import { getRoleLabel } from '@/features/auth/roles'
import { translateAuthError } from '@/features/auth/auth-errors'
import { useAuth } from '@/features/auth/use-auth'
import { APP_INFO } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import { cn, formatDate } from '@/lib/utils'

export function ProfilePage() {
  const { user, appUser, signOut } = useAuth()
  const navigate = useNavigate()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const displayName = appUser?.name ?? 'مستخدم'
  const initial = displayName.trim().charAt(0) || 'م'

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!user?.email) {
      setError('تعذر قراءة بريد الحساب. أعد تسجيل الدخول ثم حاول مرة أخرى.')
      return
    }

    if (newPassword.length < 8) {
      setError('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('كلمتا المرور الجديدتان غير متطابقتين.')
      return
    }

    setSubmitting(true)

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })

    if (verifyError) {
      setSubmitting(false)
      setError('كلمة المرور الحالية غير صحيحة.')
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })

    setSubmitting(false)

    if (updateError) {
      setError(translateAuthError(updateError.message))
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    toast.success('تم تغيير كلمة المرور بنجاح.')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="الحساب"
        title="الملف الشخصي"
        description="بيانات حسابك الحالي وإدارة كلمة المرور."
        actions={
          <Button variant="outline" onClick={() => void handleSignOut()}>
            <LogOut />
            تسجيل الخروج
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>بيانات الحساب</CardTitle>
              <CardDescription>هذه البيانات مرتبطة بجلسة الدخول الحالية.</CardDescription>
            </div>
            <Badge variant="success">نشط</Badge>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary text-2xl font-extrabold text-primary-foreground">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold">{displayName}</p>
                <p className="truncate text-sm text-muted-foreground" dir="ltr">
                  {appUser?.email || user?.email}
                </p>
              </div>
            </div>

            <Separator />

            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-muted/50 p-3">
                <dt className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                  <ShieldCheck className="size-3.5" />
                  الدور
                </dt>
                <dd className="mt-1.5 text-sm font-bold">{getRoleLabel(appUser?.role)}</dd>
              </div>

              <div className="rounded-lg bg-muted/50 p-3">
                <dt className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                  <UserRound className="size-3.5" />
                  الفرع
                </dt>
                <dd className="mt-1.5 text-sm font-bold">
                  {appUser?.branches.length
                    ? appUser.branches.map((branch) => `${branch.name} — ${branch.code}`).join('، ')
                    : `${APP_INFO.branch.name} — ${APP_INFO.branch.code}`}
                </dd>
              </div>

              <div className="rounded-lg bg-muted/50 p-3">
                <dt className="text-[11px] font-bold text-muted-foreground">آخر دخول</dt>
                <dd className="mt-1.5 text-sm font-bold">
                  {user?.last_sign_in_at ? formatDate(user.last_sign_in_at) : '—'}
                </dd>
              </div>

              <div className="rounded-lg bg-muted/50 p-3">
                <dt className="text-[11px] font-bold text-muted-foreground">حالة الحساب</dt>
                <dd
                  className={cn(
                    'mt-1.5 text-sm font-bold',
                    appUser?.isActive ? 'text-success' : 'text-destructive',
                  )}
                >
                  {appUser?.isActive ? 'نشط' : 'معطل'}
                </dd>
              </div>
            </dl>
          </CardContent>

          <CardFooter className="justify-between gap-3">
            <span className="text-xs leading-6 text-muted-foreground">
              لتعديل الاسم أو الدور تواصل مع مدير النظام.
            </span>
            <Button variant="outline" onClick={() => void handleSignOut()}>
              <LogOut />
              خروج
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>تغيير كلمة المرور</CardTitle>
              <CardDescription>أدخل كلمة المرور الحالية ثم اختر كلمة مرور جديدة.</CardDescription>
            </div>
            <KeyRound className="size-5 text-accent-strong" />
          </CardHeader>

          <CardContent>
            <form className="space-y-4" onSubmit={handleChangePassword}>
              {error ? (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm font-semibold leading-6 text-destructive"
                >
                  {error}
                </div>
              ) : null}

              <div className="space-y-2">
                <label htmlFor="current-password" className="text-sm font-bold">
                  كلمة المرور الحالية
                </label>
                <Input
                  id="current-password"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="new-password" className="text-sm font-bold">
                  كلمة المرور الجديدة
                </label>
                <Input
                  id="new-password"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="8 أحرف على الأقل"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="confirm-password" className="text-sm font-bold">
                  تأكيد كلمة المرور الجديدة
                </label>
                <Input
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
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
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>اختبار الرفع الآمن</CardTitle>
            <CardDescription>
              أداة مؤقتة للتحقق من رفع الصور عبر Cloudinary في M0.4.
            </CardDescription>
          </div>
          <Badge variant="warning">بيئة تجريبية</Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            يتحقق الاختبار من دورة الرفع الموقّعة عبر Edge Function دون تعريض API Secret في المتصفح.
          </p>
          <Button asChild variant="outline">
            <Link to="/upload-test">
              <UploadCloud />
              فتح اختبار الرفع
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
