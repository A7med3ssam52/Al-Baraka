import {
  createAdminClient,
  createUserClient,
  getAppOrigin,
  hasPermission,
  isUuid,
  readSupabaseEnv,
} from '../_shared/supabase.ts'
import { corsHeaders, errorJson, json } from '../_shared/http.ts'

interface ActionPayload {
  action?: unknown
  user_id?: unknown
}

const ALLOWED_ACTIONS = new Set(['reset_password'])

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return errorJson('method_not_allowed', 405)
  }

  const env = readSupabaseEnv()
  if (!env) {
    console.error('admin-user-actions: missing Supabase environment variables')
    return errorJson('supabase_not_configured', 500)
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return errorJson('unauthorized', 401)
  }

  const userClient = createUserClient(env, authorization)
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()

  if (userError || !user) {
    return errorJson('unauthorized', 401)
  }

  const canReset = await hasPermission(userClient, 'users.reset_password')
  if (!canReset) {
    return errorJson('forbidden', 403)
  }

  let body: ActionPayload
  try {
    const parsed = (await request.json()) as ActionPayload | null
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return errorJson('invalid_json', 400)
    }
    body = parsed
  } catch {
    return errorJson('invalid_json', 400)
  }

  const action = typeof body.action === 'string' ? body.action.trim() : ''
  const targetUserId = typeof body.user_id === 'string' ? body.user_id.trim() : ''

  if (!ALLOWED_ACTIONS.has(action)) {
    return errorJson('invalid_action', 400)
  }

  if (!isUuid(targetUserId)) {
    return errorJson('invalid_user', 400)
  }

  const { data: targetProfile, error: profileError } = await userClient
    .from('profiles')
    .select('id, is_active')
    .eq('id', targetUserId)
    .maybeSingle()

  if (profileError) {
    console.error('admin-user-actions: profile lookup failed', profileError.message)
    return errorJson('lookup_failed', 500)
  }

  if (!targetProfile) {
    return errorJson('user_not_found', 404)
  }

  const { data: targetRoles, error: targetRolesError } = await userClient
    .from('user_roles')
    .select('roles(code)')
    .eq('user_id', targetUserId)

  if (targetRolesError) {
    console.error('admin-user-actions: role lookup failed', targetRolesError.message)
    return errorJson('lookup_failed', 500)
  }

  const targetIsOwner = (targetRoles ?? []).some(
    (assignment) => (assignment.roles as { code?: string } | null)?.code === 'owner',
  )

  if (targetIsOwner && !(await hasPermission(userClient, 'roles.manage'))) {
    return errorJson('owner_required', 403)
  }

  const adminClient = createAdminClient(env)
  const { data: targetUserData, error: targetUserError } =
    await adminClient.auth.admin.getUserById(targetUserId)

  if (targetUserError || !targetUserData.user?.email) {
    return errorJson('user_not_found', 404)
  }

  const targetUser = targetUserData.user

  const redirectTo = `${getAppOrigin(request)}/reset-password`
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email: targetUser.email,
    options: { redirectTo },
  })

  if (linkError || !linkData.properties?.action_link) {
    console.error('admin-user-actions: generateLink failed', linkError?.message)
    return errorJson('link_failed', 500)
  }

  return json({
    user_id: targetUserId,
    action,
    action_link: linkData.properties.action_link,
  })
})
