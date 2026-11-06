import { ArrowLeft, Bike, Building2, CreditCard, FileText, LoaderCircle, Lock, Phone, Search, ShieldCheck, UserRound } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { APP_INFO } from '@/lib/constants'
import { formatMobileDisplay } from '@/features/customers/types'
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
    <div dir="rtl" className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-[#0b1f33] text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-3" aria-label="معرض البركة — الرئيسية">
            <img
              src="/logo.PNG"
              alt="معرض البركة للتجارة"
              className="h-12 w-12 rounded-full border-2 border-[#c8a24a] bg-black object-cover"
            />
            <span className="leading-tight">
              <span className="block text-xs text-[#c8a24a]">معرض</span>
              <span className="block text-xl font-extrabold text-[#c8a24a]">البركة</span>
              <span className="block text-[11px] text-white/70">للتجارة</span>
            </span>
          </Link>
          <nav aria-label="روابط سريعة" className="ms-auto flex flex-wrap items-center gap-1 text-sm">
            <Link to={user ? '/dashboard' : '/login'} className="rounded-md px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white">
              {user ? 'لوحة تحكم الموظفين' : 'دخول الموظفين'}
            </Link>
            <a href="#inquiry" className="rounded-md bg-[#c8a24a] px-3 py-2 font-bold text-[#0b1f33] hover:bg-[#d8b35c]">
              الاستعلام عن الأقساط
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Badge variant="accent" className="mb-4">تكاتك • موتوسيكلات • تروسيكلات • اسكوتر</Badge>
            <h1 className="text-3xl font-extrabold leading-snug text-[#0b1f33] sm:text-4xl">
              الاستعلام عن أقساطك في ثوانٍ
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-8 text-muted-foreground sm:text-base">
              أدخل الرقم القومي أو رقم الموبايل الخاص بك لمتابعة أقساطك وكشف حسابك وبياناتك
              لحظة بلحظة — دون الحاجة لزيارة الفرع.
            </p>
            <p className="mt-2 text-sm font-bold italic text-[#0b1f33]">اختيارك الأفضل ... طريقك أسهل</p>

            <ul className="mt-6 grid gap-2 text-sm">
              {[
                'البيانات الشخصية، الملاحظات، جهات التواصل والضامنون.',
                'جدول الأقساط بالكامل: المدفوع والمتبقي والمتأخر.',
                'كشف الحساب وقائمة المستندات المسجلة — عرض فقط للقراءة.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <ShieldCheck className="mt-1 size-4 shrink-0 text-success" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <Card id="inquiry" className="scroll-mt-24 p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#0b1f33]">
              <Search className="size-5" /> الاستعلام عن القسط
            </h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              اختر طريقة البحث وأدخل الرقم بالكامل كما هو مسجل بالفرع.
            </p>

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
                  ? 'اكتب الرقم كاملًا بلا مسافات. الرقم القومي أدق وسأسرع بالبحث.'
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
                      تأكيد وعرض الحساب
                    </Button>
                  </form>
                </div>
              ) : null}

              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? <LoaderCircle className="animate-spin" /> : <CreditCard />}
                {submitting ? 'جارٍ البحث…' : 'عرض أقساطي وكشف حسابي'}
              </Button>
            </form>

            <p className="mt-4 flex items-start gap-2 text-[11px] leading-6 text-muted-foreground">
              <Lock className="mt-0.5 size-3.5 shrink-0" />
              البيانات المعروضة للقراءة فقط ولا يمكن تعديلها من هنا. عند وجود أي اختلاف تواصل
              مع الفرع مباشرة.
            </p>
          </Card>
        </div>
      </section>

      {/* Steps */}
      <section className="border-b bg-card/60">
        <div className="mx-auto grid w-full max-w-6xl gap-3 px-4 py-10 sm:grid-cols-3 sm:px-6">
          {[
            { icon: Search, title: '١. أدخل الرقم', desc: 'الرقم القومي (١٤ رقمًا) أو الموبايل المسجل بالعقد.' },
            { icon: UserRound, title: '٢. افتح لوحة حسابك', desc: 'قائمة جانبية: بياناتك، أقساطك، مستنداتك وكشف حسابك.' },
            { icon: FileText, title: '٣. تابع أولًا بأول', desc: 'اعرف المدفوع والمتبقي والمتأخر وتاريخ القسط القادم.' },
          ].map((step) => (
            <Card key={step.title} className="p-5">
              <step.icon className="size-5 text-[#0b1f33]" />
              <h3 className="mt-3 font-bold">{step.title}</h3>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">{step.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-extrabold text-[#0b1f33]">
              <Building2 className="size-5" /> فرعنا
            </h2>
            <p className="mt-2 text-sm leading-7">{APP_INFO.branch.address}</p>
            <p className="text-xs text-muted-foreground">محافظة الشرقية — مركز صان الحجر — بجوار مركز الشرطة</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="accent"><Bike className="size-3" /> تكاتك - موتوسيكلات - تروسيكلات - اسكوتر</Badge>
              <Badge variant="outline">للتجارة</Badge>
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-extrabold text-[#0b1f33]">
              <Phone className="size-5" /> تواصل معنا
            </h2>
            <ul className="mt-3 grid gap-3 text-sm">
              {APP_INFO.contacts.map((contact) => (
                <li key={contact.name} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                  <span className="font-bold">{contact.name}</span>
                  <span className="ms-auto flex flex-wrap gap-2">
                    {contact.phones.map((phone) => (
                      <a
                        key={phone}
                        href={`tel:${phone}`}
                        dir="ltr"
                        className="font-mono text-xs font-bold text-primary underline-offset-4 hover:underline"
                      >
                        {formatMobileDisplay(phone)}
                      </a>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-6 text-muted-foreground">
              ملاحظة: لا تشارك رقمك القومي مع أي شخص خارج الفرع. البيانات هنا للقراءة فقط.
            </p>
          </Card>
        </div>

        {user ? (
          <Card className="mt-4 flex flex-wrap items-center gap-3 p-4">
            <p className="text-sm font-bold">أنت مسجل كموظف. هل تريد فتح النظام الداخلي؟</p>
            <Link to="/dashboard" className="ms-auto inline-flex">
              <Button size="sm">فتح لوحة التحكم <ArrowLeft className="size-4" /></Button>
            </Link>
          </Card>
        ) : null}

        <div className="mt-6">
          <EmptyState
            icon={ShieldCheck}
            title="خصوصيتك محمية"
            description="البحث يتم برقم دقيق بالكامل — لا يوجد عرض لأسماء أو أرقام أخرى. سجلات التحقق محفوظة لمتابعة الاستخدام الآمن."
          />
        </div>
      </section>

      <footer className="border-t bg-[#0b1f33] text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-5 text-xs sm:px-6">
          <span className="font-bold text-[#c8a24a]">معرض البركة للتجارة</span>
          <span className="text-white/60">• الشرقية — صان الحجر — بجوار مركز الشرطة</span>
          <span className="ms-auto text-white/60">جميع البيانات للاطلاع فقط ولا تُعدّل من صفحة الاستعلام.</span>
        </div>
      </footer>
    </div>
  )
}
