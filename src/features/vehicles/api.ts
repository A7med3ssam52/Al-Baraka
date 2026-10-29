import { supabase } from '@/lib/supabase'

import type { VehicleCreateInput, VehicleRecord, VehicleStatus, VehicleUpdateInput } from './types'

const errorMessages: Record<string, string> = {
  forbidden: 'لا تملك الصلاحية لتنفيذ هذه العملية.',
  not_authenticated: 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.',
  invalid_vehicle_type: 'نوع المركبة غير معروف.',
  invalid_serial_number: 'رقم الشاسيه ورقم الموتور مطلوبان (3 خانات على الأقل).',
  duplicate_chassis: 'رقم الشاسيه مسجل بالفعل لمركبة أخرى.',
  duplicate_engine: 'رقم الموتور مسجل بالفعل لمركبة أخرى.',
  invalid_branch: 'الفرع غير موجود أو غير نشط.',
  invalid_vehicle_numbers: 'قيم الأسعار والتكاليف يجب ألا تكون سالبة.',
  vehicle_missing: 'المركبة غير موجودة أو خارج نطاق فرعك.',
  vehicle_locked: 'لا يمكن تعديل مركبة مباعة أو مؤرشفة.',
  invalid_status: 'حالة المركبة غير معروفة.',
  invalid_transition: 'هذا الانتقال بين حالات المركبة غير مسموح.',
}

export function translateVehicleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()

  if (errorMessages[key]) return errorMessages[key]

  if (key.toLowerCase().includes('duplicate key') && key.includes('chassis')) {
    return 'رقم الشاسيه مسجل بالفعل لمركبة أخرى.'
  }
  if (key.toLowerCase().includes('duplicate key') && key.includes('engine')) {
    return 'رقم الموتور مسجل بالفعل لمركبة أخرى.'
  }

  return 'تعذر إكمال العملية. تحقق من الاتصال وحاول مرة أخرى.'
}

export async function fetchVehicles(options?: {
  status?: VehicleStatus | 'active' | 'all'
  search?: string
}): Promise<VehicleRecord[]> {
  const { data, error } = await supabase.rpc('list_vehicles', {
    p_status: options?.status ?? 'active',
    p_search: options?.search?.trim() || null,
  })

  if (error) throw new Error(translateVehicleError(error.message))

  return (data ?? []) as unknown as VehicleRecord[]
}

export async function createVehicle(input: VehicleCreateInput): Promise<VehicleRecord> {
  const { data, error } = await supabase.rpc('create_vehicle', {
    p_chassis_no: input.chassis_no,
    p_engine_no: input.engine_no,
    p_vehicle_type: input.vehicle_type,
    p_vehicle_class: input.vehicle_class ?? null,
    p_brand_id: input.brand_id ?? null,
    p_model_id: input.model_id ?? null,
    p_manufacture_year: input.manufacture_year ?? null,
    p_color: input.color ?? null,
    p_supplier_id: input.supplier_id ?? null,
    p_purchase_date: input.purchase_date ?? null,
    p_purchase_price: input.purchase_price ?? null,
    p_transport_cost: input.transport_cost ?? null,
    p_prep_cost: input.prep_cost ?? null,
    p_approved_cost: input.approved_cost ?? null,
    p_suggested_price: input.suggested_price ?? null,
    p_branch_id: input.branch_id ?? null,
  })

  if (error) throw new Error(translateVehicleError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as VehicleRecord
}

export async function updateVehicle(
  vehicleId: string,
  input: VehicleUpdateInput,
): Promise<VehicleRecord> {
  const { data, error } = await supabase.rpc('update_vehicle', {
    p_vehicle_id: vehicleId,
    p_vehicle_type: input.vehicle_type,
    p_vehicle_class: input.vehicle_class ?? null,
    p_brand_id: input.brand_id ?? null,
    p_model_id: input.model_id ?? null,
    p_manufacture_year: input.manufacture_year ?? null,
    p_color: input.color ?? null,
    p_supplier_id: input.supplier_id ?? null,
    p_purchase_date: input.purchase_date ?? null,
    p_suggested_price: input.suggested_price ?? null,
    p_notes: input.notes ?? null,
  })

  if (error) throw new Error(translateVehicleError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as VehicleRecord
}

export async function setVehicleStatus(
  vehicleId: string,
  status: VehicleStatus,
): Promise<VehicleRecord> {
  const { data, error } = await supabase.rpc('set_vehicle_status', {
    p_vehicle_id: vehicleId,
    p_status: status,
  })

  if (error) throw new Error(translateVehicleError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as VehicleRecord
}
