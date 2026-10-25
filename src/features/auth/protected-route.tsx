import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { AuthLoadingScreen } from './components/auth-loading-screen'
import { InactiveAccountScreen } from './components/inactive-account-screen'
import { NoAccessScreen } from './components/no-access-screen'
import { useAuth } from './use-auth'

export function ProtectedRoute() {
  const { user, appUser, loading } = useAuth()
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

  if (appUser && !appUser.hasProfile) {
    return <NoAccessScreen hasProfile={false} />
  }

  if (appUser && !appUser.isActive) {
    return <InactiveAccountScreen />
  }

  if (appUser && !appUser.hasRole) {
    return <NoAccessScreen hasProfile />
  }

  return <Outlet />
}
