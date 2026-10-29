import { BarChart3 } from 'lucide-react'
import { useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/features/auth/use-auth'
import { cn } from '@/lib/utils'

import { InventoryReportPanel } from '../components/inventory-report-panel'
import { PurchasesReportPanel } from '../components/purchases-report-panel'
import { VehiclesReportPanel } from '../components/vehicles-report-panel'

type ReportTab = 'inventory' | 'vehicles' | 'purchases'

const tabs: { id: ReportTab; label: string; description: string }[] = [
  {
    id: 'inventory',
    label: 'المخزون',
    description: 'أرصدة الفروع وقيمة المخزون والأصناف تحت حد الطلب.',
  },
  {
    id: 'vehicles',
    label: 'المركبات',
    description: 'سجل المركبات حسب الحالة والفرع مع التكلفة المعتمدة وحركتها.',
  },
  {
    id: 'purchases',
    label: 'المشتريات',
    description: 'إجماليات المشتريات والمدفوع والمتبقي حسب المورد والفترة.',
  },
]

export function ReportsPage() {
  const { appUser } = useAuth()
  const [tab, setTab] = useState<ReportTab>('inventory')

  const branches = appUser?.branches ?? []
  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0]

  return (
    <>
      <PageHeader
        title="التقارير"
        description="أرقام مشتقة من نفس حركات المخزون والمشتريات، فلا تنفصل التقارير عن الواقع."
      />

      <nav
        aria-label="تبويبات التقارير"
        className="flex gap-1 overflow-x-auto rounded-lg border bg-card px-1 py-1 text-sm"
      >
        {tabs.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 font-semibold transition-colors',
              tab === item.id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <BarChart3 className="size-4" />
            {item.label}
          </button>
        ))}
      </nav>

      <Card className="p-4 text-xs text-muted-foreground">{activeTab.description}</Card>

      {tab === 'inventory' ? <InventoryReportPanel branches={branches} /> : null}
      {tab === 'vehicles' ? <VehiclesReportPanel branches={branches} /> : null}
      {tab === 'purchases' ? <PurchasesReportPanel /> : null}
    </>
  )
}
