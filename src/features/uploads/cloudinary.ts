import { supabase } from '@/lib/supabase'

export const MAX_IMAGE_SIZE = 8 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type CloudinaryResourceType = 'image' | 'raw'

export interface CloudinaryUploadOptions {
  folder?: string
  resourceType?: CloudinaryResourceType
  publicId?: string
}

export interface CloudinaryUploadResult {
  publicId: string
  secureUrl: string
  url: string
  format: string
  bytes: number
  width?: number
  height?: number
  resourceType: string
  createdAt: string
}

interface CloudinarySignResponse {
  cloudName: string
  apiKey: string
  timestamp: number
  signature: string
  folder: string
  publicId: string | null
  allowedFormats: string | null
  resourceType: CloudinaryResourceType
  uploadUrl: string
}

interface CloudinaryApiResponse {
  public_id: string
  secure_url: string
  url: string
  format: string
  bytes: number
  width?: number
  height?: number
  resource_type: string
  created_at: string
}

export function validateImageFile(file: File) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    return 'صيغة الملف غير مدعومة. استخدم JPG أو PNG أو WebP.'
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return 'حجم الصورة يجب ألا يتجاوز 8 ميجابايت.'
  }

  return null
}

async function requestUploadSignature(options: CloudinaryUploadOptions) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

  if (sessionError || !sessionData.session) {
    throw new Error('يجب تسجيل الدخول قبل رفع الملفات.')
  }

  const { data, error } = await supabase.functions.invoke<CloudinarySignResponse>(
    'cloudinary-sign',
    {
      body: {
        folder: options.folder,
        resourceType: options.resourceType ?? 'image',
        publicId: options.publicId,
      },
    },
  )

  if (error) {
    const context = (error as { context?: Response }).context
    if (context) {
      const body = (await context
        .clone()
        .json()
        .catch(() => null)) as { error?: string } | null

      if (body?.error === 'cloudinary_not_configured') {
        throw new Error(
          'خدمة الرفع غير مهيأة بعد. أضف CLOUDINARY_API_SECRET إلى أسرار Supabase ثم أعد المحاولة.',
        )
      }

      if (body?.error === 'unauthorized') {
        throw new Error('انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.')
      }
    }

    throw new Error('تعذر تجهيز الرفع الآمن. تحقق من إعدادات Cloudinary.')
  }

  if (!data) {
    throw new Error('لم يصل رد صالح من خدمة الرفع.')
  }

  return data
}

export async function uploadToCloudinary(
  file: File,
  options: CloudinaryUploadOptions = {},
): Promise<CloudinaryUploadResult> {
  const signatureData = await requestUploadSignature(options)
  const formData = new FormData()

  formData.append('file', file)
  formData.append('api_key', signatureData.apiKey)
  formData.append('timestamp', String(signatureData.timestamp))
  formData.append('signature', signatureData.signature)
  formData.append('folder', signatureData.folder)

  if (signatureData.publicId) {
    formData.append('public_id', signatureData.publicId)
  }

  if (signatureData.allowedFormats) {
    formData.append('allowed_formats', signatureData.allowedFormats)
  }

  const response = await fetch(signatureData.uploadUrl, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    console.error('Cloudinary upload failed', response.status, details.slice(0, 500))
    throw new Error('فشل رفع الملف إلى Cloudinary. تحقق من نوع الملف وحجمه ثم حاول مرة أخرى.')
  }

  const result = (await response.json()) as CloudinaryApiResponse

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    url: result.url,
    format: result.format,
    bytes: result.bytes,
    width: result.width,
    height: result.height,
    resourceType: result.resource_type,
    createdAt: result.created_at,
  }
}
