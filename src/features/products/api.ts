import { supabase } from '@/lib/supabase'

import type {
  ProductBrandRecord,
  ProductCategoryRecord,
  ProductInput,
  ProductModelRecord,
  ProductRecord,
  ProductStatus,
  ProductUnitRecord,
} from './types'

const errorMessages: Record<string, string> = {
  forbidden: 'لا تملك الصلاحية لتنفيذ هذه العملية.',
  not_authenticated: 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.',
  invalid_reference_name: 'اختر اسمًا صحيحًا (من حرفين إلى 80).',
  cyclic_reference: 'لا يمكن أن يكون التصنيف رئيسًا لنفسه.',
  product_brand_missing: 'الماركة غير موجودة أو غير نشطة.',
  invalid_product_name: 'اسم المنتج مطلوب (حرفان على الأقل).',
  invalid_valuation_method: 'طريقة التقييم غير معروفة.',
  invalid_product_numbers: 'التكلفة وحد إعادة الطلب يجب أن يكونا رقمًا موجبًا منطقيًا.',
  duplicate_barcode: 'الباركود مستخدم في منتج آخر.',
  product_missing: 'المنتج غير موجود.',
  invalid_status: 'حالة المنتج غير معروفة.',
  unknown_code_entity: 'وحدة ترميز غير معروفة.',
}

export function translateProductError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()

  if (errorMessages[key]) return errorMessages[key]

  if (key.toLowerCase().includes('duplicate key') && key.includes('product_brands_name')) {
    return 'يوجد ماركة أخرى بنفس الاسم.'
  }
  if (key.toLowerCase().includes('duplicate key') && key.includes('product_categories_name')) {
    return 'يوجد تصنيف آخر بنفس الاسم.'
  }

  return 'تعذر إكمال العملية. تحقق من الاتصال وحاول مرة أخرى.'
}

export async function fetchProductCategories(): Promise<ProductCategoryRecord[]> {
  const { data, error } = await supabase
    .from('product_categories')
    .select('id, name, is_active')
    .order('name')

  if (error) throw new Error(translateProductError(error.message))

  return (data ?? []) as unknown as ProductCategoryRecord[]
}

export async function fetchProductBrands(): Promise<ProductBrandRecord[]> {
  const { data, error } = await supabase
    .from('product_brands')
    .select('id, name, is_active')
    .order('name')

  if (error) throw new Error(translateProductError(error.message))

  return (data ?? []) as unknown as ProductBrandRecord[]
}

export async function fetchProductModels(brandId?: string): Promise<ProductModelRecord[]> {
  let query = supabase.from('product_models').select('id, brand_id, name, is_active')

  if (brandId) query = query.eq('brand_id', brandId)

  const { data, error } = await query.order('name')

  if (error) throw new Error(translateProductError(error.message))

  return (data ?? []) as unknown as ProductModelRecord[]
}

export async function fetchProductUnits(): Promise<ProductUnitRecord[]> {
  const { data, error } = await supabase
    .from('product_units')
    .select('id, name, is_active')
    .eq('is_active', true)
    .order('name')

  if (error) throw new Error(translateProductError(error.message))

  return (data ?? []) as unknown as ProductUnitRecord[]
}

export async function saveProductCategory(name: string, parentId?: string) {
  const { error } = await supabase.rpc('save_product_category', {
    p_name: name,
    p_parent_id: parentId ?? null,
  })

  if (error) throw new Error(translateProductError(error.message))
}

export async function saveProductBrand(name: string) {
  const { data, error } = await supabase.rpc('save_product_brand', { p_name: name })
  if (error) throw new Error(translateProductError(error.message))
  return Array.isArray(data) ? data[0] : data
}

export async function saveProductModel(brandId: string, name: string) {
  const { data, error } = await supabase.rpc('save_product_model', {
    p_brand_id: brandId,
    p_name: name,
  })
  if (error) throw new Error(translateProductError(error.message))
  return Array.isArray(data) ? data[0] : data
}

export async function fetchProducts(options?: {
  status?: ProductStatus | 'all'
  search?: string
  categoryId?: string
}): Promise<ProductRecord[]> {
  const { data, error } = await supabase.rpc('list_products', {
    p_status: options?.status ?? 'active',
    p_search: options?.search?.trim() || null,
    p_category_id: options?.categoryId ?? null,
  })

  if (error) throw new Error(translateProductError(error.message))

  return (data ?? []) as unknown as ProductRecord[]
}

export async function createProduct(input: ProductInput): Promise<ProductRecord> {
  const { data, error } = await supabase.rpc('create_product', {
    p_name: input.name,
    p_category_id: input.category_id ?? null,
    p_brand_id: input.brand_id ?? null,
    p_model_id: input.model_id ?? null,
    p_unit_name: input.unit_name ?? null,
    p_barcode: input.barcode ?? null,
    p_description: input.description ?? null,
    p_unit_cost: input.unit_cost ?? null,
    p_valuation_method: input.valuation_method ?? null,
    p_reorder_level: input.reorder_level ?? null,
  })

  if (error) throw new Error(translateProductError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as ProductRecord
}

export async function updateProduct(
  productId: string,
  input: ProductInput,
): Promise<ProductRecord> {
  const { data, error } = await supabase.rpc('update_product', {
    p_product_id: productId,
    p_name: input.name,
    p_category_id: input.category_id ?? null,
    p_brand_id: input.brand_id ?? null,
    p_model_id: input.model_id ?? null,
    p_unit_name: input.unit_name ?? null,
    p_barcode: input.barcode ?? null,
    p_description: input.description ?? null,
    p_unit_cost: input.unit_cost ?? null,
    p_valuation_method: input.valuation_method ?? null,
    p_reorder_level: input.reorder_level ?? null,
  })

  if (error) throw new Error(translateProductError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as ProductRecord
}

export async function setProductStatus(
  productId: string,
  status: ProductStatus,
): Promise<ProductRecord> {
  const { data, error } = await supabase.rpc('set_product_status', {
    p_product_id: productId,
    p_status: status,
  })

  if (error) throw new Error(translateProductError(error.message))

  return (Array.isArray(data) ? data[0] : data) as unknown as ProductRecord
}
