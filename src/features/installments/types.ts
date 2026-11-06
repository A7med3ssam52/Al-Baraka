export type InstallmentStoredStatus = 'pending' | 'partial' | 'paid' | 'overdue' | 'waived'

export type InstallmentComputedStatus = 'pending' | 'due' | 'overdue' | 'partial' | 'paid'

export type InstallmentDisplayStatus = InstallmentComputedStatus | 'waived'

export type InstallmentStatusFilter = InstallmentDisplayStatus | 'all'

export type PaymentMethod = 'cash' | 'bank'

export interface InstallmentRow {
  id: string
  schedule_id: string
  installment_no: number
  due_date: string
  amount: number
  paid_amount: number
  stored_status: InstallmentStoredStatus
  computed_status: InstallmentComputedStatus
  remaining_amount: number
  contract_id: string
  customer_id: string
  branch_id: string
  contract_number: string
  contract_status: string
  frequency: string
  customer_name: string
  customer_code: string
  customer_mobile: string | null
  branch_name: string
}

export interface InstallmentFilters {
  branchId?: string | null
  customerId?: string | null
  status?: InstallmentStatusFilter
  search?: string
  dueFrom?: string | null
  dueTo?: string | null
}

export interface InstallmentSummary {
  total_amount: number
  total_paid: number
  total_remaining: number
  waived_amount: number
  overdue_count: number
  overdue_amount: number
  due_count: number
  due_amount: number
  pending_count: number
  paid_count: number
  waived_count: number
}

export interface CollectInstallmentInput {
  installment_id: string
  amount: number
  payment_method: PaymentMethod
  payment_date: string
  notes?: string | null
}

export interface WaiveInstallmentInput {
  installment_id: string
  reason?: string | null
}

export interface RescheduleInstallmentInput {
  installment_id: string
  new_due_date: string
  reason?: string | null
}

export const installmentStatusLabels: Record<InstallmentDisplayStatus, string> = {
  pending: 'لم يحن',
  due: 'مستحق اليوم',
  overdue: 'متأخر',
  partial: 'مدفوع جزئيًا',
  paid: 'مدفوع',
  waived: 'مسوى (إعفاء)',
}

export const installmentStatusBadge: Record<
  InstallmentDisplayStatus,
  'secondary' | 'warning' | 'destructive' | 'success' | 'accent'
> = {
  pending: 'secondary',
  due: 'warning',
  overdue: 'destructive',
  partial: 'warning',
  paid: 'success',
  waived: 'accent',
}

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'نقدًا',
  bank: 'تحويل بنكي',
}

export const frequencyLabels: Record<string, string> = {
  weekly: 'أسبوعي',
  biweekly: 'كل أسبوعين',
  monthly: 'شهري',
  custom: 'مخصص',
}

/**
 * `computed_status` ignores the waived flag, so a waived installment would show
 * as paid. The stored status is the source of truth for waiving.
 */
export function resolveInstallmentStatus(row: {
  stored_status: InstallmentStoredStatus
  computed_status: InstallmentComputedStatus
}): InstallmentDisplayStatus {
  if (row.stored_status === 'waived') return 'waived'
  return row.computed_status
}

export function summarizeInstallments(rows: InstallmentRow[]): InstallmentSummary {
  return rows.reduce<InstallmentSummary>(
    (summary, row) => {
      const status = resolveInstallmentStatus(row)
      summary.total_amount += row.amount

      if (status !== 'waived') {
        // Waived installments set paid_amount = amount without any cash movement,
        // so they must not be reported as collected money.
        summary.total_paid += row.paid_amount
        summary.total_remaining += Math.max(row.remaining_amount, 0)
      }

      if (status === 'overdue') {
        summary.overdue_count += 1
        summary.overdue_amount += Math.max(row.remaining_amount, 0)
      } else if (status === 'due') {
        summary.due_count += 1
        summary.due_amount += Math.max(row.remaining_amount, 0)
      } else if (status === 'paid') {
        summary.paid_count += 1
      } else if (status === 'waived') {
        summary.waived_count += 1
        summary.waived_amount += row.amount
      } else if (status === 'pending') {
        summary.pending_count += 1
      }

      return summary
    },
    {
      total_amount: 0,
      total_paid: 0,
      total_remaining: 0,
      waived_amount: 0,
      overdue_count: 0,
      overdue_amount: 0,
      due_count: 0,
      due_amount: 0,
      pending_count: 0,
      paid_count: 0,
      waived_count: 0,
    },
  )
}
