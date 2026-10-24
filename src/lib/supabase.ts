import { createClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'إعدادات Supabase غير مكتملة. أضف VITE_SUPABASE_URL وVITE_SUPABASE_PUBLISHABLE_KEY إلى .env.local ثم أعد تشغيل الخادم.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
