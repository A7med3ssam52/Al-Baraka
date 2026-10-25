import { createClient } from 'npm:@supabase/supabase-js@2'

export interface SupabaseEnv {
  url: string
  anonKey: string
  serviceRoleKey: string
}

export function readSupabaseEnv(): SupabaseEnv | null {
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !anonKey || !serviceRoleKey) return null

  return { url, anonKey, serviceRoleKey }
}

export function createUserClient(env: SupabaseEnv, authorization: string) {
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
}

export function createAdminClient(env: SupabaseEnv) {
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function hasPermission(
  client: ReturnType<typeof createUserClient>,
  permissionCode: string,
  branchId?: string,
) {
  const params = branchId
    ? { permission_code: permissionCode, target_branch_id: branchId }
    : { permission_code: permissionCode }

  const { data, error } = await client.rpc('has_permission', params)
  if (error) return false
  return data === true
}

export function getAppOrigin(request: Request) {
  const configured = Deno.env.get('APP_ORIGIN')?.trim()
  if (configured) return configured.replace(/\/+$/, '')

  const origin = request.headers.get('Origin')?.trim()
  if (origin) return origin.replace(/\/+$/, '')

  return 'http://localhost:5173'
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
