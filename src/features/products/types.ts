export type ProductStatus = 'active' | 'inactive' | 'archived'

export type ValuationMethod = 'fifo' | 'avco' | 'weighted'

export interface ProductCategoryRecord {
  id: string
  name: string
  is_active: boolean
}

export interface ProductBrandRecord {
  id: string
  name: string
  is_active: boolean
}

export interface ProductModelRecord {
  id: string
  brand_id: string
  name: string
  is_active: boolean
}

export interface ProductUnitRecord {
  id: string
  name: string
  is_active: boolean
}

export interface ProductRecord {
  id: string
  code: string
  name: string
  category_id: string | null
  category_name: string | null
  brand_id: string | null
  brand_name: string | null
  model_id: string | null
  model_name: string | null
  unit_name: string | null
  barcode: string | null
  description: string | null
  unit_cost: number
  valuation_method: ValuationMethod
  reorder_level: number
  stock_qty: number
  status: ProductStatus
  created_at: string
}

export interface ProductInput {
  name: string
  category_id?: string | null
  brand_id?: string | null
  model_id?: string | null
  unit_name?: string | null
  barcode?: string | null
  description?: string | null
  unit_cost?: number
  valuation_method?: ValuationMethod
  reorder_level?: number
}

export const productStatusLabels: Record<ProductStatus, string> = {
  active: 'نشط',
  inactive: 'متوقف',
  archived: 'مؤرشف',
}

export const valuationMethodLabels: Record<ValuationMethod, string> = {
  fifo: 'FIFO (الأول يخرج أولًا)',
  avco: 'متوسط موزون متحرك',
  weighted: 'متوسط موزون',
}
