import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { AuthLoadingScreen } from './components/auth-loading-screen'
import { useAuth } from './use-auth'

export function PublicOnlyRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <AuthLoadingScreen />

  if (user) {
    const rawFrom = (location.state as { from?: string } | null)?.from
    const target = rawFrom?.startsWith('/') ? rawFrom : '/'
    return <Navigate to={target} replace />
  }

  return <Outlet />
}
