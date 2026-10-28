import { createClient } from 'npm:@supabase/supabase-js@2'

// document-url — issues a signed Cloudinary delivery URL for one stored
// document file. Access rules (BR-23 / BR-26):
//   * the caller must hold the `documents.view` permission (has_permission),
//   * the file must belong to a document in one of the caller's branches (RLS),
//   * every issued URL is logged in document_access_logs before returning,
//   * the URL is type=authenticated signed (`s--…--`): no public URL ever
//     exists for the asset.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

const DELIVERABLE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf'])

interface DocumentFileRow {
  id: string
  document_id: string
  public_id: string
  resource_type: 'image' | 'raw'
  format: string
}

function base64UrlSha1Hex(buffer: ArrayBuffer) {
  const bytes = Array.from(new Uint8Array(buffer))
  const binary = String.fromCharCode(...bytes)
  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha1Digest(value: string) {
  const data = new TextEncoder().encode(value)
  return crypto.subtle.digest('SHA-1', data)
}

async function cloudinaryShortSignature(signatureString: string, apiSecret: string) {
  const base64 = base64UrlSha1Hex(await sha1Digest(`${signatureString}${apiSecret}`))
  return base64.slice(0, 8)
}

async function signedDeliveryUrl(cloudName: string, apiSecret: string, file: DocumentFileRow) {
  // Signed string = the URL path after the /s--…--/ component, up to and
  // including the public id and extension. No transformation is applied, so
  // the signed string is exactly `{public_id}.{format}`.
  const signatureString = `${file.public_id.replace(/^\/+|\/+$/g, '')}.${file.format}`
  const shortSignature = await cloudinaryShortSignature(signatureString, apiSecret)

  return `https://res.cloudinary.com/${cloudName}/${file.resource_type}/authenticated/s--${shortSignature}--/${file.public_id.replace(/^\/+|\/+$/g, '')}.${file.format}`
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME')
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!cloudName || !apiSecret || !supabaseUrl || !supabaseAnonKey) {
    console.error('document-url: missing environment variables')
    return json({ error: 'cloudinary_not_configured' }, 500)
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401)
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()

  if (userError || !user) {
    return json({ error: 'unauthorized' }, 401)
  }

  const { data: canView, error: permissionError } = await userClient.rpc('has_permission', {
    permission_code: 'documents.view',
  })

  if (permissionError || canView !== true) {
    return json({ error: 'forbidden' }, 403)
  }

  let payload: { documentId?: unknown; fileId?: unknown; action?: unknown }
  try {
    payload = (await request.json()) as typeof payload
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const documentId = typeof payload.documentId === 'string' ? payload.documentId : null
  const fileId = typeof payload.fileId === 'string' ? payload.fileId : null
  const action = payload.action === 'download' ? 'download' : 'view'

  if (!documentId || !fileId) {
    return json({ error: 'invalid_request' }, 400)
  }

  // RLS applies: outside-branch files return no rows for this caller.
  const { data: fileRow, error: fileError } = await userClient
    .from('document_files')
    .select('id, document_id, public_id, resource_type, format, documents ( is_sensitive )')
    .eq('id', fileId)
    .eq('document_id', documentId)
    .maybeSingle<DocumentFileRow & { documents: { is_sensitive: boolean } | null }>()

  if (fileError) {
    console.error('document-url: file lookup failed', fileError.message)
    return json({ error: 'lookup_failed' }, 500)
  }

  if (!fileRow) {
    return json({ error: 'document_file_missing' }, 404)
  }

  if (!DELIVERABLE_FORMATS.has(fileRow.format)) {
    return json({ error: 'undeliverable_format' }, 400)
  }

  // BR-26: sensitive documents additionally require the dedicated permission,
  // independent of the general view permission or financial editing.
  const isSensitive = fileRow.documents?.is_sensitive === true
  if (isSensitive) {
    const { data: canSensitive, error: sensitiveError } = await userClient.rpc('has_permission', {
      permission_code: 'documents.download_sensitive',
    })

    if (sensitiveError || canSensitive !== true) {
      return json({ error: 'sensitive_forbidden' }, 403)
    }
  }

  // Log the access before handing the URL over (server-side audit trail).
  const { error: logError } = await userClient.rpc('record_document_access', {
    p_document_id: fileRow.document_id,
    p_file_id: fileRow.id,
    p_action: action,
  })

  if (logError) {
    console.error('document-url: access log failed', logError.message)
    return json({ error: 'access_log_failed' }, 500)
  }

  return json({
    url: await signedDeliveryUrl(cloudName, apiSecret, fileRow),
    documentId: fileRow.document_id,
    fileId: fileRow.id,
    format: fileRow.format,
    resourceType: fileRow.resource_type,
  })
})
