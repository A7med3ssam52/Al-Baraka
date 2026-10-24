import type { Session, User } from '@supabase/supabase-js'
import { createContext } from 'react'

import type { AppUser } from '@/types'

export interface AuthContextValue {
  session: Session | null
  user: User | null
  appUser: AppUser | null
  loading: boolean
  profileLoading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
