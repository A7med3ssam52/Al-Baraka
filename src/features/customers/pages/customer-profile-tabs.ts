export type CustomerTabId =
  | 'personal'
  | 'notes'
  | 'contacts'
  | 'guarantors'
  | 'sales'
  | 'contracts'
  | 'installments'
  | 'payments'
  | 'documents'
  | 'statement'

export interface TabDefinition {
  id: CustomerTabId
  label: string
}

export const customerProfileTabs: TabDefinition[] = [
  { id: 'personal', label: 'البيانات الشخصية' },
  { id: 'notes', label: 'الملاحظات والمتابعة' },
  { id: 'contacts', label: 'جهات التواصل' },
  { id: 'guarantors', label: 'الضامنون' },
  { id: 'installments', label: 'الأقساط' },
  { id: 'documents', label: 'المستندات' },
  { id: 'sales', label: 'الفواتير' },
  { id: 'contracts', label: 'العقود' },
  { id: 'payments', label: 'المدفوعات' },
  { id: 'statement', label: 'كشف الحساب' },
]

export type TabAvailability = Partial<Record<CustomerTabId, boolean>>
