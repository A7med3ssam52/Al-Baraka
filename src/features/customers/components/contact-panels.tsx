import { Loader2, PhoneCall, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/use-auth'
import { formatDateTime } from '@/lib/utils'

import {
  addCustomerContact,
  addGuarantor,
  deleteCustomerContact,
  listCustomerContacts,
  listGuarantors,
  translateCustomerError,
} from '../api'
import { formatMobileDisplay, type CustomerRecord } from '../types'

interface ContactRecord {
  id: string
  customer_id: string
  label: string
  mobile: string
  note: string | null
  created_at: string
}

export function ContactsPanel({ customer }: { customer: CustomerRecord }) {
  const [contacts, setContacts] = useState<ContactRecord[] | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ label: '', mobile: '', note: '' })
  const [submitting, setSubmitting] = useState(false)
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('customers.update')

  useEffect(() => {
    let mounted = true
    listCustomerContacts(customer.id)
      .then((rows) => {
        if (mounted) setContacts(rows as unknown as ContactRecord[])
      })
      .catch((loadError) => {
        if (mounted) setError(translateCustomerError(loadError))
      })
    return () => {
      mounted = false
    }
  }, [customer.id])

  async function handleAdd() {
    if (!form.label.trim()) {
      toast.error('اسم جهة الاتصال مطلوب.')
      return
    }
    setSubmitting(true)
    try {
      await addCustomerContact({
        customerId: customer.id,
        label: form.label,
        mobile: form.mobile,
        note: form.note,
      })
      setContacts((await listCustomerContacts(customer.id)) as unknown as ContactRecord[])
      setDialogOpen(false)
      setForm({ label: '', mobile: '', note: '' })
      toast.success('تمت إضافة جهة الاتصال.')
    } catch (addError) {
      toast.error(translateCustomerError(addError))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(contact: ContactRecord) {
    try {
      await deleteCustomerContact(contact.id)
      setContacts((await listCustomerContacts(customer.id)) as unknown as ContactRecord[])
      toast.success('تم حذف جهة الاتصال.')
    } catch (deleteError) {
      toast.error(translateCustomerError(deleteError))
    }
  }

  const loading = contacts === undefined

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="font-bold">جهات التواصل الإضافية</h2>
          <p className="text-xs text-muted-foreground">
            أرقام بديلة للعميل: عمل، أسرة، أو مصدر إحالة.
          </p>
        </div>
        {canWrite ? (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> إضافة جهة
          </Button>
        ) : null}
      </Card>

      {error ? (
        <Card className="p-4 text-sm text-destructive">{error}</Card>
      ) : loading ? (
        <Card className="p-4">
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        </Card>
      ) : contacts.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={PhoneCall}
            title="لا جهات اتصال إضافية"
            description="أضف رقمًا بديلًا للعميل عند توفره."
          />
        </Card>
      ) : (
        <ol className="grid gap-2">
          {contacts.map((contact) => (
            <li key={contact.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Badge variant="outline">{contact.label}</Badge>
                  <p className="dir-ltr mt-1 font-mono text-sm">
                    {formatMobileDisplay(contact.mobile)}
                  </p>
                  {contact.note ? (
                    <p className="text-xs text-muted-foreground">{contact.note}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(contact.created_at)}
                  </p>
                </div>
                {canWrite ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`حذف ${contact.label}`}
                    onClick={() => handleDelete(contact)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                ) : null}
              </Card>
            </li>
          ))}
        </ol>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>جهة اتصال جديدة</DialogTitle>
            <DialogDescription>الاسم والموبايل مطلوبة.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              void handleAdd()
            }}
          >
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">العنوان *</span>
              <Input
                value={form.label}
                onChange={(event) => setForm((c) => ({ ...c, label: event.target.value }))}
                placeholder="مثال: زميل عمل"
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الموبايل *</span>
              <Input
                dir="ltr"
                className="text-left"
                value={form.mobile}
                onChange={(event) => setForm((c) => ({ ...c, mobile: event.target.value }))}
                placeholder="01012345678"
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">ملاحظة</span>
              <Input
                value={form.note}
                onChange={(event) => setForm((c) => ({ ...c, note: event.target.value }))}
                placeholder="اختياري"
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null} إضافة
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface GuarantorRecord {
  id: string
  full_name: string
  national_id: string
  mobile: string
  job: string | null
  address: string | null
  is_active: boolean
  created_at: string
}

export function GuarantorsPanel({ customer }: { customer: CustomerRecord }) {
  const [guarantors, setGuarantors] = useState<GuarantorRecord[] | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ full_name: '', national_id: '', mobile: '', job: '' })
  const [submitting, setSubmitting] = useState(false)
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('customers.update')

  useEffect(() => {
    let mounted = true
    listGuarantors()
      .then((rows) => {
        if (mounted) setGuarantors(rows as unknown as GuarantorRecord[])
      })
      .catch((loadError) => {
        if (mounted) setError(translateCustomerError(loadError))
      })
    return () => {
      mounted = false
    }
  }, [customer.id])

  async function handleAdd() {
    setSubmitting(true)
    try {
      await addGuarantor({
        full_name: form.full_name,
        national_id: form.national_id,
        mobile: form.mobile,
        job: form.job,
      })
      setGuarantors((await listGuarantors()) as unknown as GuarantorRecord[])
      setDialogOpen(false)
      setForm({ full_name: '', national_id: '', mobile: '', job: '' })
      toast.success('تمت إضافة الضامن إلى السجل.')
    } catch (addError) {
      toast.error(translateCustomerError(addError))
    } finally {
      setSubmitting(false)
    }
  }

  const loading = guarantors === undefined

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="font-bold">سجل الضامنين</h2>
          <p className="text-xs text-muted-foreground">
            الضامنون المتاحون؛ يُربط كل ضامن بالعقود لاحقًا.
          </p>
        </div>
        {canWrite ? (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> إضافة ضامن
          </Button>
        ) : null}
      </Card>

      {error ? (
        <Card className="p-4 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-4" />
            {error}
          </div>
        </Card>
      ) : loading ? (
        <Card className="p-4">
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        </Card>
      ) : guarantors.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={PhoneCall}
            title="لا ضامنين بعد"
            description="أضف أول ضامن ليكون متاحًا عند إنشاء العقود."
          />
        </Card>
      ) : (
        <ol className="grid gap-2">
          {guarantors.map((guarantor) => (
            <li key={guarantor.id}>
              <Card className="gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{guarantor.full_name}</span>
                  {guarantor.job ? <Badge variant="outline">{guarantor.job}</Badge> : null}
                </div>
                <p className="dir-ltr font-mono text-xs text-muted-foreground">
                  {guarantor.national_id} • {formatMobileDisplay(guarantor.mobile)}
                </p>
                {guarantor.address ? (
                  <p className="text-xs text-muted-foreground">{guarantor.address}</p>
                ) : null}
              </Card>
            </li>
          ))}
        </ol>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ضامن جديد</DialogTitle>
            <DialogDescription>الاسم والرقم القومي والموبايل مطلوبة.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              void handleAdd()
            }}
          >
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الاسم *</span>
              <Input
                value={form.full_name}
                onChange={(event) => setForm((c) => ({ ...c, full_name: event.target.value }))}
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الرقم القومي *</span>
              <Input
                dir="ltr"
                className="text-left"
                value={form.national_id}
                onChange={(event) => setForm((c) => ({ ...c, national_id: event.target.value }))}
                placeholder="14 رقمًا"
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">الموبايل *</span>
              <Input
                dir="ltr"
                className="text-left"
                value={form.mobile}
                onChange={(event) => setForm((c) => ({ ...c, mobile: event.target.value }))}
                placeholder="01012345678"
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">المهنة</span>
              <Input
                value={form.job}
                onChange={(event) => setForm((c) => ({ ...c, job: event.target.value }))}
                placeholder="اختياري"
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null} إضافة
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
