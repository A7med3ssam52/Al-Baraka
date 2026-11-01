import type { ReactNode } from 'react'
import { Component } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Application error boundary:', error)
  }

  render() {
    if (this.state.error) {
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
              حدث خطأ غير متوقع
            </h1>
            <p style={{ color: '#475569', lineHeight: 1.7, marginBottom: '1rem' }}>
              تعذّر تشغيل التطبيق. تحقق من إعدادات البيئة (متغيرات Supabase) في منصة النشر،
              ثم أعد تحميل الصفحة.
            </p>
            <pre
              style={{
                background: '#e2e8f0',
                padding: '0.75rem 1rem',
                borderRadius: 8,
                fontSize: 12,
                textAlign: 'left',
                overflow: 'auto',
                direction: 'ltr',
              }}
            >
              {this.state.error.message}
            </pre>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
