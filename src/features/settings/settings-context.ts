import { createContext } from 'react'

import { APP_INFO } from '@/lib/constants'

import type { DocumentType, SystemSettings } from './types'

const fallbackPrefixes: Record<DocumentType, string> = {
  sales_invoice: 'SAL',
  purchase_invoice: 'PUR',
  contract: 'CON',
  receipt: 'REC',
  payment: 'PAY',
  journal_entry: 'JV',
}

export const fallbackSettings: SystemSettings = {
  id: true,
  app_name: APP_INFO.name,
  branch_code: APP_INFO.branch.code,
  currency: APP_INFO.currency,
  timezone: APP_INFO.timezone,
  logo_url: null,
  address: APP_INFO.branch.address,
  phone: APP_INFO.contacts[0]?.phones[0] ?? null,
  email: null,
  tax_number: null,
  document_prefixes: fallbackPrefixes,
  default_discount_limit: 0,
  updated_at: null,
}

export interface SettingsContextValue {
  settings: SystemSettings
  loading: boolean
  error: string | null
  usingFallback: boolean
  refresh: () => Promise<void>
}

export const SettingsContext = createContext<SettingsContextValue | null>(null)
