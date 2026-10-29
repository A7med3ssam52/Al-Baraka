export type MovementType =
  | 'opening'
  | 'purchase'
  | 'sale'
  | 'return_in'
  | 'return_out'
  | 'transfer_in'
  | 'transfer_out'
  | 'adjustment'
  | 'count'
  | 'damage'

export interface StockMovementRecord {
  id: string
  branch_id: string
  branch_name: string
  product_id: string | null
  product_code: string | null
  product_name: string | null
  vehicle_id: string | null
  vehicle_code: string | null
  movement_type: MovementType
  quantity: number
  unit_cost: number
  reference_type: string | null
  reference_id: string | null
  notes: string | null
  created_at: string
  created_by_name: string | null
}

export interface StockMovementInput {
  movement_type: MovementType
  quantity: number
  product_id?: string | null
  vehicle_id?: string | null
  unit_cost?: number
  branch_id?: string | null
  reference_type?: string | null
  reference_id?: string | null
  notes?: string | null
}

export interface ProductStockRecord {
  branch_id: string
  branch_name: string
  product_id: string
  product_code: string
  product_name: string
  unit_name: string | null
  quantity: number
  reorder_level: number
  unit_cost: number
  stock_value: number
}

export const movementTypeLabels: Record<MovementType, string> = {
  opening: 'رصيد افتتاحي',
  purchase: 'شراء',
  sale: 'بيع',
  return_in: 'مرتجع من عميل',
  return_out: 'مرتجع إلى مورد',
  transfer_in: 'تحويل وارد',
  transfer_out: 'تحويل صادر',
  adjustment: 'تسوية',
  count: 'جرد',
  damage: 'تالف',
}

/** Direction expected by the database for each movement type (0 = either). */
export const movementTypeSign: Record<MovementType, 1 | -1 | 0> = {
  opening: 1,
  purchase: 1,
  sale: -1,
  return_in: 1,
  return_out: -1,
  transfer_in: 1,
  transfer_out: -1,
  adjustment: 0,
  count: 0,
  damage: -1,
}
