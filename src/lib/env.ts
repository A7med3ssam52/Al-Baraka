import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL يجب أن يكون رابطًا صحيحًا').optional(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, 'VITE_SUPABASE_PUBLISHABLE_KEY مطلوب')
    .optional(),
  VITE_CLOUDINARY_CLOUD_NAME: z.string().min(1, 'VITE_CLOUDINARY_CLOUD_NAME مطلوب').optional(),
})

const result = envSchema.safeParse({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_CLOUDINARY_CLOUD_NAME: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
})

if (!result.success) {
  console.error('❌ إعدادات البيئة غير صالحة:', result.error.issues)
  throw new Error('إعدادات البيئة غير صالحة. راجع ملف .env.example ثم أعد تشغيل الخادم.')
}

export const env = result.data

export const isSupabaseConfigured = Boolean(
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY,
)

export const isCloudinaryConfigured = Boolean(env.VITE_CLOUDINARY_CLOUD_NAME)
