import { createClient } from '@supabase/supabase-js'

import { env, isSupabaseConfigured } from '@/lib/env'

const supabaseUrl = env.VITE_SUPABASE_URL ?? ''
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''

// Do not throw at module load: a missing configuration must not white-screen the
// whole application. Consumers should check `isSupabaseConfigured` and render a
// helpful message instead.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)

export { isSupabaseConfigured }

