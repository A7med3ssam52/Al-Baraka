import { Loader2, Pencil, PhoneCall, Plus, Trash2, TriangleAlert } from 'lucide-react'
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

import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import {
  addCustomerContact,
  addGuarantor,
  deleteCustomerContact,
  deleteGuarantor,
  listCustomerContacts,
  listCustomerGuarantors,
  translateCustomerError,
  updateCustomerContact,
  updateGuarantor,
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
  const [editing, setEditing] = useState<ContactRecord | null>(null)
  const [deleting, setDeleting] = useState<ContactRecord | null>(null)
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
      if (editing) {
        await updateCustomerContact({
          contactId: editing.id,
          label: form.label,
          mobile: form.mobile,
          note: form.note,
        })
        toast.success('تم حفظ تعديل جهة الاتصال.')
      } else {
        await addCustomerContact({
          customerId: customer.id,
          label: form.label,
          mobile: form.mobile,
          note: form.note,
        })
        toast.success('تمت إضافة جهة الاتصال.')
      }
      setContacts((await listCustomerContacts(customer.id)) as unknown as ContactRecord[])
      setDialogOpen(false)
      setEditing(null)
      setForm({ label: '', mobile: '', note: '' })
    } catch (addError) {
      toast.error(translateCustomerError(addError))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleting) return
    try {
      await deleteCustomerContact(deleting.id)
      setContacts((await listCustomerContacts(customer.id)) as unknown as ContactRecord[])
      toast.success('تم حذف جهة الاتصال.')
    } catch (deleteError) {
      throw new Error(translateCustomerError(deleteError), { cause: deleteError })
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
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`تعديل ${contact.label}`}
                      onClick={() => {
                        setEditing(contact)
                        setForm({ label: contact.label, mobile: contact.mobile, note: contact.note ?? '' })
                        setDialogOpen(true)
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`حذف ${contact.label}`}
                      onClick={() => setDeleting(contact)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ol>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'تعديل جهة اتصال' : 'جهة اتصال جديدة'}</DialogTitle>
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
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null} {editing ? 'حفظ التعديلات' : 'إضافة'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={deleting !== null}
        title="حذف جهة اتصال"
        description={`جهة «${deleting?.label ?? ''}» هتتمسح نهائي.`}
        confirmLabel="حذف"
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={handleDeleteConfirm}
      />
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
  const [editing, setEditing] = useState<GuarantorRecord | null>(null)
  const [deleting, setDeleting] = useState<GuarantorRecord | null>(null)
  const [form, setForm] = useState({ full_name: '', national_id: '', mobile: '', job: '', address: '' })
  const [submitting, setSubmitting] = useState(false)
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('customers.update')

  useEffect(() => {
    let mounted = true
    listCustomerGuarantors(customer.id)
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
      if (editing) {
        await updateGuarantor({
          guarantorId: editing.id,
          full_name: form.full_name,
          national_id: form.national_id,
          mobile: form.mobile,
          job: form.job,
          address: form.address,
        })
        toast.success('تم حفظ تعديل الضامن.')
      } else {
        await addGuarantor({
          full_name: form.full_name,
          national_id: form.national_id,
          mobile: form.mobile,
          job: form.job,
          address: form.address,
          customerId: customer.id,
        })
        toast.success('تمت إضافة الضامن لهذا العميل.')
      }
      setGuarantors(
        (await listCustomerGuarantors(customer.id)) as unknown as GuarantorRecord[],
      )
      setDialogOpen(false)
      setEditing(null)
      setForm({ full_name: '', national_id: '', mobile: '', job: '', address: '' })
    } catch (addError) {
      toast.error(translateCustomerError(addError))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleting) return
    try {
      await deleteGuarantor(deleting.id, customer.id)
      setGuarantors(
        (await listCustomerGuarantors(customer.id)) as unknown as GuarantorRecord[],
      )
      toast.success('تم حذف الضامن من هذا العميل.')
    } catch (deleteError) {
      throw new Error(translateCustomerError(deleteError), { cause: deleteError })
    }
  }

  const loading = guarantors === undefined

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="font-bold">ضامنو هذا العميل</h2>
          <p className="text-xs text-muted-foreground">
            هؤلاء الضامنون مرتبطون بهذا العميل فقط، ويُربطون بالعقود عند الحاجة.
          </p>
        </div>
        {canWrite ? (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> إضافة ضامن لهذا العميل
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
            title="لا ضامنين لهذا العميل"
            description="أضف ضامنًا خاصًا بهذا العميل فقط."
          />
        </Card>
      ) : (
        <ol className="grid gap-2">
          {guarantors.map((guarantor) => (
            <li key={guarantor.id}>
              <Card className="gap-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{guarantor.full_name}</span>
                    {guarantor.job ? <Badge variant="outline">{guarantor.job}</Badge> : null}
                  </div>
                  {canWrite ? (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`تعديل ${guarantor.full_name}`}
                        onClick={() => {
                          setEditing(guarantor)
                          setForm({
                            full_name: guarantor.full_name,
                            national_id: guarantor.national_id,
                            mobile: guarantor.mobile,
                            job: guarantor.job ?? '',
                            address: guarantor.address ?? '',
                          })
                          setDialogOpen(true)
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`حذف ${guarantor.full_name}`}
                        onClick={() => setDeleting(guarantor)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  ) : null}
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

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'تعديل الضامن' : 'إضافة ضامن لهذا العميل'}</DialogTitle>
            <DialogDescription>سيظهر الضامن في ملف هذا العميل فقط. الاسم والرقم القومي والموبايل مطلوبة.</DialogDescription>
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
              <span className="font-semibold">الصفة</span>
              <Input
                value={form.job}
                onChange={(event) => setForm((c) => ({ ...c, job: event.target.value }))}
                placeholder="مثال: زميل عمل"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">العنوان</span>
              <Input
                value={form.address}
                onChange={(event) => setForm((c) => ({ ...c, address: event.target.value }))}
                placeholder="العنوان"
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null} {editing ? 'حفظ التعديلات' : 'إضافة'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={deleting !== null}
        title="حذف الضامن"
        description={`الضامن «${deleting?.full_name ?? ''}» — لو مرتبط بعقد نشط هيتتعطل بدل الحذف النهائي.`}
        confirmLabel="حذف"
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}
