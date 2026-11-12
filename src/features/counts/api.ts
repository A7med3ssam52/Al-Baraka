import { isFriendlyArabicMessage } from '@/lib/friendly-error'

import type {
  StockCountDetail,
  StockCountInput,
  StockCountLineUpdate,
  StockCountRecord,
  StockCountStatus,
} from './types'
import { rpcOfflineAware } from '@/lib/offline'

const errorMessages: Record<string, string> = {
  forbidden: 'لا تملك الصلاحية لتنفيذ هذه العملية.',
  not_authenticated: 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.',
  invalid_branch: 'الفرع غير موجود أو غير نشط.',
  count_already_open: 'يوجد جرد مسودة مفتوح على هذا الفرع. أكمله أو ألغِه أولًا.',
  invalid_count_items: 'اختر منتجًا واحدًا على الأقل للجرد.',
  invalid_count_quantity: 'الكمية الفعلية يجب ألا تكون سالبة.',
  count_item_missing: 'بند الجرد غير موجود في هذه الجلسة.',
  count_missing: 'جلسة الجرد غير موجودة.',
  count_not_draft: 'لا يمكن تنفيذ العملية إلا على جرد مسودة.',
  insufficient_stock: 'الكمية الفعلية ستجعل الرصيد سالبًا.',
}

export function translateCountError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()

  if (isFriendlyArabicMessage(key)) return key

  if (errorMessages[key]) return errorMessages[key]

  if (key.toLowerCase().includes('permission denied')) {
    return 'لا تملك الصلاحية لتنفيذ هذه العملية.'
  }

  return 'تعذر إكمال العملية. تحقق من الاتصال وحاول مرة أخرى.'
}

export async function fetchStockCounts(options?: {
  status?: StockCountStatus | 'all'
  branchId?: string | null
}): Promise<StockCountRecord[]> {
  const { data, error } = await rpcOfflineAware('list_stock_counts', {
    p_status: options?.status ?? 'all',
    p_branch_id: options?.branchId ?? null,
  })

  if (error) throw new Error(translateCountError(error.message))

  return (data ?? []) as unknown as StockCountRecord[]
}

export async function fetchStockCount(countId: string): Promise<StockCountDetail> {
  const { data, error } = await rpcOfflineAware('get_stock_count', {
    p_count_id: countId,
  })

  if (error) throw new Error(translateCountError(error.message))

  return data as unknown as StockCountDetail
}

export async function createStockCount(input: StockCountInput): Promise<StockCountRecord> {
  const { data, error } = await rpcOfflineAware('create_stock_count', {
    p_product_ids: input.product_ids && input.product_ids.length > 0 ? input.product_ids : null,
    p_count_date: input.count_date,
    p_notes: input.notes?.trim() || null,
    p_branch_id: input.branch_id,
  })

  if (error) throw new Error(translateCountError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as StockCountRecord
}

export async function updateStockCount(
  countId: string,
  lines: StockCountLineUpdate[],
): Promise<StockCountRecord> {
  const { data, error } = await rpcOfflineAware('update_stock_count', {
    p_count_id: countId,
    p_items: lines,
  })

  if (error) throw new Error(translateCountError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as StockCountRecord
}

export async function approveStockCount(countId: string): Promise<StockCountRecord> {
  const { data, error } = await rpcOfflineAware('approve_stock_count', {
    p_count_id: countId,
  })

  if (error) throw new Error(translateCountError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as StockCountRecord
}

export async function cancelStockCount(
  countId: string,
  reason?: string,
): Promise<StockCountRecord> {
  const { data, error } = await rpcOfflineAware('cancel_stock_count', {
    p_count_id: countId,
    p_reason: reason?.trim() || null,
  })

  if (error) throw new Error(translateCountError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as StockCountRecord
}
