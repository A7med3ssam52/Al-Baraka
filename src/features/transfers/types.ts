export type StockTransferStatus = 'draft' | 'in_transit' | 'received' | 'cancelled'

export interface StockTransferRecord {
  id: string
  number: string
  from_branch_id: string
  from_branch_name: string
  to_branch_id: string
  to_branch_name: string
  status: StockTransferStatus
  transfer_date: string
  item_count: number
  total_quantity: number
  total_value: number
  sent_at: string | null
  received_at: string | null
  created_at: string
}

export interface StockTransferItem {
  id: string
  transfer_id: string
  line_no: number
  product_id: string | null
  vehicle_id: string | null
  quantity: number
  unit_cost: number
  product_code: string | null
  product_name: string | null
  vehicle_code: string | null
  vehicle_chassis: string | null
}

export interface StockTransferDetail {
  transfer: StockTransferRecord & {
    notes: string | null
    sent_by: string | null
    received_by: string | null
    cancelled_at: string | null
    created_at: string
  }
  items: StockTransferItem[]
}

export interface StockTransferItemInput {
  product_id?: string | null
  vehicle_id?: string | null
  quantity: number
}

export interface StockTransferInput {
  from_branch_id: string
  to_branch_id: string
  transfer_date: string
  notes?: string | null
  items: StockTransferItemInput[]
}

export const stockTransferStatusLabels: Record<StockTransferStatus, string> = {
  draft: 'مسودة',
  in_transit: 'في الطريق',
  received: 'تم الاستلام',
  cancelled: 'ملغاة',
}

export const stockTransferStatusBadge: Record<
  StockTransferStatus,
  'secondary' | 'warning' | 'success' | 'destructive'
> = {
  draft: 'secondary',
  in_transit: 'warning',
  received: 'success',
  cancelled: 'destructive',
}
