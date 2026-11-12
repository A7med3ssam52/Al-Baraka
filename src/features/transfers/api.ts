import { isFriendlyArabicMessage } from '@/lib/friendly-error'

import type {
  StockTransferDetail,
  StockTransferInput,
  StockTransferRecord,
  StockTransferStatus,
} from './types'
import { rpcOfflineAware } from '@/lib/offline'

const errorMessages: Record<string, string> = {
  forbidden: 'لا تملك الصلاحية لتنفيذ هذه العملية.',
  not_authenticated: 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.',
  invalid_transfer_branch: 'اختر فرعين مختلفين للتحويل.',
  invalid_branch: 'الفرع غير موجود أو غير نشط.',
  invalid_transfer_items: 'أضف سطرًا واحدًا على الأقل للتحويل.',
  invalid_transfer_item_target: 'كل سطر يجب أن يحتوي منتجًا أو مركبة واحدة فقط.',
  invalid_transfer_item_numbers: 'الكمية وتكلفة الوحدة غير صحيحة.',
  product_missing: 'المنتج غير موجود أو مؤرشف.',
  vehicle_missing: 'المركبة غير موجودة.',
  vehicle_branch_mismatch: 'المركبة ليست في الفرع المصدر.',
  vehicle_unavailable: 'المركبة غير متاحة للتحويل.',
  transfer_missing: 'التحويل غير موجود.',
  transfer_not_draft: 'لا يمكن تنفيذ العملية إلا على مسودة.',
  transfer_not_in_transit: 'لا يمكن استلام تحويل لم يُرسل بعد.',
  insufficient_stock: 'الرصيد لا يكفي لإتمام التحويل.',
}

export function translateTransferError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()

  if (isFriendlyArabicMessage(key)) return key

  if (errorMessages[key]) return errorMessages[key]

  if (key.toLowerCase().includes('permission denied')) {
    return 'لا تملك الصلاحية لتنفيذ هذه العملية.'
  }

  return 'تعذر إكمال العملية. تحقق من الاتصال وحاول مرة أخرى.'
}

export async function fetchStockTransfers(options?: {
  status?: StockTransferStatus | 'all'
  branchId?: string | null
}): Promise<StockTransferRecord[]> {
  const { data, error } = await rpcOfflineAware('list_stock_transfers', {
    p_status: options?.status ?? 'all',
    p_branch_id: options?.branchId ?? null,
  })

  if (error) throw new Error(translateTransferError(error.message))

  return (data ?? []) as unknown as StockTransferRecord[]
}

export async function fetchStockTransfer(transferId: string): Promise<StockTransferDetail> {
  const { data, error } = await rpcOfflineAware('get_stock_transfer', {
    p_transfer_id: transferId,
  })

  if (error) throw new Error(translateTransferError(error.message))

  return data as unknown as StockTransferDetail
}

export async function createStockTransfer(input: StockTransferInput): Promise<StockTransferRecord> {
  const { data, error } = await rpcOfflineAware('create_stock_transfer', {
    p_from_branch_id: input.from_branch_id,
    p_to_branch_id: input.to_branch_id,
    p_items: input.items,
    p_transfer_date: input.transfer_date,
    p_notes: input.notes?.trim() || null,
  })

  if (error) throw new Error(translateTransferError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as StockTransferRecord
}

export async function sendStockTransfer(transferId: string): Promise<StockTransferRecord> {
  const { data, error } = await rpcOfflineAware('send_stock_transfer', {
    p_transfer_id: transferId,
  })

  if (error) throw new Error(translateTransferError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as StockTransferRecord
}

export async function receiveStockTransfer(transferId: string): Promise<StockTransferRecord> {
  const { data, error } = await rpcOfflineAware('receive_stock_transfer', {
    p_transfer_id: transferId,
  })

  if (error) throw new Error(translateTransferError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as StockTransferRecord
}

export async function cancelStockTransfer(
  transferId: string,
  reason?: string,
): Promise<StockTransferRecord> {
  const { data, error } = await rpcOfflineAware('cancel_stock_transfer', {
    p_transfer_id: transferId,
    p_reason: reason?.trim() || null,
  })

  if (error) throw new Error(translateTransferError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as StockTransferRecord
}

export async function updateStockTransfer(
  transferId: string,
  input: StockTransferInput,
): Promise<StockTransferRecord> {
  const { data, error } = await rpcOfflineAware('update_stock_transfer', {
    p_transfer_id: transferId,
    p_from_branch_id: input.from_branch_id,
    p_to_branch_id: input.to_branch_id,
    p_items: input.items,
    p_transfer_date: input.transfer_date,
    p_notes: input.notes?.trim() || null,
  })

  if (error) throw new Error(translateTransferError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as StockTransferRecord
}
