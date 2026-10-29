export type StockCountStatus = 'draft' | 'approved' | 'cancelled'

export interface StockCountRecord {
  id: string
  number: string
  branch_id: string
  branch_name: string
  count_date: string
  status: StockCountStatus
  item_count: number
  difference_count: number
  total_difference_value: number
  approved_at: string | null
  created_at: string
}

export interface StockCountItem {
  id: string
  count_id: string
  line_no: number
  product_id: string
  system_qty: number
  counted_qty: number
  difference: number
  unit_cost: number
  notes: string | null
  product_code: string
  product_name: string
  unit_name: string | null
}

export interface StockCountDetail {
  count: StockCountRecord & {
    notes: string | null
    cancelled_at: string | null
    created_at: string
  }
  items: StockCountItem[]
}

export interface StockCountInput {
  branch_id: string
  count_date: string
  notes?: string | null
  product_ids?: string[] | null
}

export interface StockCountLineUpdate {
  product_id: string
  counted_qty: number
  notes?: string | null
}

export const stockCountStatusLabels: Record<StockCountStatus, string> = {
  draft: 'مسودة',
  approved: 'معتمد',
  cancelled: 'ملغى',
}

export const stockCountStatusBadge: Record<
  StockCountStatus,
  'secondary' | 'success' | 'destructive'
> = {
  draft: 'secondary',
  approved: 'success',
  cancelled: 'destructive',
}
