import { supabase } from '@/lib/supabase'

import { uploadToCloudinary } from '@/features/uploads/cloudinary'

import type {
  DocumentAccessLogRecord,
  DocumentFileRecord,
  DocumentOwnerType,
  DocumentRecord,
  DocumentType,
} from './types'

export async function deleteDocument(documentId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_document', {
    p_document_id: documentId,
  })

  if (error) throw new Error(translateDocumentError(error.message))
}

const errorMessages: Record<string, string> = {
  forbidden: 'لا تملك الصلاحية لتنفيذ هذه العملية.',
  not_authenticated: 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.',
  invalid_document_type: 'نوع المستند غير معروف.',
  invalid_document_title: 'عنوان المستند مطلوب (حرفان على الأقل).',
  invalid_owner_type: 'مالك المستند (عميل أو مورد) غير معروف.',
  invalid_public_id: 'معرّف الملف غير صالح.',
  invalid_file_format: 'صيغة الملف غير مدعومة (JPG أو PNG أو WebP أو PDF).',
  invalid_file_size: 'حجم الملف يجب أن يكون بين 1 بايت و10 ميجابايت.',
  invalid_action: 'نوع الوصول غير معروف.',
  customer_missing: 'العميل غير موجود.',
  supplier_missing: 'المورد غير موجود.',
  document_missing: 'المستند غير موجود.',
  document_file_missing: 'ملف المستند غير موجود.',
  unknown_code_entity: 'وحدة ترميز غير معروفة.',
}

export function translateDocumentError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()

  if (errorMessages[key]) return errorMessages[key]

  if (key.toLowerCase().includes('permission denied')) {
    return 'لا تملك الصلاحية لتنفيذ هذه العملية.'
  }

  return 'تعذر إكمال العملية. تحقق من الاتصال وحاول مرة أخرى.'
}

export async function fetchDocuments(
  ownerType: DocumentOwnerType,
  ownerId: string,
): Promise<DocumentRecord[]> {
  const { data, error } = await supabase.rpc('list_documents', {
    p_owner_type: ownerType,
    p_owner_id: ownerId,
  })

  if (error) throw new Error(translateDocumentError(error.message))

  return (data ?? []) as unknown as DocumentRecord[]
}

export async function createDocument(input: {
  title: string
  docType: DocumentType
  ownerType: DocumentOwnerType
  customerId?: string | null
  supplierId?: string | null
  notes?: string
}): Promise<DocumentRecord> {
  const { data, error } = await supabase.rpc('create_document', {
    p_title: input.title,
    p_doc_type: input.docType,
    p_owner_type: input.ownerType,
    p_customer_id: input.customerId ?? null,
    p_supplier_id: input.supplierId ?? null,
    p_notes: input.notes || null,
  })

  if (error) throw new Error(translateDocumentError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as DocumentRecord
}

/**
 * الدورة الآمنة (القسم 6.6): إنشاء المستند ← رفع مباشر موقَّع إلى Cloudinary
 * (type=authenticated) ← تأكيد الرفع وتسجيل الملف عبر RPC.
 */
export async function uploadDocumentFile(
  documentId: string,
  file: File,
): Promise<DocumentFileRecord> {
  const upload = await uploadToCloudinary(file, { resourceType: 'image' })

  const { data, error } = await supabase.rpc('attach_document_file', {
    p_document_id: documentId,
    p_public_id: upload.publicId,
    p_format: upload.format,
    p_bytes: upload.bytes,
    p_file_name: file.name,
    p_width: upload.width ?? null,
    p_height: upload.height ?? null,
    p_resource_type: 'image',
  })

  if (error) throw new Error(translateDocumentError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as DocumentFileRecord
}

/**
 * يطلب رابطًا موقَّعًا (type=authenticated) عبر دالة document-url، التي تسجّل
 * الوصول في document_access_logs قبل إعادة الرابط. لا يوجد رابط عام أبدًا.
 */
export async function getSecureFileUrl(
  documentId: string,
  fileId: string,
  action: 'view' | 'download' = 'view',
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{
    url?: string
  }>('document-url', {
    body: { documentId, fileId, action },
  })

  if (error) {
    const context = (error as { context?: Response }).context
    if (context) {
      const body = (await context
        .clone()
        .json()
        .catch(() => null)) as {
        error?: string
      } | null

      if (body?.error === 'forbidden') {
        throw new Error('لا تملك الصلاحية لفتح هذا المستند.')
      }
      if (body?.error === 'sensitive_forbidden') {
        throw new Error('هذا مستند حساس. يلزم صلاحية تنزيل المستندات الحساسة.')
      }
      if (body?.error === 'unauthorized') {
        throw new Error('انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.')
      }
      if (body?.error === 'cloudinary_not_configured') {
        throw new Error('خدمة الروابط المؤقتة غير مهيأة. راجع إعدادات النظام.')
      }
      if (body?.error === 'document_file_missing') {
        throw new Error('ملف المستند غير موجود.')
      }
    }

    throw new Error('تعذر تجهيز رابط العرض. حاول مرة أخرى.')
  }

  if (!data?.url) throw new Error('لم يصل رابط صالح من خدمة المستندات.')

  return data.url
}

export async function fetchDocumentFiles(documentId: string): Promise<DocumentFileRecord[]> {
  const { data, error } = await supabase
    .from('document_files')
    .select('*')
    .eq('document_id', documentId)
    .order('uploaded_at', { ascending: false })

  if (error) throw new Error(translateDocumentError(error.message))

  return (data ?? []) as unknown as DocumentFileRecord[]
}

export async function fetchDocumentAccessLogs(
  documentId: string,
): Promise<DocumentAccessLogRecord[]> {
  const { data, error } = await supabase.rpc('list_document_access_logs', {
    p_document_id: documentId,
  })

  if (error) throw new Error(translateDocumentError(error.message))

  return (data ?? []) as unknown as DocumentAccessLogRecord[]
}
