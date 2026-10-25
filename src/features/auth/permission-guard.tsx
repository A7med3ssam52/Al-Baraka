import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'

import { LoadingPage } from '@/app/pages/loading-page'

import { useAuth } from './use-auth'

interface PermissionGuardProps {
  permission: string
  children: ReactNode
}

export function PermissionGuard({ permission, children }: PermissionGuardProps) {
  const { appUser, loading, profileLoading, hasPermission } = useAuth()

  if (loading) return null

  if (profileLoading) return <LoadingPage />

  if (!appUser || !hasPermission(permission)) {
    return <Navigate to="/403" replace />
  }

  return <>{children}</>
}
