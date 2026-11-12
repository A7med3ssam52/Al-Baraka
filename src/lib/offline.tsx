import { useEffect } from 'react'
import { toast } from 'sonner'

import { isFriendlyArabicMessage } from '@/lib/friendly-error'
import { supabase } from '@/lib/supabase'

const QUEUE_KEY = 'albaraka.syncQueue.v1'
const MAX_QUEUE = 100

export interface PendingCall {
  id: string
  createdAt: number
  attempts: number
  lastError: string | null
  label: string
  kind: 'rpc' | 'table'
  rpcName?: string
  rpcArgs?: Record<string, unknown>
  table?: string
  op?: 'insert' | 'update' | 'delete' | 'upsert'
  payload?: unknown
  /** equality filters replayed with .eq() on update/delete (e.g. { id }) */
  match?: Record<string, unknown>
}

const RPC_LABELS_AR: Record<string, string> = {
  create_customer: 'إضافة عميل',
  update_customer: 'تعديل بيانات العميل',
  set_customer_status: 'تغيير حالة العميل',
  force_delete_customer: 'حذف قسري للعميل',
  delete_customer: 'حذف العميل',
  add_customer_note: 'إضافة ملاحظة متابعة',
  update_customer_note: 'تعديل ملاحظة متابعة',
  delete_customer_note: 'حذف ملاحظة متابعة',
  add_customer_contact: 'إضافة جهة اتصال',
  update_customer_contact: 'تعديل جهة اتصال',
  delete_customer_contact: 'حذف جهة اتصال',
  add_guarantor: 'إضافة ضامن',
  update_guarantor: 'تعديل ضامن',
  delete_guarantor: 'حذف ضامن',
  create_supplier: 'إضافة مورد',
  update_supplier: 'تعديل بيانات المورد',
  set_supplier_status: 'تغيير حالة المورد',
  create_product: 'إضافة منتج',
  update_product: 'تعديل المنتج',
  set_product_status: 'تغيير حالة المنتج',
  save_product_category: 'حفظ فئة المنتج',
  save_product_brand: 'حفظ ماركة المنتج',
  save_product_model: 'حفظ موديل المنتج',
  create_vehicle: 'إضافة مركبة',
  update_vehicle: 'تعديل المركبة',
  set_vehicle_status: 'تغيير حالة المركبة',
  create_document: 'إنشاء مستند',
  update_document: 'تعديل بيانات المستند',
  delete_document: 'حذف مستند',
  delete_document_file: 'حذف ملف مستند',
  attach_document_file: 'ربط ملف بمستند',
  update_installment: 'تعديل القسط',
  reschedule_installment: 'إعادة جدولة القسط',
  delete_installments: 'حذف أقساط',
  generate_overdue_notifications: 'إنشاء تنبيهات المتأخرات',
  update_system_settings: 'حفظ إعدادات النظام',
  create_staff_invitation: 'دعوة موظف',
  regenerate_staff_invitation: 'إعادة إنشاء الدعوة',
  assign_user_access: 'تعديل صلاحيات المستخدم',
  set_user_active: 'تفعيل/تعطيل مستخدم',
  update_user_profile: 'تعديل بيانات المستخدم',
  cancel_staff_invitation: 'إلغاء الدعوة',
  verify_staff_invitation: 'تفعيل حساب موظف',
}

/** Financially-sensitive RPCs are NEVER stored locally — they need a live connection. */
const FINANCIAL_RPC_NAMES = new Set([
  'add_customer_balance',
  'apply_customer_balance',
  'collect_installment',
  'waive_installment',
  'approve_contract',
  'approve_purchase_invoice',
  'approve_stock_count',
  'save_sales_invoice',
  'save_contract',
  'save_purchase_invoice',
  'generate_installment_schedule',
  'update_contract_terms',
  'record_stock_movement',
  'create_stock_count',
  'update_stock_count',
  'cancel_stock_count',
  'approve_stock_count',
  'create_stock_transfer',
  'update_stock_transfer',
  'cancel_stock_transfer',
  'send_stock_transfer',
  'receive_stock_transfer',
  'cancel_active_contract',
  'cancel_approved_purchase_invoice',
  'cancel_purchase_invoice',
  'create_expense',
  'update_expense',
  'delete_expense',
])

const FINANCIAL_TABLES = new Set([
  'expenses',
  'cash_transactions',
  'journal_entries',
  'journal_entry_lines',
  'payments',
  'customer_transactions',
  'customer_balance_transactions',
  'cashboxes',
  'bank_accounts',
])

/** Read-only RPCs always execute online (they must not be cached). */
const READ_RPC_PREFIXES = [
  'list_',
  'get_',
  'search_',
  'check_',
  'audit_log_filter_options',
  'my_access',
  'public_portal_lookup',
]

function isReadOnlyRpc(name: string): boolean {
  return READ_RPC_PREFIXES.some((prefix) => name.startsWith(prefix))
}

