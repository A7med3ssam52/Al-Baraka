import { supabase } from '@/lib/supabase'

import type {
  MovementType,
  ProductStockRecord,
  StockMovementInput,
  StockMovementRecord,
} from './types'

const errorMessages: Record<string, string> = {
  forbidden: 'لا تملك الصلاحية لتنفيذ هذه العملية.',
  not_authenticated: 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.',
  invalid_movement_type: 'نوع الحركة غير معروف.',
  invalid_movement_quantity: 'الكمية يجب أن تكون أكبر من صفر وبإشارة مناسبة.',
  invalid_movement_sign: 'إشارة الكمية لا تناسب نوع الحركة.',
  invalid_movement_target: 'اختر منتجًا أو مركبة للحركة.',
  invalid_branch: 'الفرع غير موجود أو غير نشط.',
  product_missing: 'المنتج غير موجود.',
  vehicle_missing: 'المركبة غير موجودة.',
  vehicle_branch_mismatch: 'المركبة ليست في هذا الفرع.',
  insufficient_stock: 'الرصيد لا يكفي لهذه الحركة.',
}

export function translateStockError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()

  if (errorMessages[key]) return errorMessages[key]

  return 'تعذر إكمال العملية. تحقق من الاتصال وحاول مرة أخرى.'
}

export async function fetchStockMovements(options?: {
  productId?: string
  vehicleId?: string
  movementType?: MovementType | 'all'
  from?: string
  to?: string
}): Promise<StockMovementRecord[]> {
  const { data, error } = await supabase.rpc('list_stock_movements', {
    p_product_id: options?.productId ?? null,
    p_vehicle_id: options?.vehicleId ?? null,
    p_movement_type: options?.movementType ?? null,
    p_from: options?.from ?? null,
    p_to: options?.to ?? null,
  })

  if (error) throw new Error(translateStockError(error.message))

  return (data ?? []) as unknown as StockMovementRecord[]
}

export async function recordStockMovement(input: StockMovementInput): Promise<StockMovementRecord> {
  const { data, error } = await supabase.rpc('record_stock_movement', {
    p_movement_type: input.movement_type,
    p_quantity: input.quantity,
    p_product_id: input.product_id ?? null,
    p_vehicle_id: input.vehicle_id ?? null,
    p_unit_cost: input.unit_cost ?? 0,
    p_branch_id: input.branch_id ?? null,
    p_reference_type: input.reference_type ?? null,
    p_reference_id: input.reference_id ?? null,
    p_notes: input.notes ?? null,
  })

  if (error) throw new Error(translateStockError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as StockMovementRecord
}

export async function fetchProductStock(branchId?: string, search?: string) {
  const { data, error } = await supabase.rpc('list_product_stock', {
    p_branch_id: branchId ?? null,
    p_search: search?.trim() || null,
  })

  if (error) throw new Error(translateStockError(error.message))

  return (data ?? []) as unknown as ProductStockRecord[]
}
