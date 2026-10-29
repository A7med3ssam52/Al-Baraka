export type PurchaseStatus = 'draft' | 'approved' | 'cancelled'

export type PurchasePaymentMethod = 'cash' | 'bank' | 'credit'

export interface PurchaseInvoiceRecord {
  id: string
  number: string
  supplier_id: string
  supplier_name: string
  branch_id: string
  branch_name: string
  invoice_date: string
  subtotal: number
  discount: number
  transport_cost: number
  prep_cost: number
  total: number
  paid_amount: number
  remaining_amount: number
  payment_method: PurchasePaymentMethod
  status: PurchaseStatus
  item_count: number
  document_id: string | null
  created_at: string
}

export interface PurchaseInvoiceItemRecord {
  id: string
  invoice_id: string
  line_no: number
  product_id: string | null
  vehicle_id: string | null
  description: string | null
  quantity: number
  unit_price: number
  discount: number
  line_total: number
  allocated_transport: number
  allocated_prep: number
  landed_unit_cost: number
  product_code: string | null
  product_name: string | null
  vehicle_code: string | null
}

export interface PurchaseInvoiceDetail {
  invoice: {
    id: string
    number: string
    supplier_id: string
    invoice_date: string
    supplier_reference: string | null
    subtotal: number
    discount: number
    transport_cost: number
    prep_cost: number
    total: number
    paid_amount: number
    payment_method: PurchasePaymentMethod
    status: PurchaseStatus
    document_id: string | null
    notes: string | null
  }
  items: PurchaseInvoiceItemRecord[]
}

export interface PurchaseLineInput {
  product_id?: string | null
  vehicle_id?: string | null
  description?: string | null
  quantity: number
  unit_price: number
  discount?: number
}

export interface PurchaseInvoiceInput {
  supplier_id: string
  invoice_date: string
  items: PurchaseLineInput[]
  discount: number
  transport_cost: number
  prep_cost: number
  payment_method: PurchasePaymentMethod
  paid_amount: number
  notes?: string | null
  supplier_reference?: string | null
}

export const purchaseStatusLabels: Record<PurchaseStatus, string> = {
  draft: 'مسودة',
  approved: 'معتمدة',
  cancelled: 'ملغاة',
}

export const purchasePaymentLabels: Record<PurchasePaymentMethod, string> = {
  cash: 'نقدي',
  bank: 'بنكي',
  credit: 'آجل',
}
