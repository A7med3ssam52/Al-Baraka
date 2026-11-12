import { DirectionProvider } from '@radix-ui/react-direction'
import type { ReactNode } from 'react'

import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/features/auth/auth-provider'
import { SettingsProvider } from '@/features/settings/settings-provider'
import { useOfflineSync } from '@/lib/offline'

interface AppProvidersProps {
  children: ReactNode
}

function OfflineSync() {
  useOfflineSync()
  return null
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <DirectionProvider dir="rtl">
      <ThemeProvider>
        <AuthProvider>
          <SettingsProvider>
            <TooltipProvider delayDuration={200}>
              {children}
              <OfflineSync />
              <Toaster position="top-center" richColors closeButton />
            </TooltipProvider>
          </SettingsProvider>
        </AuthProvider>
      </ThemeProvider>
    </DirectionProvider>
  )
}