export function isFinancialRpc(name: string): boolean {
  return FINANCIAL_RPC_NAMES.has(name.trim().toLowerCase())
}

export function isFinancialTable(table: string): boolean {
  return FINANCIAL_TABLES.has(table.trim().toLowerCase())
}

export const OFFLINE_SAVED_TOAST =
  'في مشكلة اتصال — التعديل اتحفظ على الجهاز وهيترفع للسيرفر بمجرد اتصالك بالإنترنت ودخولك السيستم مرة تانية.'
export const OFFLINE_FINANCIAL_REJECT_TOAST =
  'في مشكلة اتصال — العملية مالية ومش هتُنفذ أوفلاين. الرجاء المحاولة عند الاتصال.'

export function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true

  const message = String(
    (error as { message?: unknown; error_description?: unknown } | null)?.message ??
      (error as { error_description?: unknown } | null)?.error_description ??
      error ??
      '',
  ).toLowerCase()

  if (!message) return false

  return (
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('networkerror') ||
    message.includes('network error') ||
    message.includes('network request failed') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('aborted') ||
    message.includes('connection') ||
    message.includes('disconnected') ||
    message.includes('internet') ||
    message.includes('offline')
  )
}

function friendlyMessage(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return 'تعذر رفع التعديل.'
  return isFriendlyArabicMessage(trimmed) ? trimmed : trimmed
}

function rpcLabel(name: string): string {
  return RPC_LABELS_AR[name] ?? name
}

function tableLabel(table: string, op: PendingCall['op']): string {
  const ops: Record<NonNullable<PendingCall['op']>, string> = {
    insert: 'إضافة',
    update: 'تعديل',
    delete: 'حذف',
    upsert: 'حفظ',
  }
  return `${ops[op ?? 'update'] ?? ''} (${table})`.trim()
}

function safeLabel(label?: string, fallback = 'تعديل'): string {
  const trimmed = (label ?? '').trim()
  return trimmed || fallback
}

export function loadQueue(): PendingCall[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PendingCall[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveQueue(items: PendingCall[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items))
  } catch {
    // storage full or unavailable — nothing else we can do here
  }
}

export function queueLength(): number {
  return loadQueue().length
}

export function enqueue(item: Omit<PendingCall, 'id' | 'createdAt' | 'attempts' | 'lastError'>) {
  const current = loadQueue()
  const next: PendingCall = {
    ...item,
    id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
  }
  const merged = [...current, next]
  saveQueue(merged.length > MAX_QUEUE ? merged.slice(-MAX_QUEUE) : merged)
  return next
}

function removeFromQueue(id: string) {
  saveQueue(loadQueue().filter((item) => item.id !== id))
}

function updateInQueue(item: PendingCall) {
  saveQueue(loadQueue().map((current) => (current.id === item.id ? item : current)))
}

async function executeRpc(item: PendingCall): Promise<void> {
  const { error } = await supabase.rpc(item.rpcName!, item.rpcArgs ?? {})
  if (error) {
    throw new Error(friendlyMessage(String(error.message ?? '')))
  }
}

async function executeTableOp(item: PendingCall): Promise<void> {
  const table = item.table!
  const match = item.match ?? {}

  if (item.op === 'insert') {
    const { error } = await supabase.from(table).insert(item.payload as never)
    if (error) throw new Error(String(error.message ?? ''))
    return
  }

  if (item.op === 'upsert') {
    const { error } = await supabase.from(table).upsert(item.payload as never)
    if (error) throw new Error(String(error.message ?? ''))
    return
  }

  // update / delete — both need equality filters
  let query =
    item.op === 'update'
      ? supabase.from(table).update(item.payload as never)
      : supabase.from(table).delete()

  for (const [key, value] of Object.entries(match)) {
    query = query.eq(key, value as never)
  }

  const { error } = await query
  if (error) throw new Error(String(error.message ?? ''))
}

export async function executeCall(item: PendingCall): Promise<void> {
  if (item.kind === 'rpc') return executeRpc(item)
  return executeTableOp(item)
}

export async function flushQueue(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return

  const queue = loadQueue()
  if (queue.length === 0) return

  const synced: string[] = []
  const failed: { item: PendingCall; error: string }[] = []

  for (const item of queue) {
    try {
      await executeCall(item)
      removeFromQueue(item.id)
      synced.push(item.label)
    } catch (error) {
      if (isNetworkFailure(error)) {
        // still offline — stop; remaining items stay untouched for the next flush
        return
      }
      const message =
        error instanceof Error && error.message.trim() ? error.message.trim() : 'تعذر رفع التعديل.'
      updateInQueue({ ...item, attempts: item.attempts + 1, lastError: message })
      failed.push({ item, error: message })
    }
  }

  if (synced.length > 0) {
    toast.success(
      synced.length === 1
        ? `تم رفع تعديل محفوظ على جهازك: «${synced[0]}» — الآن على السيرفر.`
        : `تم رفع ${synced.length} تعديلات كانت محفوظة على جهازك — الآن على السيرفر.`,
    )
  }

  for (const failure of failed) {
    toast.error(`تعذر رفع «${failure.item.label}»: ${failure.error}`)
  }
}

