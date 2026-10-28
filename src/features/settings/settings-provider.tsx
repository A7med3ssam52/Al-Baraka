import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { useAuth } from '@/features/auth/use-auth'

import { fetchSystemSettings, translateSettingsError } from './api'
import { fallbackSettings, SettingsContext } from './settings-context'
import type { SettingsContextValue } from './settings-context'
import type { SystemSettings } from './types'

interface SettingsProviderProps {
  children: ReactNode
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const { appUser, hasPermission } = useAuth()
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  const canView = Boolean(
    appUser?.hasProfile && appUser.isActive && appUser.hasRole && hasPermission('settings.view'),
  )

  const fetchSettings = useCallback(async () => {
    if (!canView) return

    const requestId = requestRef.current + 1
    requestRef.current = requestId

    try {
      const nextSettings = await fetchSystemSettings()
      if (requestId !== requestRef.current) return
      setSettings(nextSettings)
      setError(null)
    } catch (settingsError) {
      if (requestId !== requestRef.current) return
      setSettings(null)
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : translateSettingsError(settingsError),
      )
    }
  }, [canView])

  const refresh = useCallback(async () => {
    if (!canView) return

    setLoading(true)
    setError(null)

    try {
      await fetchSettings()
    } finally {
      setLoading(false)
    }
  }, [canView, fetchSettings])

  useEffect(() => {
    if (!canView) return

    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)
      await fetchSettings()
      if (active) setLoading(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [canView, fetchSettings])

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings: canView && settings ? settings : fallbackSettings,
      loading: canView ? loading : false,
      error: canView ? error : null,
      usingFallback: !canView || settings === null,
      refresh,
    }),
    [canView, error, loading, refresh, settings],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
