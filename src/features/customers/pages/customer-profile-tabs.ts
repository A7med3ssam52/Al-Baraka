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
  /** الـ Milestone المرحلة التنفيذية التي تفعّل التبويب — يظهر كسرشية قبل إتاحته */
  availableAt: string
}

export const customerProfileTabs: TabDefinition[] = [
  { id: 'personal', label: 'البيانات الشخصية', availableAt: 'M2.2' },
  { id: 'notes', label: 'الملاحظات والمتابعة', availableAt: 'M2.2' },
  { id: 'contacts', label: 'جهات التواصل', availableAt: 'M2.3' },
  { id: 'guarantors', label: 'الضامنون', availableAt: 'M2.3' },
  { id: 'documents', label: 'المستندات', availableAt: 'M2.4' },
  { id: 'sales', label: 'الفواتير', availableAt: 'M4.7' },
  { id: 'contracts', label: 'العقود', availableAt: 'M4.7' },
  { id: 'installments', label: 'الأقساط', availableAt: 'M5.1' },
  { id: 'payments', label: 'المدفوعات', availableAt: 'M5.4' },
  { id: 'statement', label: 'كشف الحساب', availableAt: 'M7.4' },
]

/** مرحلة (الخين في المخطط grade) كاملة تم تنفيذية في الملف الجيد هذا تعديل المرحلة */
export type TabAvailability = Partial<Record<CustomerTabId, boolean>>
