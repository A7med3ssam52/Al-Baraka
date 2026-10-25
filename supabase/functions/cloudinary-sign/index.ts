import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ResourceType = 'image' | 'raw'

interface SignRequest {
  folder?: unknown
  resourceType?: unknown
  publicId?: unknown
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function isResourceType(value: unknown): value is ResourceType {
  return value === 'image' || value === 'raw'
}

function sanitizeFolder(value: unknown, appEnv: string) {
  const defaultFolder = `albaraka/${appEnv}/uploads`
  if (typeof value !== 'string' || value.trim() === '') return defaultFolder

  const folder = value.trim()
  const allowedPrefix = `albaraka/${appEnv}/`
  const validCharacters = /^[a-zA-Z0-9/_-]+$/

  if (
    !folder.startsWith(allowedPrefix) ||
    folder.length > 180 ||
    folder.includes('..') ||
    !validCharacters.test(folder)
  ) {
    return null
  }

  return folder.replace(/\/+$/, '')
}

function sanitizePublicId(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') return null
  const publicId = value.trim()
  if (publicId.length > 120 || !/^[a-zA-Z0-9_-]+$/.test(publicId)) return null
  return publicId
}

async function sha1Hex(value: string) {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-1', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME')
  const apiKey = Deno.env.get('CLOUDINARY_API_KEY')
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET')
  const appEnv = Deno.env.get('APP_ENV') ?? 'staging'

  if (!cloudName || !apiKey || !apiSecret) {
    console.error('cloudinary-sign: missing Cloudinary environment variables')
    return json({ error: 'cloudinary_not_configured' }, 500)
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('cloudinary-sign: missing Supabase environment variables')
    return json({ error: 'supabase_not_configured' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return json({ error: 'unauthorized' }, 401)
  }

  // D-26: signing is a staff capability. A valid session without
  // documents.upload (inactive account, missing role, or orphan profile) is
  // rejected before any signature is produced.
  const { data: canUpload, error: permissionError } = await supabase.rpc('has_permission', {
    permission_code: 'documents.upload',
  })

  if (permissionError || canUpload !== true) {
    return json({ error: 'forbidden' }, 403)
  }

  let body: SignRequest
  try {
    const parsed = (await request.json()) as SignRequest | null
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ error: 'invalid_json' }, 400)
    }
    body = parsed
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const folder = sanitizeFolder(body.folder, appEnv)
  if (!folder) {
    return json({ error: 'invalid_folder' }, 400)
  }

  const resourceType = isResourceType(body.resourceType) ? body.resourceType : 'image'
  const publicId = sanitizePublicId(body.publicId)
  if (body.publicId !== undefined && body.publicId !== null && publicId === null) {
    return json({ error: 'invalid_public_id' }, 400)
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const allowedFormats = resourceType === 'raw' ? null : 'jpg,jpeg,png,webp'

  const signedParams: Record<string, string> = {
    folder,
    timestamp: String(timestamp),
  }
  if (allowedFormats) signedParams.allowed_formats = allowedFormats
  if (publicId) signedParams.public_id = publicId

  const signatureBase = Object.keys(signedParams)
    .sort()
    .map((key) => `${key}=${signedParams[key]}`)
    .join('&')

  const signature = await sha1Hex(`${signatureBase}${apiSecret}`)

  return json({
    cloudName,
    apiKey,
    timestamp,
    signature,
    folder,
    publicId,
    allowedFormats,
    resourceType,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
  })
})
