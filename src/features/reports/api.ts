import { supabase } from '@/lib/supabase'
import { isFriendlyArabicMessage } from '@/lib/friendly-error'

import type {
  CollectionsReport,
  InventoryReport,
  PurchasesReport,
  SalesReport,
  VehicleCostBreakdown,
  VehicleMovementRow,
  VehiclesReport,
} from './types'

const errorMessages: Record<string, string> = {
  forbidden: 'لا تملك الصلاحية لعرض هذا التقرير.',
  not_authenticated: 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.',
  vehicle_missing: 'المركبة غير موجودة.',
  supplier_missing: 'المورد غير موجود في فروعك.',
}

export function translateReportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()

  if (isFriendlyArabicMessage(key)) return key

  if (errorMessages[key]) return errorMessages[key]

  if (key.toLowerCase().includes('permission denied')) {
    return 'لا تملك الصلاحية لعرض هذا التقرير.'
  }

  return 'تعذر تحميل التقرير. تحقق من الاتصال وحاول مرة أخرى.'
}

export async function fetchInventoryReport(options?: {
  branchId?: string | null
  search?: string
}): Promise<InventoryReport> {
  const { data, error } = await supabase.rpc('get_inventory_report', {
    p_branch_id: options?.branchId ?? null,
    p_search: options?.search?.trim() || null,
  })

  if (error) throw new Error(translateReportError(error.message))

  return data as unknown as InventoryReport
}

export async function fetchVehiclesReport(options?: {
  branchId?: string | null
  status?: string
}): Promise<VehiclesReport> {
  const { data, error } = await supabase.rpc('get_vehicles_report', {
    p_branch_id: options?.branchId ?? null,
    p_status: options?.status ?? 'all',
  })

  if (error) throw new Error(translateReportError(error.message))

  return data as unknown as VehiclesReport
}

export async function fetchVehicleMovements(options?: {
  vehicleId?: string | null
  from?: string
  to?: string
}): Promise<VehicleMovementRow[]> {
  const { data, error } = await supabase.rpc('list_vehicle_movements', {
    p_vehicle_id: options?.vehicleId ?? null,
    p_from: options?.from || null,
    p_to: options?.to || null,
  })

  if (error) throw new Error(translateReportError(error.message))

  return (data ?? []) as unknown as VehicleMovementRow[]
}

export async function fetchPurchasesReport(options?: {
  from?: string
  to?: string
  supplierId?: string | null
}): Promise<PurchasesReport> {
  const { data, error } = await supabase.rpc('get_purchases_report', {
    p_from: options?.from || null,
    p_to: options?.to || null,
    p_supplier_id: options?.supplierId ?? null,
  })

  if (error) throw new Error(translateReportError(error.message))

  return data as unknown as PurchasesReport
}

export async function fetchCollectionsReport(options?: {
  from?: string
  to?: string
  branchId?: string | null
}): Promise<CollectionsReport> {
  const { data, error } = await supabase.rpc('get_collections_report', {
    p_from: options?.from || null,
    p_to: options?.to || null,
    p_branch_id: options?.branchId ?? null,
  })

  if (error) throw new Error(translateReportError(error.message))

  return data as unknown as CollectionsReport
}

export async function fetchSalesReport(options?: {
  from?: string
  to?: string
  branchId?: string | null
  status?: string
}): Promise<SalesReport> {
  const { data, error } = await supabase.rpc('get_sales_report', {
    p_from: options?.from || null,
    p_to: options?.to || null,
    p_branch_id: options?.branchId ?? null,
    p_status: options?.status ?? 'all',
  })

  if (error) throw new Error(translateReportError(error.message))

  return data as unknown as SalesReport
}

export async function fetchVehicleCostBreakdown(vehicleId: string): Promise<VehicleCostBreakdown> {
  const { data, error } = await supabase.rpc('get_vehicle_cost_breakdown', {
    p_vehicle_id: vehicleId,
  })

  if (error) throw new Error(translateReportError(error.message))

  return data as unknown as VehicleCostBreakdown
}
