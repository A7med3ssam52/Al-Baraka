import { supabase } from '@/lib/supabase'
import { isFriendlyArabicMessage } from '@/lib/friendly-error'

import type { AuditFilterOptions, AuditFilters, AuditLogEntry } from './types'

const errorMessages: Record<string, string> = {
  forbidden: 'لا تملك صلاحية عرض سجل المراجعة.',
  not_authenticated: 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.',
}

export function translateAuditError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const key = message.trim()

  if (isFriendlyArabicMessage(key)) return key

  if (errorMessages[key]) return errorMessages[key]

  if (key.toLowerCase().includes('permission denied')) {
    return 'لا تملك صلاحية عرض سجل المراجعة.'
  }

  return 'تعذر تحميل سجل المراجعة. تحقق من الاتصال وحاول مرة أخرى.'
}

function toIsoStart(value: string) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function toIsoEnd(value: string) {
  if (!value) return null
  const date = new Date(`${value}T23:59:59.999`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function fetchAuditLogs(
  filters: AuditFilters,
  page: number,
  pageSize: number,
): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase.rpc('list_audit_logs', {
    p_search: filters.search.trim() || null,
    p_action: filters.action || null,
    p_table: filters.table || null,
    p_user_id: filters.userId || null,
    p_branch_id: filters.branchId || null,
    p_from: toIsoStart(filters.from),
    p_to: toIsoEnd(filters.to),
    p_limit: pageSize,
    p_offset: page * pageSize,
  })

  if (error) throw new Error(translateAuditError(error.message))

  return (data ?? []) as AuditLogEntry[]
}

export async function fetchAuditFilterOptions(): Promise<AuditFilterOptions> {
  const { data, error } = await supabase.rpc('audit_log_filter_options')

  if (error) throw new Error(translateAuditError(error.message))

  const options = (data ?? {}) as Partial<AuditFilterOptions>

  return {
    users: options.users ?? [],
    actions: options.actions ?? [],
    tables: options.tables ?? [],
    branches: options.branches ?? [],
  }
}

export async function fetchAuditLogsForExport(
  filters: AuditFilters,
  maxRows = 5000,
): Promise<AuditLogEntry[]> {
  const pageSize = 100
  const rows: AuditLogEntry[] = []
  let page = 0
  let total = Number.POSITIVE_INFINITY

  while (rows.length < Math.min(total, maxRows)) {
    const pageRows = await fetchAuditLogs(filters, page, pageSize)

    if (pageRows.length === 0) break

    rows.push(...pageRows)
    total = pageRows[0]?.total_count ?? rows.length

    if (pageRows.length < pageSize) break
    page += 1
  }

  return rows.slice(0, maxRows)
}
