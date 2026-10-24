import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { AuthLoadingScreen } from './components/auth-loading-screen'
import { useAuth } from './use-auth'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <AuthLoadingScreen />

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    )
  }

  return <Outlet />
}