export interface OfflineResult<T> {
  data: T | null
  error: { message: string } | null
}

export async function rpcOfflineAware<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<OfflineResult<T>> {
  // Read-only RPCs are never queued nor cached — execute them live.
  if (isReadOnlyRpc(name)) {
    const { data, error } = await supabase.rpc(name, args)
    if (error) return { data: null, error: { message: String(error.message ?? '') } }
    return { data: data as T, error: null }
  }

  // Definitely offline before we even hit the wire — enqueue right away.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (isFinancialRpc(name))
      return { data: null, error: { message: OFFLINE_FINANCIAL_REJECT_TOAST } }
    enqueue({ kind: 'rpc', label: rpcLabel(name), rpcName: name, rpcArgs: args })
    toast.warning(OFFLINE_SAVED_TOAST)
    return { data: null, error: null }
  }

  try {
    const { data, error } = await supabase.rpc(name, args)
    if (!error) return { data: data as T, error: null }

    if (isNetworkFailure(error)) {
      if (isFinancialRpc(name))
        return { data: null, error: { message: OFFLINE_FINANCIAL_REJECT_TOAST } }
      enqueue({ kind: 'rpc', label: rpcLabel(name), rpcName: name, rpcArgs: args })
      toast.warning(OFFLINE_SAVED_TOAST)
      return { data: null, error: null }
    }

    return { data: null, error: { message: String(error.message ?? '') } }
  } catch (error) {
    if (isNetworkFailure(error)) {
      if (isFinancialRpc(name))
        return { data: null, error: { message: OFFLINE_FINANCIAL_REJECT_TOAST } }
      enqueue({
        kind: 'rpc',
        label: rpcLabel(name),
        rpcName: name,
        rpcArgs: args,
      })
      toast.warning(OFFLINE_SAVED_TOAST)
      return { data: null, error: null }
    }

    return {
      data: null,
      error: { message: error instanceof Error ? error.message : String(error ?? '') },
    }
  }
}

export async function tableOfflineAware<T = unknown>(input: {
  table: string
  op: 'insert' | 'update' | 'delete' | 'upsert'
  payload?: unknown
  match?: Record<string, unknown>
  label: string
}): Promise<OfflineResult<T>> {
  const { table, op } = input

  // Definitely offline before we even hit the wire — enqueue right away.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (isFinancialTable(table))
      return { data: null, error: { message: OFFLINE_FINANCIAL_REJECT_TOAST } }
    enqueue({
      kind: 'table',
      label: safeLabel(input.label, tableLabel(table, op)),
      table,
      op,
      payload: input.payload,
      match: input.match,
    })
    toast.warning(OFFLINE_SAVED_TOAST)
    return { data: null, error: null }
  }

  const handle = async (payload: unknown, match?: Record<string, unknown>) => {
    if (op === 'insert') {
      return supabase.from(table).insert(payload as never)
    }
    if (op === 'upsert') {
      return supabase.from(table).upsert(payload as never)
    }
    let builder =
      op === 'update'
        ? supabase.from(table).update(payload as never)
        : supabase.from(table).delete()
    for (const [key, value] of Object.entries(match ?? {})) {
      builder = builder.eq(key, value as never)
    }
    return builder
  }

  try {
    const { data, error } = await handle(input.payload, input.match)
    if (!error) return { data: data as T, error: null }

    if (isNetworkFailure(error)) {
      if (isFinancialTable(table))
        return { data: null, error: { message: OFFLINE_FINANCIAL_REJECT_TOAST } }
      enqueue({
        kind: 'table',
        label: safeLabel(input.label, tableLabel(table, op)),
        table,
        op,
        payload: input.payload,
        match: input.match,
      })
      toast.warning(OFFLINE_SAVED_TOAST)
      return { data: null, error: null }
    }

    return { data: null, error: { message: String(error.message ?? '') } }
  } catch (error) {
    if (isNetworkFailure(error)) {
      if (isFinancialTable(table))
        return { data: null, error: { message: OFFLINE_FINANCIAL_REJECT_TOAST } }
      enqueue({
        kind: 'table',
        label: safeLabel(input.label, tableLabel(table, op)),
        table,
        op,
        payload: input.payload,
        match: input.match,
      })
      toast.warning(OFFLINE_SAVED_TOAST)
      return { data: null, error: null }
    }

    return {
      data: null,
      error: { message: error instanceof Error ? error.message : String(error ?? '') },
    }
  }
}

/** Auto-flush on app mount (once) and whenever the connection comes back. */
export function useOfflineSync(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Flush immediately on mount (also runs on login since AuthProvider mounts after login).
    void flushQueue().catch(() => undefined)

    const onOnline = () => {
      void flushQueue().catch(() => undefined)
    }

    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
    }
  }, [])
}
