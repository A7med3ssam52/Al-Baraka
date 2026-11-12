import { formatCurrency } from '@/lib/utils'

export interface ManualInstallmentRow {
  key: string
  due_date: string
  amount: string
  legacy: boolean
}

let rowCounter = 0
export function newManualRow(dueDate = '', amount = ''): ManualInstallmentRow {
  rowCounter += 1
  return { key: `mrow-${rowCounter}`, due_date: dueDate, amount, legacy: false }
}

export function sumManualRows(rows: ManualInstallmentRow[]): number {
  return rows.reduce((sum, row) => {
    const value = Number(row.amount)
    return sum + (Number.isFinite(value) ? value : 0)
  }, 0)
}

/** Validates rows against the financed amount; returns an Arabic error or null. */
export function validateManualRows(rows: ManualInstallmentRow[], financed: number): string | null {
  if (rows.length === 0) return 'أضف قسطًا واحدًا على الأقل.'
  if (rows.length > 360) return 'الحد الأقصى 360 قسطًا.'

  for (const row of rows) {
    if (!row.due_date) return 'أدخل تاريخ كل قسط.'
    const amount = Number(row.amount)
    if (!Number.isFinite(amount) || amount <= 0) return 'أدخل مبلغًا صحيحًا أكبر من صفر لكل قسط.'
  }

  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].due_date <= rows[index - 1].due_date) {
      return 'تواريخ الأقساط لازم تكون تصاعدية بدون تواريخ متكررة.'
    }
  }

  const sum = Math.round(sumManualRows(rows) * 100) / 100
  const expected = Math.round(financed * 100) / 100
  if (sum !== expected) {
    const diff = expected - sum
    return `مجموع الأقساط لازم يساوي الممول — الفرق الحالي: ${formatCurrency(Math.abs(diff))} ${diff > 0 ? 'ناقص' : 'زيادة'}.`
  }

  return null
}
