import { ArrowRight, PhoneCall, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/use-auth'
import { cn, formatDateTime } from '@/lib/utils'

import { fetchCustomer, fetchCustomerNotes, translateCustomerError } from '../api'
import { customerStatusLabels, formatMobileDisplay } from '../types'
import type { CustomerRecord } from '../types'
import { AddCustomerNoteDialog } from '../components/add-customer-note-dialog'
import { ContactsPanel, GuarantorsPanel } from '../components/contact-panels'
import { DocumentsPanel } from '@/features/documents/components/documents-panel'
import type { CustomerNote } from '../types'
import {
  customerProfileTabs,
  type CustomerTabId,
  type TabAvailability,
} from './customer-profile-tabs'

function statusBadgeVariant(status: CustomerRecord['status']) {
  if (status === 'active') return 'success' as const
  if (status === 'inactive') return 'warning' as const
  return 'secondary' as const
}

interface CustomerProfileProps {
  customer: CustomerRecord
  activeTab: CustomerTabId
  onTabChange: (tab: CustomerTabId) => void
  /** التبويبات المفعّلة من وحدات لاحقة؛ الافتراضي: البيانات الشخصية والملاحظات */
  availability?: TabAvailability
  renderExtraTab?: (tabId: CustomerTabId, customer: CustomerRecord) => React.ReactNode
}

export function CustomerProfile({
  customer,
  activeTab,
  onTabChange,
  availability,
  renderExtraTab,
}: CustomerProfileProps) {
  const { hasPermission } = useAuth()

  function isAvailable(tabId: CustomerTabId) {
    if (tabId === 'personal' || tabId === 'notes') return true
    if (tabId === 'contacts' || tabId === 'guarantors') return true
    if (tabId === 'documents') return hasPermission('documents.view')
    return availability?.[tabId] === true
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/customers"
            className="grid size-8 place-items-center rounded-md hover:bg-muted"
            aria-label="رجوع إلى قائمة العملاء"
          >
            <ArrowRight className="size-4" />
          </a>
          <span className="font-mono text-sm text-muted-foreground">{customer.code}</span>
          <span className="text-xl font-extrabold">{customer.full_name}</span>
          <Badge variant={statusBadgeVariant(customer.status)}>
            {customerStatusLabels[customer.status]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {customer.address || 'الملف الموحد للتعاملات والمتابعة.'}
        </p>
      </div>

      <nav
        aria-label="تبويبات ملف العميل"
        className="-mx-1 flex gap-1 overflow-x-auto rounded-lg border bg-card px-1 py-1 text-sm"
      >
        {customerProfileTabs.map((tab) => {
          const available = isAvailable(tab.id)
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => available && onTabChange(tab.id)}
              disabled={!available}
              className={cn(
                'shrink-0 rounded-md px-3 py-2 font-semibold transition-colors',
                activeTab === tab.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
                available
                  ? 'hover:bg-muted hover:text-foreground'
                  : 'cursor-not-allowed opacity-60',
              )}
            >
              {tab.label}
              {!available ? <span className="ms-1 text-[10px]">({tab.availableAt})</span> : null}
            </button>
          )
        })}
      </nav>

      {activeTab === 'personal' ? <PersonalDataPanel customer={customer} /> : null}
      {activeTab === 'notes' ? <NotesPanel customer={customer} /> : null}
      {activeTab === 'contacts' ? <ContactsPanel customer={customer} /> : null}
      {activeTab === 'guarantors' ? <GuarantorsPanel customer={customer} /> : null}
      {activeTab === 'documents' ? (
        <DocumentsPanel ownerType="customer" ownerId={customer.id} ownerLabel={customer.code} />
      ) : null}
      {activeTab !== 'personal' &&
      activeTab !== 'notes' &&
      activeTab !== 'contacts' &&
      activeTab !== 'guarantors' &&
      activeTab !== 'documents' ? (
        renderExtraTab ? (
          renderExtraTab(activeTab, customer)
        ) : (
          <Card className="p-6">
            <EmptyState
              icon={ArrowRight}
              title="متاح في مرحلة تالية"
              description="هذا التبويب يُفعّل مع وحدات الخطة التنفيذية القادمة."
            />
          </Card>
        )
      ) : null}
    </div>
  )
}

