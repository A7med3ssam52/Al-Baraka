export interface InventoryReportRow {
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
  is_low: boolean
}

export interface InventoryReport {
  summary: {
    branch_count: number
    product_count: number
    total_quantity: number
    total_value: number
    low_stock_count: number
  }
  rows: InventoryReportRow[]
}

export interface VehicleReportRow {
  vehicle_id: string
  vehicle_code: string
  chassis_no: string
  engine_no: string
  vehicle_type: string
  vehicle_class: string | null
  brand_name: string | null
  model_name: string | null
  manufacture_year: number | null
  color: string | null
  status: string
  branch_id: string
  branch_name: string
  supplier_name: string | null
  purchase_date: string | null
  purchase_price: number
  transport_cost: number
  prep_cost: number
  approved_cost: number
  suggested_price: number
  expected_margin: number
}

export interface VehiclesReport {
  summary: {
    vehicle_count: number
    available_count: number
    reserved_count: number
    sold_count: number
    returned_count: number
    maintenance_count: number
    damaged_count: number
    archived_count: number
    total_purchase_price: number
    total_approved_cost: number
    total_suggested_price: number
    expected_margin: number
  }
  rows: VehicleReportRow[]
}

export interface VehicleMovementRow {
  movement_id: string
  vehicle_id: string
  vehicle_code: string
  chassis_no: string
  movement_type: string
  quantity: number
  unit_cost: number
  branch_id: string
  branch_name: string
  reference_type: string | null
  reference_id: string | null
  reference_number: string | null
  notes: string | null
  created_at: string
  created_by_name: string | null
}

export interface PurchaseReportInvoice {
  id: string
  number: string
  invoice_date: string
  status: string
  payment_method: string
  supplier_id: string
  supplier_code: string
  supplier_name: string
  branch_name: string
  total: number
  paid_amount: number
  remaining_amount: number
  approved_at: string | null
}

export interface PurchaseSupplierSummary {
  supplier_id: string
  supplier_code: string
  supplier_name: string
  invoice_count: number
  total: number
  paid_amount: number
  remaining_amount: number
}

export interface PurchasesReport {
  summary: {
    invoice_count: number
    approved_count: number
    draft_count: number
    cancelled_count: number
    supplier_count: number
    approved_total: number
    paid_total: number
    remaining_total: number
    draft_total: number
  }
  by_supplier: PurchaseSupplierSummary[]
  invoices: PurchaseReportInvoice[]
}

export interface CollectionsPaymentRow {
  id: string
  payment_date: string
  amount: number
  payment_method: string
  payment_type: string
  receipt_number: string | null
  customer_id?: string
  customer_name: string
  customer_code: string
  branch_name: string
  contract_number: string | null
}

export interface CollectionsReport {
  summary: {
    total_collected: number
    payment_count: number
    cash_total: number
    bank_total: number
    down_payment_total: number
    installment_total: number
  }
  payments: CollectionsPaymentRow[]
}

export interface SalesReportInvoice {
  id: string
  number: string
  invoice_date: string
  status: string
  sale_type: string
  total: number
  paid_amount: number
  remaining_amount: number
  customer_id?: string
  customer_name: string
  customer_code: string
  branch_name: string
}

export interface SalesReport {
  summary: {
    invoice_count: number
    approved_count: number
    draft_count: number
    cancelled_count: number
    total_amount: number
    paid_amount: number
    remaining_amount: number
    cash_count: number
    installment_count: number
    vehicle_count: number
    product_revenue: number
  }
  by_branch: Array<{
    branch_id: string
    branch_name: string
    invoice_count: number
    total: number
    paid_amount: number
    remaining_amount: number
  }>
  invoices: SalesReportInvoice[]
}

export interface VehicleCostBreakdown {
  vehicle: {
    id: string
    code: string
    chassis_no: string
    status: string
    branch_name: string | null
    supplier_name: string | null
    purchase_price: number
    transport_cost: number
    prep_cost: number
    approved_cost: number
    suggested_price: number
  }
  purchase: {
    invoice_id: string
    number: string
    invoice_date: string
    status: string
    supplier_name: string | null
    purchase_price: number
    allocated_transport: number
    allocated_prep: number
    landed_unit_cost: number
  } | null
  direct_costs: { transport_cost: number; prep_cost: number }
  recomputed_cost: number
  approved_cost: number
  difference: number
}

export const vehicleStatusLabels: Record<string, string> = {
  available: 'متاح',
  reserved: 'محجوز',
  sold: 'مباع',
  returned: 'مرتجع',
  maintenance: 'تحت الصيانة',
  damaged: 'تالف',
  archived: 'مؤرشف',
}
