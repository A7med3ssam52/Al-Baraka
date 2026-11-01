import { isSupabaseConfigured } from '@/lib/env'
import { ErrorBoundary } from '@/components/error-boundary'
import { AppProviders } from '@/app/providers'
import { AppRouter } from '@/app/router'

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <div
        dir="rtl"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: 'system-ui, sans-serif',
          background: '#f8fafc',
          color: '#0f172a',
        }}
      >
        <div style={{ maxWidth: 560, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            إعدادات الاتصال غير مكتملة
          </h1>
          <p style={{ color: '#475569', lineHeight: 1.7 }}>
            لم يتم ضبط متغيرات Supabase في بيئة الإنتاج. أضف{' '}
            <code>VITE_SUPABASE_URL</code> و <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> في
            إعدادات Vercel (Project Settings → Environment Variables)، ثم أعد النشر.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </ErrorBoundary>
  )
}
