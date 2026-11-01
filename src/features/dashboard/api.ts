import {
  fetchCollectionsReport,
  fetchInventoryReport,
  fetchSalesReport,
  fetchVehiclesReport,
  translateReportError,
} from '@/features/reports/api'
import type {
  CollectionsReport,
  InventoryReport,
  SalesReport,
  VehiclesReport,
} from '@/features/reports/types'
import { supabase } from '@/lib/supabase'

export interface OverdueInstallment {
  id: string
  installment_no: number
  due_date: string
  remaining_amount: number
  customer_id: string
  customer_name: string
  customer_code: string
}

export interface DashboardCounts {
  customers: number | null
  suppliers: number | null
}

export interface DashboardOverview {
  sales: SalesReport | null
  collections: CollectionsReport | null
  inventory: InventoryReport | null
  vehicles: VehiclesReport | null
  overdue: OverdueInstallment[] | null
  counts: DashboardCounts
}

async function resolve<T>(task: Promise<T>): Promise<T | null> {
  try {
    return await task
  } catch {
    return null
  }
}

async function countRows(table: 'customers' | 'suppliers'): Promise<number | null> {
  try {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })

    return error ? null : (count ?? 0)
  } catch {
    return null
  }
}

async function fetchOverdueInstallments(): Promise<OverdueInstallment[]> {
  const { data, error } = await supabase
    .from('v_installment_status')
    .select('id, installment_no, due_date, remaining_amount, customer_id')
    .in('computed_status', ['overdue', 'due', 'partial'])
    .gt('remaining_amount', 0)
    .order('due_date', { ascending: true })
    .limit(50)

  if (error) throw new Error(translateReportError(error.message))

  const rows = (data ?? []) as unknown as Array<{
    id: string
    installment_no: number
    due_date: string
    remaining_amount: number
    customer_id: string
  }>

  if (rows.length === 0) return []

  const customerIds = Array.from(new Set(rows.map((row) => row.customer_id)))

  const { data: customerRows, error: customersError } = await supabase
    .from('customers')
    .select('id, full_name, code')
    .in('id', customerIds)

  if (customersError) throw new Error(translateReportError(customersError.message))

  const names = new Map(
    (customerRows ?? []).map((customer) => [
      customer.id,
      { full_name: customer.full_name, code: customer.code },
    ]),
  )

  return rows.map((row) => ({
    id: row.id,
    installment_no: row.installment_no,
    due_date: row.due_date,
    remaining_amount: row.remaining_amount,
    customer_id: row.customer_id,
    customer_name: names.get(row.customer_id)?.full_name ?? 'عميل',
    customer_code: names.get(row.customer_id)?.code ?? '',
  }))
}

export async function fetchDashboardOverview(options?: {
  includeReports?: boolean
  includeVehicles?: boolean
  includeInstallments?: boolean
}): Promise<DashboardOverview> {
  const includeReports = options?.includeReports ?? true
  const includeVehicles = options?.includeVehicles ?? true
  const includeInstallments = options?.includeInstallments ?? true

  const [sales, collections, inventory, vehicles, overdue, customersCount, suppliersCount] =
    await Promise.all([
      resolve(includeReports ? fetchSalesReport() : Promise.reject(null)),
      resolve(includeReports ? fetchCollectionsReport() : Promise.reject(null)),
      resolve(includeReports ? fetchInventoryReport() : Promise.reject(null)),
      resolve(includeVehicles ? fetchVehiclesReport() : Promise.reject(null)),
      resolve(includeInstallments ? fetchOverdueInstallments() : Promise.reject(null)),
      countRows('customers'),
      countRows('suppliers'),
    ])

  return {
    sales,
    collections,
    inventory,
    vehicles,
    overdue,
    counts: { customers: customersCount, suppliers: suppliersCount },
  }
}
