import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/app-shell'
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
import { SupplierProfilePage } from '@/features/suppliers/pages/supplier-profile-page'
import { ProductsPage } from '@/features/products/pages/products-page'
import { VehiclesPage } from '@/features/vehicles/pages/vehicles-page'
import { MovementsPage } from '@/features/stock/pages/movements-page'
import { PurchaseInvoicesPage } from '@/features/purchases/pages/purchase-invoices-page'
import { PurchaseInvoicePrintPage } from '@/features/purchases/pages/purchase-invoice-print-page'
import { TransfersPage } from '@/features/transfers/pages/transfers-page'
import { CountsPage } from '@/features/counts/pages/counts-page'
import { CountDetailPage } from '@/features/counts/pages/count-detail-page'
import { DocumentsPage } from '@/features/documents/pages/documents-page'
import { TreasuryPage } from '@/features/treasury/pages/treasury-page'
import { ReportsPage } from '@/features/reports/pages/reports-page'
import { InstallmentsPage } from '@/features/installments/pages/installments-page'
import { LandingPage } from '@/features/public-portal/pages/landing-page'
import { PortalPage } from '@/features/public-portal/pages/portal-page'
import { UsersPage } from '@/features/users/pages/users-page'
import { AcceptInvitationPage } from '@/features/users/pages/accept-invitation-page'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public landing on the main domain + customer self-service (read-only). */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/portal" element={<PortalPage />} />

        <Route element={<PublicOnlyRoute />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
        </Route>

        <Route path="reset-password" element={<ResetPasswordPage />} />

        <Route path="invite/:token" element={<AcceptInvitationPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="profile" element={<ProfilePage />} />

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
              path="suppliers/:supplierId"
              element={
                <PermissionGuard permission="suppliers.view">
                  <SupplierProfilePage />
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
              path="inventory/purchases/:invoiceId/print"
              element={
                <PermissionGuard permission="purchases.view">
                  <PurchaseInvoicePrintPage />
                </PermissionGuard>
              }
            />
            <Route
              path="inventory/transfers"
              element={
                <PermissionGuard permission="products.view">
                  <TransfersPage />
                </PermissionGuard>
              }
            />
            <Route
              path="inventory/counts"
              element={
                <PermissionGuard permission="inventory_counts.view">
                  <CountsPage />
                </PermissionGuard>
              }
            />
            <Route
              path="inventory/counts/:countId"
              element={
                <PermissionGuard permission="inventory_counts.view">
                  <CountDetailPage />
                </PermissionGuard>
              }
            />
            <Route
              path="installments"
              element={
                <PermissionGuard permission="installments.view">
                  <InstallmentsPage />
                </PermissionGuard>
              }
            />
            <Route
              path="treasury"
              element={
                <PermissionGuard permission="cashboxes.view">
                  <TreasuryPage />
                </PermissionGuard>
              }
            />
            <Route
              path="documents"
              element={
                <PermissionGuard permission="documents.view">
                  <DocumentsPage />
                </PermissionGuard>
              }
            />
            <Route
              path="reports"
              element={
                <PermissionGuard permission="reports.view">
                  <ReportsPage />
                </PermissionGuard>
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

            <Route path="403" element={<ForbiddenPage />} />
            <Route path="loading" element={<LoadingPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
