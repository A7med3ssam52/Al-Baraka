import { Building2, LoaderCircle, Save, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

import { createBranch, updateBranch } from '../api'
import type { BranchRecord } from '../types'

interface BranchDialogProps {
  branch: BranchRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

const codePattern = /^[A-Z][A-Z0-9-]{1,11}$/

export function BranchDialog({ branch, open, onOpenChange, onSaved }: BranchDialogProps) {
  const isEditing = Boolean(branch)
  const isLaunchBranch = branch?.code === 'SNH-01'
  const [code, setCode] = useState(branch?.code ?? '')
  const [name, setName] = useState(branch?.name ?? '')
  const [address, setAddress] = useState(branch?.address ?? '')
  const [isActive, setIsActive] = useState(branch?.is_active ?? true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCode(branch?.code ?? '')
    setName(branch?.name ?? '')
    setAddress(branch?.address ?? '')
    setIsActive(branch?.is_active ?? true)
    setError(null)
  }, [open, branch])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const normalizedCode = code.trim().toUpperCase()
    const normalizedName = name.trim()
    const normalizedAddress = address.trim()

    if (!isEditing && !codePattern.test(normalizedCode)) {
      setError('كود الفرع يجب أن يبدأ بحرف إنجليزي ثم حروف أو أرقام أو شرطات، من 2 إلى 12 خانة.')
      return
    }

    if (normalizedName.length < 2 || normalizedName.length > 120) {
      setError('اسم الفرع يجب أن يكون بين حرفين و120 حرفًا.')
      return
    }

    if (normalizedAddress.length > 300) {
      setError('عنوان الفرع أطول من الحد المسموح.')
      return
    }

    setSubmitting(true)

    try {
      if (branch) {
        await updateBranch(branch.id, {
          name: normalizedName,
          address: normalizedAddress || null,
          is_active: isActive,
        })
        toast.success('تم تحديث بيانات الفرع.')
      } else {
        await createBranch({
          code: normalizedCode,
          name: normalizedName,
          address: normalizedAddress || null,
          is_active: isActive,
        })
        toast.success('تمت إضافة الفرع وتهيئة الخزنة والترقيم تلقائيًا.')
      }

      onSaved()
      onOpenChange(false)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'تعذر حفظ بيانات الفرع. تحقق من الاتصال وحاول مرة أخرى.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!submitting) onOpenChange(nextOpen)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-5 text-accent-foreground" />
            {isEditing ? 'تعديل بيانات الفرع' : 'إضافة فرع جديد'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'يمكن تعديل الاسم والعنوان وحالة التفعيل. كود الفرع ثابت بعد الإنشاء.'
              : 'سيحصل الفرع الجديد تلقائيًا على خزنة رئيسية وحساب بنكي مؤقت وستة مسلسلات ترقيم.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="branch-code" className="text-xs font-bold">
                كود الفرع
              </label>
              <Input
                id="branch-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="SNH-02"
                dir="ltr"
                maxLength={12}
                required
                disabled={isEditing || submitting}
                className="font-mono"
              />
              <p className="text-[11px] leading-5 text-muted-foreground">
                {isEditing
                  ? 'الكود ثابت لحماية المستندات المرتبطة بالفرع.'
                  : 'مثال: SNH-02 أو ZAG-01. يبدأ بحرف إنجليزي.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="branch-name" className="text-xs font-bold">
                اسم الفرع
              </label>
              <Input
                id="branch-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="فرع الزقازيق"
                maxLength={120}
                required
                disabled={submitting}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="branch-address" className="text-xs font-bold">
                العنوان
              </label>
              <Input
                id="branch-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="المحافظة — المركز — الشارع"
                maxLength={300}
                disabled={submitting}
              />
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/35 p-3">
            <Checkbox
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              disabled={submitting || isLaunchBranch}
              className="mt-0.5"
            />
            <span>
              <span className="block text-xs font-bold">الفرع نشط</span>
              <span className="mt-0.5 block text-[11px] leading-5 text-muted-foreground">
                {isLaunchBranch
                  ? 'فرع صان الحجر الرئيسي لا يمكن تعطيله.'
                  : 'عند التعطيل يظل تاريخ الفرع ومستنداته محفوظًا، لكن يتوقف ظهوره للعمليات الجديدة.'}
              </span>
            </span>
          </label>

          {!isEditing ? (
            <p className="flex items-start gap-2 rounded-lg border border-accent/25 bg-accent/10 p-3 text-[11px] leading-6 text-[#7a5a13]">
              <Sparkles className="mt-0.5 size-3.5 shrink-0" />
              سيتم إنشاء الخزنة الرئيسية «CASH-01» وحساب بنكي «BANK-01» غير نشط، مع مسلسلات الفواتير
              والعقود والإيصالات للسنة الحالية.
            </p>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-semibold leading-6 text-destructive"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <LoaderCircle className="animate-spin" /> : <Save />}
              {submitting ? 'جارٍ الحفظ...' : isEditing ? 'حفظ التعديلات' : 'إضافة الفرع'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
