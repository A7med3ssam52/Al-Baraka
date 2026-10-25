import { createAdminClient, readSupabaseEnv } from '../_shared/supabase.ts'
import { corsHeaders, errorJson, json } from '../_shared/http.ts'

interface AcceptPayload {
  token?: unknown
  phone?: unknown
  email?: unknown
  password?: unknown
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TOKEN_PATTERN = /^[a-f0-9]{64}$/
const PHONE_PATTERN = /^[0-9]{10,15}$/

const failureStatus: Record<string, number> = {
  invitation_not_found: 404,
  invalid_phone: 403,
  invitation_used: 410,
  invitation_cancelled: 410,
  invitation_expired: 410,
  invitation_locked: 410,
  invitation_in_use: 409,
}

function normalizePhone(value: unknown) {
  if (typeof value !== 'string') return null
  const digits = value.replace(/\D/g, '')
  return PHONE_PATTERN.test(digits) ? digits : null
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return EMAIL_PATTERN.test(email) && email.length <= 254 ? email : null
}

function readPassword(value: unknown) {
  if (typeof value !== 'string') return null
  if (value.length < 8 || value.length > 72) return null
  return value
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return errorJson('method_not_allowed', 405)
  }

  const env = readSupabaseEnv()
  if (!env) {
    console.error('accept-staff-invite: missing Supabase environment variables')
    return errorJson('supabase_not_configured', 500)
  }

  let body: AcceptPayload
  try {
    const parsed = (await request.json()) as AcceptPayload | null
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return errorJson('invalid_json', 400)
    }
    body = parsed
  } catch {
    return errorJson('invalid_json', 400)
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!TOKEN_PATTERN.test(token)) {
    return errorJson('invitation_not_found', 404)
  }

  const phone = normalizePhone(body.phone)
  if (!phone) {
    return errorJson('invalid_phone', 400)
  }

  const email = normalizeEmail(body.email)
  if (!email) {
    return errorJson('invalid_email', 400)
  }

  const password = readPassword(body.password)
  if (!password) {
    return errorJson('weak_password', 400)
  }

  const admin = createAdminClient(env)

  const { data: claim, error: claimError } = await admin.rpc('begin_staff_invitation_acceptance', {
    invite_token: token,
    invite_phone: phone,
  })

  if (claimError) {
    console.error('accept-staff-invite: claim failed', claimError.message)
    return errorJson('acceptance_failed', 500)
  }

  if (!claim || claim.ok !== true) {
    const code = typeof claim?.error === 'string' ? claim.error : 'invitation_not_found'
    const payload: Record<string, unknown> = { error: code }
    if (typeof claim?.attempts_remaining === 'number') {
      payload.attempts_remaining = claim.attempts_remaining
    }
    return json(payload, failureStatus[code] ?? 400)
  }

  const invitationId = claim.invitation_id as string
  const fullName = typeof claim.full_name === 'string' ? claim.full_name : null

  // GoTrue applies `app_metadata` only after the auth.users row exists, so the
  // signup trigger cannot read it. Issue a one-time, email-bound claim instead.
  const { data: signupClaim, error: signupClaimError } = await admin.rpc(
    'create_staff_signup_claim',
    {
      claim_email: email,
      claim_invitation_id: invitationId,
      claim_phone: phone,
    },
  )

  if (signupClaimError || !signupClaim || signupClaim.ok !== true) {
    console.error(
      'accept-staff-invite: signup claim failed',
      signupClaimError?.message ?? signupClaim?.error,
    )
    await admin.rpc('release_staff_invitation', { invitation_id: invitationId })

    const claimCode = typeof signupClaim?.error === 'string' ? signupClaim.error : null
    if (claimCode === 'invalid_email') return errorJson('invalid_email', 400)
    if (claimCode === 'invalid_phone') return errorJson('invalid_phone', 403)
    if (claimCode === 'invitation_not_found') return errorJson('invitation_not_found', 404)
    if (claimCode === 'invitation_not_processing') {
      return errorJson('invitation_in_use', 409)
    }
    return errorJson('acceptance_failed', 500)
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      account_type: 'staff',
      invitation_id: invitationId,
    },
    user_metadata: {
      full_name: fullName,
      phone,
    },
  })

  if (createError || !created.user) {
    await admin.rpc('delete_staff_signup_claim', {
      claim_email: email,
      claim_invitation_id: invitationId,
    })
    await admin.rpc('release_staff_invitation', { invitation_id: invitationId })

    const message = createError?.message?.toLowerCase() ?? ''
    if (
      message.includes('already been registered') ||
      message.includes('already exists') ||
      message.includes('duplicate')
    ) {
      return errorJson('email_exists', 409)
    }

    console.error('accept-staff-invite: user creation failed', createError?.message)
    return errorJson('user_creation_failed', 500)
  }

  const userId = created.user.id

  const { data: completion, error: completionError } = await admin.rpc(
    'complete_staff_invitation_acceptance',
    {
      invitation_id: invitationId,
      new_user_id: userId,
      actor_id: null,
    },
  )

  if (completionError || !completion) {
    console.error('accept-staff-invite: completion failed', completionError?.message)

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError) {
      console.error('accept-staff-invite: compensation delete failed', deleteError.message)
    }

    await admin.rpc('delete_staff_signup_claim', {
      claim_email: email,
      claim_invitation_id: invitationId,
    })
    await admin.rpc('release_staff_invitation', { invitation_id: invitationId })
    return errorJson('acceptance_failed', 500)
  }

  return json({
    ok: true,
    invitation_id: invitationId,
    user_id: userId,
    email,
  })
})
