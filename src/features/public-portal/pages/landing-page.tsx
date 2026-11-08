import { CreditCard, LoaderCircle, Lock, Search } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/use-auth'

import { lookupPortal } from '../api'
import {
  normalizeNationalIdInput,
  savePortalSession,
  validateMobileBasic,
  validateNationalIdBasic,
} from '../types'
import type { PortalLookupKind, PortalMatch } from '../types'

export function LandingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [kind, setKind] = useState<PortalLookupKind>('national_id')
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [matches, setMatches] = useState<PortalMatch[]>([])
  const [nidForDisambiguation, setNidForDisambiguation] = useState('')

  async function handleLookup(rawValue: string, lookupKind: PortalLookupKind) {
    setError(null)
    setMatches([])
    setSubmitting(true)
    try {
      const snapshot = await lookupPortal({ kind: lookupKind, value: rawValue })
      if (snapshot.found && snapshot.customer) {
        savePortalSession({ kind: lookupKind, value: rawValue })
        navigate('/portal', { replace: true })
        return
      }
      if (snapshot.reason === 'multiple_matches' && snapshot.matches.length > 0) {
        setMatches(snapshot.matches)
        setError('يوجد أكثر من عميل مسجل بهذا الموبايل. أدخل الرقم القومي الخاص بك لإتمام التحقق.')
        return
      }
      setError(
        'لم يتم العثور على حساب بهذا الرقم. تحقق من الرقم أو تواصل مع فرع صان الحجر.',
      )
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر الاستعلام. حاول مرة أخرى.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = value.trim()
    if (kind === 'national_id') {
      const message = validateNationalIdBasic(trimmed)
      if (message) {
        setError(message)
        return
      }
      void handleLookup(normalizeNationalIdInput(trimmed), 'national_id')
    } else {
      const message = validateMobileBasic(trimmed)
      if (message) {
        setError(message)
        return
      }
      void handleLookup(trimmed, 'mobile')
    }
  }

  function handleDisambiguate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = validateNationalIdBasic(nidForDisambiguation)
    if (message) {
      setError(message)
      return
    }
    setMatches([])
    void handleLookup(normalizeNationalIdInput(nidForDisambiguation), 'national_id')
  }

  function switchKind(next: PortalLookupKind) {
    setKind(next)
    setError(null)
    setMatches([])
    setValue('')
  }

  return (
    <div dir="rtl" className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b bg-[#0b1f33] text-white">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-3" aria-label="معرض البركة — الرئيسية">
            <img
              src="/logo.PNG"
              alt="معرض البركة للتجارة"
              className="h-10 w-10 rounded-full border-2 border-[#c8a24a] bg-black object-cover"
            />
            <span className="leading-tight">
              <span className="block text-xl font-extrabold text-[#c8a24a]">البركة</span>
              <span className="block text-[11px] text-white/70">للتجارة</span>
            </span>
          </Link>
          <Link
            to={user ? '/dashboard' : '/login'}
            className="ms-auto rounded-md px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
          >
            {user ? 'لوحة تحكم الموظفين' : 'دخول الموظفين'}
          </Link>
        </div>
      </header>

      {/* Hero + Inquiry — مبسّطة */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto w-full max-w-xl text-center">
          <h1 className="text-3xl font-extrabold leading-snug text-[#0b1f33] sm:text-4xl">
            استعلام عن كشف الحساب
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
            أدخل الرقم القومي أو رقم الموبايل لعرض كشف حسابك فقط.
          </p>
          <p className="mt-2 text-sm font-bold text-[#0b1f33]">اختيارك الأفضل ... طريقك أسهل</p>
        </div>

        <Card id="inquiry" className="mx-auto mt-8 w-full max-w-xl scroll-mt-24 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-[#0b1f33]">
            <Search className="size-5" /> الاستعلام عن كشف الحساب
          </h2>

          <div role="tablist" aria-label="طريقة البحث" className="mt-4 grid grid-cols-2 gap-1 rounded-lg border bg-card p-1 text-sm">
            <button
              type="button"
              role="tab"
              aria-selected={kind === 'national_id'}
              onClick={() => switchKind('national_id')}
              className={`rounded-md px-3 py-2 font-bold transition-colors ${kind === 'national_id' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              الرقم القومي
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={kind === 'mobile'}
              onClick={() => switchKind('mobile')}
              className={`rounded-md px-3 py-2 font-bold transition-colors ${kind === 'mobile' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              رقم الموبايل
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
            {kind === 'national_id' ? (
              <label className="grid gap-1.5 text-sm">
                <span className="font-bold">الرقم القومي (١٤ رقمًا) *</span>
                <Input
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="off"
                  className="text-left font-mono text-base"
                  placeholder="30001011234567"
                  value={value}
                  onChange={(event) => setValue(normalizeNationalIdInput(event.target.value))}
                  required
                  aria-invalid={Boolean(error)}
                  aria-describedby="inquiry-help"
                />
              </label>
            ) : (
              <label className="grid gap-1.5 text-sm">
                <span className="font-bold">رقم الموبايل *</span>
                <Input
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="tel"
                  className="text-left font-mono text-base"
                  placeholder="010xxxxxxxx"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  required
                  aria-invalid={Boolean(error)}
                  aria-describedby="inquiry-help"
                />
              </label>
            )}
            <p id="inquiry-help" className="text-[11px] leading-5 text-muted-foreground">
              {kind === 'national_id'
                ? 'اكتب الرقم كاملًا بلا مسافات.'
                : 'أدخل الموبايل الأساسي المسجل بالعقد (010 / 011 / 012 / 015).'}
            </p>

            {error ? (
              <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm font-semibold leading-7 text-destructive">
                {error}
              </p>
            ) : null}

            {matches.length > 0 ? (
              <div className="rounded-lg border p-3">
                <p className="text-xs font-bold">هؤلاء العملاء يستخدمون الرقم الذي أدخلته:</p>
                <ul className="mt-2 grid gap-1 text-xs">
                  {matches.map((match) => (
                    <li key={match.id} className="flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5">
                      <span className="font-mono">{match.code}</span>
                      <span className="font-bold">{match.full_name}</span>
                    </li>
                  ))}
                </ul>
                <form onSubmit={handleDisambiguate} className="mt-3 grid gap-2">
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-bold">أدخل رقمك القومي للتأكيد</span>
                    <Input
                      dir="ltr"
                      inputMode="numeric"
                      className="text-left font-mono"
                      placeholder="14 رقمًا"
                      value={nidForDisambiguation}
                      onChange={(event) => setNidForDisambiguation(normalizeNationalIdInput(event.target.value))}
                      required
                    />
                  </label>
                  <Button type="submit" size="sm" disabled={submitting}>
                    {submitting ? <LoaderCircle className="animate-spin" /> : <Search />}
                    تأكيد وعرض كشف الحساب
                  </Button>
                </form>
              </div>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? <LoaderCircle className="animate-spin" /> : <CreditCard />}
              {submitting ? 'جارٍ البحث…' : 'عرض كشف الحساب'}
            </Button>
          </form>

          <p className="mt-4 flex items-start gap-2 text-[11px] leading-6 text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0" />
            العرض للقراءة فقط. عند وجود أي اختلاف تواصل مع الفرع مباشرة.
          </p>
        </Card>

        <p className="mx-auto mt-6 max-w-xl text-center text-xs leading-6 text-muted-foreground">
          معرض البركة للتجارة • الشرقية — صان الحجر — بجوار مركز الشرطة
        </p>
      </main>

      <footer className="border-t bg-[#0b1f33] text-white">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-center gap-2 px-4 py-4 text-xs sm:px-6">
          <span className="font-bold text-[#c8a24a]">معرض البركة للتجارة</span>
          <span className="text-white/60">• تكاتك - موتوسيكلات - تروسيكلات - اسكوتر</span>
        </div>
      </footer>
    </div>
  )
}
