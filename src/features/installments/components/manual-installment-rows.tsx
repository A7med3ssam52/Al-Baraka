import { Plus, Scale, Trash2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn, formatCurrency } from '@/lib/utils'

import { newManualRow, sumManualRows, type ManualInstallmentRow } from '../manual-installment-shared'

const round2 = (n: number) => Math.round(n * 100) / 100

interface Props {
  rows: ManualInstallmentRow[]
  financed: number
  onChange: (rows: ManualInstallmentRow[]) => void
  disabled?: boolean
  /** Show the «دفتر قديم» checkbox per row (used only before any collection). */
  showLegacy?: boolean
}

export function ManualInstallmentRows({ rows, financed, onChange, disabled, showLegacy }: Props) {
  const sum = sumManualRows(rows)
  const diff = round2(financed - sum)
  const balanced = Math.abs(diff) < 0.005 && financed > 0

  const patchRow = (key: string, patch: Partial<ManualInstallmentRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const removeRow = (key: string) =>
    onChange(rows.length <= 1 ? rows : rows.filter((row) => row.key !== key))

  const addRow = () => onChange([...rows, newManualRow()])

  const distributeEvenly = () => {
    if (rows.length === 0 || financed <= 0) return
    const base = Math.trunc((financed / rows.length) * 100) / 100
    const remainder = round2(financed - base * rows.length)
    onChange(
      rows.map((row, index) => ({
        ...row,
        amount: String(index === rows.length - 1 ? round2(base + remainder) : base),
      })),
    )
  }

  const balanceOnLast = () => {
    if (rows.length === 0) return
    const others = sumManualRows(rows.slice(0, -1))
    const last = round2(financed - others)
    onChange(
      rows.map((row, index) => (index === rows.length - 1 ? { ...row, amount: String(last) } : row)),
    )
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">الأقساط (مواعيد مخصصة)</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={distributeEvenly}
            disabled={disabled || rows.length === 0 || financed <= 0}
          >
            <Wand2 className="size-4" />
            توزيع بالتساوي
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={balanceOnLast}
            disabled={disabled || rows.length === 0}
          >
            <Scale className="size-4" />
            موازنة على آخر قسط
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={disabled}>
            <Plus className="size-4" />
            إضافة قسط
          </Button>
        </div>
      </div>

      {rows.map((row, index) => (
        <div
          key={row.key}
          className={cn(
            'grid gap-2',
            showLegacy
              ? 'grid-cols-[auto_1fr_1fr_auto_auto] sm:grid-cols-[2rem_9.5rem_1fr_auto_auto] sm:items-end'
              : 'grid-cols-[auto_1fr_1fr_auto] sm:grid-cols-[2rem_9.5rem_1fr_auto] sm:items-end',
          )}
        >
          <span className="pb-2 text-center text-xs font-bold text-muted-foreground">
            #{index + 1}
          </span>
          <Input
            type="date"
            aria-label={`تاريخ القسط ${index + 1}`}
            value={row.due_date}
            onChange={(event) => patchRow(row.key, { due_date: event.target.value })}
            disabled={disabled}
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="المبلغ"
            aria-label={`مبلغ القسط ${index + 1}`}
            value={row.amount}
            onChange={(event) => patchRow(row.key, { amount: event.target.value })}
            disabled={disabled}
          />
          {showLegacy ? (
            <label
              className="flex items-center gap-1.5 whitespace-nowrap pb-2 text-xs text-muted-foreground"
              title="مدفوع من قبل في الدفتر القديم — بيتسجل «مدفوع» بدون أي حركة خزنة أو قيد"
            >
              <Checkbox
                checked={row.legacy}
                onChange={() => patchRow(row.key, { legacy: !row.legacy })}
                disabled={disabled}
                aria-label={`القسط ${index + 1} مدفوع في الدفتر القديم`}
              />
              دفتر قديم
            </label>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeRow(row.key)}
            disabled={disabled || rows.length <= 1}
            aria-label="حذف القسط"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      <div
        className={cn(
          'rounded-md border px-3 py-2 text-xs',
          balanced
            ? 'border-success/40 bg-success/5 text-success'
            : 'border-destructive/40 bg-destructive/5 text-destructive',
        )}
      >
        الممول: <strong>{formatCurrency(financed)}</strong> — مجموع الأقساط:{' '}
        <strong>{formatCurrency(sum)}</strong> — الفرق: <strong>{formatCurrency(Math.abs(diff))}</strong>{' '}
        {balanced ? '✓ مطابق' : diff > 0 ? '(الأقساط أقل من الممول)' : '(الأقساط أكبر من الممول)'}
      </div>
    </div>
  )
}
