export type UserRole =
  'owner' | 'manager' | 'accountant' | 'sales' | 'collection' | 'inventory' | 'viewer'

export interface Branch {
  id: string
  code: string
  name: string
  address: string
  isActive: boolean
}

export interface AppUser {
  id: string
  name: string
  email: string
  role: UserRole
  branchIds: string[]
  isActive: boolean
}