function PersonalDataPanel({ customer }: { customer: CustomerRecord }) {
  const rows: { label: string; value: string | null }[] = [
    { label: 'الاسم بالكامل', value: customer.full_name },
    { label: 'الكود', value: customer.code },
    { label: 'الرقم القومي', value: customer.national_id },
    { label: 'الموبايل', value: formatMobileDisplay(customer.mobile) },
    { label: 'هاتف إضافي', value: formatMobileDisplay(customer.phone2) },
    { label: 'المهنة', value: customer.job },
    { label: 'العنوان', value: customer.address },
    { label: 'الحالة', value: customerStatusLabels[customer.status] },
    { label: 'ملاحظات مختصرة', value: customer.notes },
    { label: 'أُضيف في', value: formatDateTime(customer.created_at) },
  ]

  return (
    <Card className="p-4">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-xs font-bold text-muted-foreground">{row.label}</dt>
            <dd className="mt-1 truncate font-semibold">{row.value || '—'}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

const noteTypeLabels: Record<CustomerNote['note_type'], string> = {
  note: 'ملاحظة',
  call: 'اتصال',
  visit: 'زيارة',
  promise: 'وعد سداد',
}

export function NotesPanel({ customer }: { customer: CustomerRecord }) {
  // undefined = loading, [] = loaded with no notes found.
  const [notes, setNotes] = useState<CustomerNote[] | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const { hasPermission } = useAuth()

  async function load() {
    setError(null)
    try {
      setNotes(await fetchCustomerNotes(customer.id))
    } catch (loadError) {
      setError(translateCustomerError(loadError))
    }
  }

  useEffect(() => {
    let mounted = true
    fetchCustomerNotes(customer.id)
      .then((rows) => {
        if (mounted) setNotes(rows)
      })
      .catch((loadError) => {
        if (mounted) setError(translateCustomerError(loadError))
      })
    return () => {
      mounted = false
    }
  }, [customer.id])

  const loading = notes === undefined

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="font-bold">سجل المتابعة</h2>
          <p className="text-xs text-muted-foreground">
            ملاحظات متراكمة محفوظة دائمًا؛ لا تعديل ولا حذف.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> إضافة ملاحظة
        </Button>
      </Card>

      {error ? (
        <Card className="p-4 text-sm text-destructive">{error}</Card>
      ) : loading ? (
        <Card className="p-4">
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        </Card>
      ) : notes.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={PhoneCall}
            title="لا ملاحظات بعد"
            description="أول اتصال أو زيارة أو وعد سداد يُوثّق هنا ولا يمكن تعديله لاحقًا."
          />
        </Card>
      ) : (
        <ol className="grid gap-2">
          {notes.map((note) => (
            <li key={note.id}>
              <Card className="gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{noteTypeLabels[note.note_type]}</Badge>
                  {note.next_followup_at ? (
                    <Badge variant="warning">متابعة: {formatDateTime(note.next_followup_at)}</Badge>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {note.created_by_name} • {formatDateTime(note.created_at)}
                  </span>
                </div>
                <p className="text-sm leading-6 break-words whitespace-pre-wrap">{note.note}</p>
              </Card>
            </li>
          ))}
        </ol>
      )}

      <AddCustomerNoteDialog
        open={dialogOpen}
        customer={customer}
        onOpenChange={setDialogOpen}
        onSaved={() => void load()}
        canWrite={hasPermission('customers.create')}
      />
    </div>
  )
}

export function CustomerProfilePage() {
  const { customerId } = useParams<{ customerId: string }>()
  const [customer, setCustomer] = useState<CustomerRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<CustomerTabId>('personal')
  const { profileLoading } = useAuth()

  useEffect(() => {
    let mounted = true
    if (customerId) {
      fetchCustomer(customerId)
        .then((row) => {
          if (mounted) setCustomer(row)
        })
        .catch((loadError) => {
          if (mounted) setError(translateCustomerError(loadError))
        })
    }
    return () => {
      mounted = false
    }
  }, [customerId])

  if (!customerId) {
    return <Card className="p-6 text-sm text-destructive">معرّف العميل غير موجود في الرابط.</Card>
  }

  if (error) {
    return <Card className="p-6 text-sm text-destructive">{error}</Card>
  }

  if (!customer || profileLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-md" />
          <Skeleton className="h-9 w-64" />
        </div>
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
  }

  return <CustomerProfile customer={customer} activeTab={activeTab} onTabChange={setActiveTab} />
}
