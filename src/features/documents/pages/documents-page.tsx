import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { FileText } from 'lucide-react'

import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

import { fetchCustomers } from '@/features/customers/api'
import { fetchSuppliers } from '@/features/suppliers/api'
import { DocumentsPanel } from '../components/documents-panel'

type OwnerType = 'customer' | 'supplier'

export function DocumentsPage() {
  const [ownerType, setOwnerType] = useState<OwnerType>('customer')
  const [owners, setOwners] = useState<{ id: string; label: string }[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    const loader =
      ownerType === 'customer'
        ? fetchCustomers({ status: 'all' }).then((rows) =>
            rows.map((r) => ({ id: r.id, label: `${r.code} — ${r.full_name}` })),
          )
        : fetchSuppliers({ status: 'all' }).then((rows) =>
            rows.map((r) => ({ id: r.id, label: `${r.code ?? ''} — ${r.full_name}` })),
          )

    loader
      .then((rows) => {
        if (!active) return
        setOwners(rows)
        setSelectedId(rows[0]?.id ?? '')
      })
      .catch((e) => {
        if (active) toast.error(e instanceof Error ? e.message : 'تعذر تحميل القائمة')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [ownerType])

  const selectedOwner = owners.find((o) => o.id === selectedId)

  return (
    <div className="space-y-6">
      <PageHeader title="المستندات" description="مركز مستندات العملاء والموردين (صور، هويات، سجلات تجارية)" />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium">نوع المالك</label>
            <Select
              value={ownerType}
              onChange={(e) => setOwnerType(e.target.value as OwnerType)}
            >
              <option value="customer">عميل</option>
              <option value="supplier">مورد</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">المالك</label>
            {loading ? (
              <Skeleton className="h-10 w-full" />
            ) : owners.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا يوجد {ownerType === 'customer' ? 'عملاء' : 'موردون'}</p>
            ) : (
              <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>
      </Card>

      {selectedId ? (
        <DocumentsPanel
          ownerType={ownerType}
          ownerId={selectedId}
          ownerLabel={selectedOwner?.label ?? ''}
        />
      ) : (
        <EmptyState icon={FileText} title="اختر مالكاً لعرض مستنداته" description="اختر عميلاً أو مورداً من القائمة." />
      )}
    </div>
  )
}
