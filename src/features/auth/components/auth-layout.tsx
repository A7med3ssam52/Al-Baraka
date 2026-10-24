import { BarChart3, Bike, ShieldCheck, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'

import { Card } from '@/components/ui/card'
import { APP_INFO } from '@/lib/constants'

interface AuthLayoutProps {
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}

const features = [
  {
    icon: ShieldCheck,
    title: 'وصول آمن',
    description: 'جلسات محمية وصلاحيات دقيقة لكل مستخدم.',
  },
  {
    icon: BarChart3,
    title: 'قرارات أوضح',
    description: 'المبيعات والأقساط والمخزون في مكان واحد.',
  },
  {
    icon: Bike,
    title: 'مخزون منظم',
    description: 'كل وحدة بحالتها وتكلفتها ومستنداتها.',
  },
  {
    icon: Wallet,
    title: 'خزنة مضبوطة',
    description: 'حركة نقدية وبنكية قابلة للمراجعة.',
  },
]

export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative overflow-hidden bg-primary px-6 py-9 text-primary-foreground sm:px-10 lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-12">
        <div className="pointer-events-none absolute -top-24 -start-24 size-72 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-32 -end-20 size-80 rounded-full bg-accent/10 blur-2xl" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-accent/40 bg-white/5 text-2xl font-extrabold text-accent">
              ب
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.22em] text-sidebar-muted">
                AL BARAKA
              </p>
              <p className="text-xl font-extrabold">{APP_INFO.name}</p>
            </div>
          </div>

          <h1 className="mt-8 max-w-lg text-3xl font-extrabold leading-[1.25] text-balance sm:text-4xl">
            إدارة المعرض بثقة ووضوح.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-8 text-sidebar-muted">
            {APP_INFO.tagline} — {APP_INFO.branch.name}.
          </p>

          <div className="mt-8 hidden max-w-lg gap-3 sm:grid sm:grid-cols-2">
            {features.map(
              ({ icon: Icon, title: featureTitle, description: featureDescription }) => (
                <div
                  key={featureTitle}
                  className="rounded-xl border border-white/10 bg-white/5 p-3.5"
                >
                  <Icon className="size-4 text-accent" />
                  <p className="mt-2 text-sm font-bold">{featureTitle}</p>
                  <p className="mt-1 text-[11px] leading-6 text-sidebar-muted">
                    {featureDescription}
                  </p>
                </div>
              ),
            )}
          </div>
        </div>

        <div className="relative mt-8 hidden border-t border-white/10 pt-5 text-[11px] leading-7 text-sidebar-muted sm:block">
          <p>{APP_INFO.branch.address}</p>
          <p className="mt-1">
            للاستفسار: {APP_INFO.contacts[0].name} —{' '}
            <span dir="ltr">{APP_INFO.contacts[0].phones[0]}</span>
          </p>
        </div>
      </section>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8 lg:min-h-screen">
        <div className="w-full max-w-md">
          <Card className="p-6 shadow-lg shadow-primary/5 sm:p-8">
            <div className="mb-6">
              <p className="text-[10px] font-extrabold tracking-[0.18em] text-accent-strong uppercase">
                AL BARAKA
              </p>
              <h2 className="mt-2 text-2xl font-extrabold text-balance">{title}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{description}</p>
            </div>
            {children}
          </Card>

          {footer ? (
            <div className="mt-5 text-center text-xs leading-6 text-muted-foreground">{footer}</div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
