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
import { PermissionGuard } from '@/features/auth/permission-guard'
import { ProtectedRoute } from '@/features/auth/protected-route'
import { PublicOnlyRoute } from '@/features/auth/public-only-route'
import { DashboardPage } from '@/features/dashboard/pages/dashboard-page'
import { CustomerProfilePage } from '@/features/customers/pages/customer-profile-page'
import { CustomersPage } from '@/features/customers/pages/customers-page'
import { AuditLogsPage } from '@/features/audit/pages/audit-logs-page'
import { SettingsPage } from '@/features/settings/pages/settings-page'
import { SuppliersPage } from '@/features/suppliers/pages/suppliers-page'
import { ProductsPage } from '@/features/products/pages/products-page'
import { VehiclesPage } from '@/features/vehicles/pages/vehicles-page'
import { MovementsPage } from '@/features/stock/pages/movements-page'
import { PurchaseInvoicesPage } from '@/features/purchases/pages/purchase-invoices-page'
import { UploadTestPage } from '@/features/uploads/pages/upload-test-page'
import { UsersPage } from '@/features/users/pages/users-page'
import { AcceptInvitationPage } from '@/features/users/pages/accept-invitation-page'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
        </Route>

        <Route path="reset-password" element={<ResetPasswordPage />} />

        <Route path="invite/:token" element={<AcceptInvitationPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route
              path="upload-test"
              element={
                <PermissionGuard permission="documents.upload">
                  <UploadTestPage />
                </PermissionGuard>
              }
            />

            <Route
              path="customers"
              element={
                <PermissionGuard permission="customers.view">
                  <CustomersPage />
                </PermissionGuard>
              }
            />
            <Route
              path="customers/:customerId"
              element={
                <PermissionGuard permission="customers.view">
                  <CustomerProfilePage />
                </PermissionGuard>
              }
            />
            <Route
              path="suppliers"
              element={
                <PermissionGuard permission="suppliers.view">
                  <SuppliersPage />
                </PermissionGuard>
              }
            />
            <Route
              path="inventory"
              element={
                <PermissionGuard permission="products.view">
                  <ProductsPage />
                </PermissionGuard>
              }
            />
            <Route
              path="inventory/vehicles"
              element={
                <PermissionGuard permission="vehicles.view">
                  <VehiclesPage />
                </PermissionGuard>
              }
            />
            <Route
              path="inventory/movements"
              element={
                <PermissionGuard permission="products.view">
                  <MovementsPage />
                </PermissionGuard>
              }
            />
            <Route
              path="inventory/purchases"
              element={
                <PermissionGuard permission="purchases.view">
                  <PurchaseInvoicesPage />
                </PermissionGuard>
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
              path="users"
              element={
                <PermissionGuard permission="users.view">
                  <UsersPage />
                </PermissionGuard>
              }
            />
            <Route
              path="settings"
              element={
                <PermissionGuard permission="settings.view">
                  <SettingsPage />
                </PermissionGuard>
              }
            />
            <Route
              path="audit-logs"
              element={
                <PermissionGuard permission="audit_logs.view">
                  <AuditLogsPage />
                </PermissionGuard>
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
