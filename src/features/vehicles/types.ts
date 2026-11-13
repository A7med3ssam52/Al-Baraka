export type VehicleType = 'tuktuk' | 'motorcycle' | 'tricycle' | 'scooter'

export type VehicleStatus =
  'available' | 'reserved' | 'sold' | 'returned' | 'maintenance' | 'damaged' | 'archived'

export interface VehicleRecord {
  id: string
  code: string
  vehicle_type: VehicleType
  vehicle_class: string | null
  brand_name: string | null
  model_name: string | null
  manufacture_year: number | null
  color: string | null
  chassis_no: string
  engine_no: string
  supplier_name: string | null
  purchase_date: string | null
  purchase_price: number
  transport_cost: number
  prep_cost: number
  approved_cost: number
  suggested_price: number
  branch_id: string
  status: VehicleStatus
  created_at: string
  current_customer_id: string | null
  current_customer_name: string | null
  current_customer_code: string | null
}

export interface VehicleCreateInput {
  chassis_no: string
  engine_no: string
  vehicle_type: VehicleType
  vehicle_class?: string | null
  brand_id?: string | null
  model_id?: string | null
  manufacture_year?: number | null
  color?: string | null
  supplier_id?: string | null
  purchase_date?: string | null
  purchase_price?: number
  transport_cost?: number
  prep_cost?: number
  approved_cost?: number
  suggested_price?: number
  branch_id?: string | null
}

export interface VehicleUpdateInput {
  vehicle_type: VehicleType
  vehicle_class?: string | null
  brand_id?: string | null
  model_id?: string | null
  manufacture_year?: number | null
  color?: string | null
  supplier_id?: string | null
  purchase_date?: string | null
  suggested_price?: number
  notes?: string | null
  chassis_no?: string | null
  engine_no?: string | null
}

export const vehicleStatusLabels: Record<VehicleStatus, string> = {
  available: 'متاحة',
  reserved: 'محجوزة',
  sold: 'مباعة',
  returned: 'مرتجعة',
  maintenance: 'في الصيانة',
  damaged: 'تالفة',
  archived: 'مؤرشفة',
}

export const vehicleTypeLabels: Record<VehicleType, string> = {
  tuktuk: 'توكتوك',
  motorcycle: 'موتوسيكل',
  tricycle: 'تروسيكل',
  scooter: 'اسكوتر',
}

/** Allowed status transitions; mirrors set_vehicle_status in the database. */
export const vehicleTransitions: Record<VehicleStatus, VehicleStatus[]> = {
  available: ['reserved', 'sold', 'maintenance', 'damaged', 'archived'],
  reserved: ['available', 'sold'],
  sold: ['returned'],
  returned: ['available', 'damaged'],
  maintenance: ['available', 'damaged'],
  damaged: ['available', 'maintenance'],
  archived: [],
}

export const vehicleStatusBadgeVariant: Record<
  VehicleStatus,
  'success' | 'warning' | 'secondary' | 'destructive'
> = {
  available: 'success',
  reserved: 'warning',
  sold: 'secondary',
  returned: 'warning',
  maintenance: 'warning',
  damaged: 'destructive',
  archived: 'secondary',
}
