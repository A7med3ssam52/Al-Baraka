import type { UserRole } from '@/types'

export interface DirectoryUserRole {
  code: UserRole
  name: string
  branch_id: string
}

export interface DirectoryUserBranch {
  id: string
  code: string
  name: string
  is_default: boolean
}

export interface DirectoryUser {
  user_id: string
  email: string
  full_name: string | null
  phone: string | null
  is_active: boolean
  email_confirmed: boolean
  invited_at: string | null
  last_sign_in_at: string | null
  created_at: string
  primary_role: UserRole
  default_branch_id: string | null
  roles: DirectoryUserRole[] | null
  branches: DirectoryUserBranch[] | null
}

export interface RoleOption {
  code: UserRole
  nameAr: string
  description: string | null
  isSystem: boolean
}

export interface BranchOption {
  id: string
  code: string
  name: string
}

export interface AccessSelection {
  roles: UserRole[]
  branchIds: string[]
  primaryRole: UserRole
  defaultBranchId: string
}

export type InvitationStatus =
  'pending' | 'processing' | 'accepted' | 'cancelled' | 'expired' | 'locked'

export interface InvitationRole {
  code: UserRole
  name: string
}

export interface InvitationBranch {
  id: string
  code: string
  name: string
}

export interface StaffInvitation {
  invitation_id: string
  full_name: string
  phone: string
  status: InvitationStatus
  role_codes: UserRole[]
  primary_role: UserRole
  branch_ids: string[]
  default_branch_id: string
  roles: InvitationRole[] | null
  branches: InvitationBranch[] | null
  attempts: number
  max_attempts: number
  expires_at: string
  created_at: string
  created_by_name: string | null
  accepted_at: string | null
  accepted_user_id: string | null
}

export interface StaffInvitationPreview {
  invitation_id: string
  full_name: string
  phone_masked: string
  status: InvitationStatus
  can_accept: boolean
  roles: InvitationRole[] | null
  branches: InvitationBranch[] | null
  primary_role: UserRole
  default_branch_id: string
  attempts_remaining: number
  expires_at: string
  created_at: string
  ok?: boolean
  phone_confirmed?: boolean
  error?: string
}

export interface CreateInvitationInput {
  fullName: string
  phone: string
  access: AccessSelection
}

export interface CreateInvitationResult {
  invitationId: string
  token: string
  expiresAt: string
  link: string
}

export interface InvitationLinkResult {
  invitationId: string
  link: string
  expiresAt: string
}

export interface UserActionLinkResult {
  userId: string
  actionLink: string
}
