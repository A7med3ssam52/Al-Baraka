import type { Session, User } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { APP_INFO } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import type { AppUser, UserRole } from '@/types'

import { translateAuthError } from './auth-errors'
import { AuthContext } from './auth-context'

interface ProfileRow {
  full_name: string | null
  role: UserRole
  branch_id: string | null
  branches: { code: string; name: string } | null
}

function getFallbackUser(user: User): AppUser {
  const metadata = (user.user_metadata ?? {}) as { full_name?: unknown }
  const metadataName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : ''

  return {
    id: user.id,
    name: metadataName || user.email?.split('@')[0] || 'مستخدم',
    email: user.email ?? '',
    role: 'viewer',
    branchIds: [APP_INFO.branch.code],
    isActive: true,
  }
}

function mapProfile(user: User, profile: ProfileRow | null): AppUser {
  const fallback = getFallbackUser(user)

  if (!profile) return fallback

  return {
    ...fallback,
    name: profile.full_name?.trim() || fallback.name,
    role: profile.role,
    branchIds: [profile.branches?.code ?? APP_INFO.branch.code],
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
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, role, branch_id, branches(code, name)')
      .eq('id', currentUser.id)
      .maybeSingle()

    if (error) {
      if (import.meta.env.DEV) {
        console.warn('تعذر تحميل الملف الشخصي من Supabase:', error.message)
      }
      return getFallbackUser(currentUser)
    }

    return mapProfile(currentUser, data as unknown as ProfileRow | null)
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

  const value = useMemo(
    () => ({
      session,
      user,
      appUser,
      loading,
      profileLoading,
      signIn,
      signOut,
      refreshProfile,
    }),
    [appUser, loading, profileLoading, refreshProfile, session, signIn, signOut, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
