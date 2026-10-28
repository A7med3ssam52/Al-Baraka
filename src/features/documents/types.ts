export type DocumentOwnerType = 'customer' | 'supplier'

export type DocumentType = 'id_card' | 'commercial_registry' | 'other'

export type DocumentStatus = 'pending' | 'complete'

export interface DocumentRecord {
  id: string
  doc_number: string
  title: string
  doc_type: DocumentType
  owner_type: DocumentOwnerType
  customer_id: string | null
  supplier_id: string | null
  status: DocumentStatus
  notes: string | null
  created_at: string
}

export interface DocumentFileRecord {
  id: string
  document_id: string
  public_id: string
  resource_type: 'image' | 'raw'
  format: string
  file_name: string | null
  bytes: number
  width: number | null
  height: number | null
  uploaded_at: string
}

export interface DocumentAccessLogRecord {
  id: string
  file_id: string | null
  action: 'view' | 'download' | 'list'
  accessed_at: string
  accessed_by: string | null
}

export const documentTypeLabels: Record<DocumentType, string> = {
  id_card: 'بطاقة / هوية',
  commercial_registry: 'سجل تجاري',
  other: 'مستند آخر',
}

export const documentStatusLabels: Record<DocumentStatus, string> = {
  pending: 'بانتظار الملفات',
  complete: 'مكتمل',
}

export const accessActionLabels: Record<DocumentAccessLogRecord['action'], string> = {
  view: 'عرض',
  download: 'تنزيل',
  list: 'مراجعة قائمة',
}
