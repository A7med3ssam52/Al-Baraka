import type { Session, User } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { APP_INFO } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import type { AppUser, UserRole } from '@/types'

import { translateAuthError } from './auth-errors'
import { AuthContext } from './auth-context'
import { isUserRole } from './roles'

interface MyAccessResponse {
  user_id: string
  full_name: string | null
  phone: string | null
  email: string | null
  primary_role: string | null
  default_branch_id: string | null
  is_active: boolean
  is_owner: boolean
  has_profile: boolean
  has_role: boolean
  permissions: string[] | null
  roles:
    | {
        code: string
        name: string
        branch_id: string
        is_primary: boolean
      }[]
    | null
  branches:
    | {
        id: string
        code: string
        name: string
        is_default: boolean
      }[]
    | null
}

function getFallbackUser(user: User): AppUser {
  const metadata = (user.user_metadata ?? {}) as { full_name?: unknown }
  const metadataName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : ''

  return {
    id: user.id,
    name: metadataName || user.email?.split('@')[0] || 'مستخدم',
    email: user.email ?? '',
    phone: null,
    role: 'viewer',
    roles: [],
    branches: [
      {
        id: '',
        code: APP_INFO.branch.code,
        name: APP_INFO.branch.name,
        isDefault: true,
      },
    ],
    permissions: [],
    isOwner: false,
    isActive: true,
    hasProfile: true,
    hasRole: true,
  }
}

function mapAccess(user: User, access: MyAccessResponse | null): AppUser {
  const fallback = getFallbackUser(user)

  if (!access) return fallback

  const roles = (access.roles ?? [])
    .filter((role) => isUserRole(role.code))
    .map((role) => ({
      code: role.code as UserRole,
      name: role.name,
      branchId: role.branch_id,
      isPrimary: role.is_primary,
    }))

  const branches = (access.branches ?? []).map((branch) => ({
    id: branch.id,
    code: branch.code,
    name: branch.name,
    isDefault: branch.is_default,
  }))

  const primaryRole = isUserRole(access.primary_role)
    ? access.primary_role
    : (roles.find((role) => role.isPrimary)?.code ?? roles[0]?.code ?? 'viewer')

  return {
    ...fallback,
    name: access.full_name?.trim() || fallback.name,
    email: access.email || fallback.email,
    phone: access.phone,
    role: primaryRole,
    roles,
    branches: branches.length > 0 ? branches : fallback.branches,
    permissions: Array.isArray(access.permissions) ? access.permissions : [],
    isOwner: Boolean(access.is_owner),
    isActive: Boolean(access.is_active),
    hasProfile: Boolean(access.has_profile),
    hasRole: Boolean(access.has_role),
  }
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const profileRequestRef = useRef(0)

  const loadProfile = useCallback(async (currentUser: User): Promise<AppUser> => {
    const { data, error } = await supabase.rpc('my_access')

    if (error) {
      if (import.meta.env.DEV) {
        console.warn('تعذر تحميل صلاحيات المستخدم من Supabase:', error.message)
      }
      return getFallbackUser(currentUser)
    }

    return mapAccess(currentUser, data as unknown as MyAccessResponse | null)
  }, [])

  useEffect(() => {
    let active = true

    const syncProfile = (currentUser: User | null) => {
      if (!active) return

      const requestId = profileRequestRef.current + 1
      profileRequestRef.current = requestId

      if (!currentUser) {
        setAppUser(null)
        setProfileLoading(false)
        return
      }

      setAppUser(getFallbackUser(currentUser))
      setProfileLoading(true)

      void loadProfile(currentUser).then((nextAppUser) => {
        if (!active || requestId !== profileRequestRef.current) return
        setAppUser(nextAppUser)
        setProfileLoading(false)
      })
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
      syncProfile(data.session?.user ?? null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setLoading(false)
      syncProfile(nextSession?.user ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        return { error: translateAuthError(error.message) }
      }

      setSession(data.session)
      setUser(data.user)
      setAppUser(getFallbackUser(data.user))
      setProfileLoading(true)

      const requestId = profileRequestRef.current + 1
      profileRequestRef.current = requestId

      void loadProfile(data.user).then((nextAppUser) => {
        if (requestId !== profileRequestRef.current) return
        setAppUser(nextAppUser)
        setProfileLoading(false)
      })

      return { error: null }
    },
    [loadProfile],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    profileRequestRef.current += 1
    setSession(null)
    setUser(null)
    setAppUser(null)
    setProfileLoading(false)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!user) return

    const requestId = profileRequestRef.current + 1
    profileRequestRef.current = requestId
    setProfileLoading(true)

    const nextAppUser = await loadProfile(user)

    if (requestId !== profileRequestRef.current) return
    setAppUser(nextAppUser)
    setProfileLoading(false)
  }, [loadProfile, user])

  const permissions = useMemo(() => appUser?.permissions ?? [], [appUser])
  const isOwner = appUser?.isOwner ?? false

  const hasPermission = useCallback(
    (permissionCode: string) => permissions.includes(permissionCode),
    [permissions],
  )

  const value = useMemo(
    () => ({
      session,
      user,
      appUser,
      loading,
      profileLoading,
      permissions,
      isOwner,
      hasPermission,
      signIn,
      signOut,
      refreshProfile,
    }),
    [
      appUser,
      hasPermission,
      isOwner,
      loading,
      permissions,
      profileLoading,
      refreshProfile,
      session,
      signIn,
      signOut,
      user,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
