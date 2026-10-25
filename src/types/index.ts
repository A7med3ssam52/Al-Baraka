export type UserRole =
  'owner' | 'manager' | 'accountant' | 'sales' | 'collection' | 'inventory' | 'viewer'

export interface Branch {
  id: string
  code: string
  name: string
  address: string
  isActive: boolean
}

export interface AppUserRole {
  code: UserRole
  name: string
  branchId: string
  isPrimary: boolean
}

export interface AppUserBranch {
  id: string
  code: string
  name: string
  isDefault: boolean
}

export interface AppUser {
  id: string
  name: string
  email: string
  phone: string | null
  role: UserRole
  roles: AppUserRole[]
  branches: AppUserBranch[]
  permissions: string[]
  isOwner: boolean
  isActive: boolean
  hasProfile: boolean
  hasRole: boolean
}
