import { APP_INFO, STAGE } from '@/lib/constants'
import { env, isCloudinaryConfigured, isSupabaseConfigured } from '@/lib/env'

const foundationChecks = [
  'React 19 + TypeScript + Vite 8',
  'ESLint 10 + Prettier',
  'هيكل مجلدات واضح وقابل للتوسع',
  'واجهة عربية RTL بخط Cairo',
  'التحقق من متغيرات البيئة عبر Zod',
]

export default function App() {
  const statusItems = [
    {
      label: 'Supabase',
      value: isSupabaseConfigured ? 'مهيأ' : 'بانتظار الإعداد',
      hint: isSupabaseConfigured ? 'Project URL + Publishable Key' : 'أضف القيم في .env.local',
      tone: isSupabaseConfigured ? 'success' : 'warning',
    },
    {
      label: 'Cloudinary',
      value: isCloudinaryConfigured ? 'مهيأ' : 'بانتظار الإعداد',
      hint: env.VITE_CLOUDINARY_CLOUD_NAME ?? 'أضف Cloud Name',
      tone: isCloudinaryConfigured ? 'success' : 'warning',
    },
    {
      label: 'المستودع',
      value: 'Al-Baraka',
      hint: 'A7med3ssam52/Al-Baraka',
      tone: 'success',
    },
    {
      label: 'الفرع',
      value: APP_INFO.branch.code,
      hint: APP_INFO.branch.name,
      tone: 'success',
    },
  ] as const

  return (
    <div className="app">
      <div className="app__glow app__glow--start" aria-hidden="true" />
      <div className="app__glow app__glow--end" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            ب
          </span>
          <span className="brand__copy">
            <span className="brand__en">AL BARAKA</span>
            <span className="brand__ar">معرض البركة</span>
          </span>
        </div>

        <div className="branch-pill">
          <span className="branch-pill__dot" aria-hidden="true" />
          <span>{APP_INFO.branch.name}</span>
          <code>{APP_INFO.branch.code}</code>
        </div>
      </header>

      <main className="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__content">
            <p className="eyebrow">نظام إدارة وحسابات المعرض</p>
            <h1 id="hero-title" className="hero__title">
              الأساس جاهز.
              <br />
              <span>والبناء يبدأ الآن.</span>
            </h1>
            <p className="hero__lead">
              تم تجهيز هيكل المشروع وقواعد الجودة والاتجاه العربي. الخطوة التالية هي تثبيت الهوية
              البصرية وتخطيط التطبيق، ثم الدخول إلى البيانات والصلاحيات.
            </p>

            <ul className="hero__meta" aria-label="بيانات المشروع">
              <li>
                <span>العنوان</span>
                <strong>{APP_INFO.branch.address}</strong>
              </li>
              <li>
                <span>العملة</span>
                <strong>{APP_INFO.currency}</strong>
              </li>
              <li>
                <span>المنطقة الزمنية</span>
                <strong>{APP_INFO.timezone}</strong>
              </li>
            </ul>
          </div>

          <aside className="stage-card" aria-labelledby="stage-title">
            <div className="stage-card__top">
              <span className="stage-card__kicker">المرحلة الحالية</span>
              <span className="badge badge--success">✅ مكتملة</span>
            </div>
            <span className="stage-card__code">{STAGE.current}</span>
            <h2 id="stage-title">{STAGE.currentTitle}</h2>
            <p>مشروع React + TypeScript + Vite، مع قواعد جودة وهيكل واضح وأول واجهة عربية RTL.</p>
            <div className="stage-card__next">
              <span>المرحلة التالية</span>
              <strong>
                {STAGE.next} — {STAGE.nextTitle}
              </strong>
            </div>
          </aside>
        </section>

        <section className="status-grid" aria-label="حالة التجهيز">
          {statusItems.map((item) => (
            <article className="status-card" key={item.label}>
              <div className="status-card__header">
                <span>{item.label}</span>
                <span className={`status-card__badge status-card__badge--${item.tone}`}>
                  {item.value}
                </span>
              </div>
              <p dir="auto">{item.hint}</p>
            </article>
          ))}
        </section>

        <section className="foundation" aria-labelledby="foundation-title">
          <div>
            <p className="eyebrow">M0.1</p>
            <h2 id="foundation-title">ما تم تجهيزه</h2>
          </div>
          <ul className="checklist">
            {foundationChecks.map((item) => (
              <li key={item}>
                <span aria-hidden="true">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="footer">
        <span>
          {APP_INFO.name} — {APP_INFO.branch.name}
        </span>
        <span className="footer__dot" aria-hidden="true" />
        <span>{APP_INFO.branch.code}</span>
        <span className="footer__spacer" />
        <span>نسخة التأسيس 0.1.0</span>
      </footer>
    </div>
  )
}
