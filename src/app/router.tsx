import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/app-shell'
import { ComingSoonPage } from '@/app/pages/coming-soon-page'
import { DesignSystemPage } from '@/app/pages/design-system-page'
import { ForbiddenPage } from '@/app/pages/forbidden-page'
import { LoadingPage } from '@/app/pages/loading-page'
import { NotFoundPage } from '@/app/pages/not-found-page'
import { ForgotPasswordPage } from '@/features/auth/pages/forgot-password-page'
import { LoginPage } from '@/features/auth/pages/login-page'
import { ProfilePage } from '@/features/auth/pages/profile-page'
import { ResetPasswordPage } from '@/features/auth/pages/reset-password-page'
import { ProtectedRoute } from '@/features/auth/protected-route'
import { PublicOnlyRoute } from '@/features/auth/public-only-route'
import { DashboardPage } from '@/features/dashboard/pages/dashboard-page'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
        </Route>

        <Route path="reset-password" element={<ResetPasswordPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="profile" element={<ProfilePage />} />

            <Route
              path="customers"
              element={
                <ComingSoonPage
                  title="العملاء"
                  phase="M2.1"
                  description="ملف موحد لكل عميل يربط البيانات وجهات الاتصال والضامنين والمبيعات والأقساط والمستندات."
                />
              }
            />
            <Route
              path="inventory"
              element={
                <ComingSoonPage
                  title="المخزون"
                  phase="M3.1"
                  description="إدارة المركبات والمنتجات والقطع، مع التكلفة والصور وحالة كل وحدة."
                />
              }
            />
            <Route
              path="sales"
              element={
                <ComingSoonPage
                  title="المبيعات"
                  phase="M4.1"
                  description="البيع النقدي والتقسيط، العقود، الحجوزات، والمرتجعات في مسار واحد."
                />
              }
            />
            <Route
              path="installments"
              element={
                <ComingSoonPage
                  title="الأقساط والتحصيل"
                  phase="M5.1"
                  description="جداول الأقساط، التحصيلات الجزئية، الإعادة الجدولة، ومتابعة المتأخرات."
                />
              }
            />
            <Route
              path="treasury"
              element={
                <ComingSoonPage
                  title="الخزنة والمصروفات"
                  phase="M6.1"
                  description="الخزنة والبنوك والمصروفات والقيود اليومية ومطابقة الأرصدة."
                />
              }
            />
            <Route
              path="documents"
              element={
                <ComingSoonPage
                  title="المستندات"
                  phase="M7.1"
                  description="مركز مستندات آمن للصور والعقود وإيصالات الأمانة وكشوف الحساب."
                />
              }
            />
            <Route
              path="reports"
              element={
                <ComingSoonPage
                  title="التقارير"
                  phase="M8.1"
                  description="تقارير المبيعات والأرباح والتحصيل والمخزون مع التصدير والطباعة."
                />
              }
            />
            <Route
              path="settings"
              element={
                <ComingSoonPage
                  title="الإعدادات"
                  phase="M1.4"
                  description="إعدادات المعرض والفروع والمستخدمين والصلاحيات والترقيم."
                />
              }
            />

            <Route path="design-system" element={<DesignSystemPage />} />
            <Route path="403" element={<ForbiddenPage />} />
            <Route path="loading" element={<LoadingPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
