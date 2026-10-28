import { Building2, Hash, History, Store } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/use-auth'
import { useSettings } from '@/features/settings/use-settings'
import { cn } from '@/lib/utils'

import { BranchesPanel } from '../components/branches-panel'
import { NumberingPanel } from '../components/numbering-panel'
import { ShowroomSettingsForm } from '../components/showroom-settings-form'

type SettingsTab = 'general' | 'branches' | 'numbering'

interface TabDefinition {
  key: SettingsTab
  label: string
  description: string
  icon: typeof Store
  visible: boolean
}

export function SettingsPage() {
  const { hasPermission } = useAuth()
  const { settings, error } = useSettings()
  const [requestedTab, setRequestedTab] = useState<SettingsTab>('general')

  const canViewBranches = hasPermission('branches.view')
  const canManageBranches = hasPermission('branches.manage')
  const canEditSettings = hasPermission('settings.update')
  const canViewAudit = hasPermission('audit_logs.view')

  const tabs = useMemo<TabDefinition[]>(
    () => [
      {
        key: 'general',
        label: 'بيانات المعرض',
        description: 'الاسم والشعار والعنوان وحدود الخصم',
        icon: Store,
        visible: true,
      },
      {
        key: 'branches',
        label: 'الفروع',
        description: 'إضافة الفروع وتعديلها وحالتها',
        icon: Building2,
        visible: canViewBranches,
      },
      {
        key: 'numbering',
        label: 'الترقيم',
        description: 'بادئات المستندات والمسلسلات الحالية',
        icon: Hash,
        visible: true,
      },
    ],
    [canViewBranches],
  )

  const visibleTabs = tabs.filter((tab) => tab.visible)
  const activeTab = visibleTabs.some((tab) => tab.key === requestedTab) ? requestedTab : 'general'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="إدارة النظام"
        title="الإعدادات"
        description="بيانات المعرض والفروع وبادئات المستندات. كل تغيير هنا يُسجَّل في سجل المراجعة."
        actions={
          canViewAudit ? (
            <Button asChild variant="outline">
              <Link to="/audit-logs">
                <History />
                سجل المراجعة
              </Link>
            </Button>
          ) : null
        }
      />

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-semibold leading-6 text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="أقسام الإعدادات">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon
          const isActive = tab.key === activeTab

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`settings-panel-${tab.key}`}
              id={`settings-tab-${tab.key}`}
              onClick={() => setRequestedTab(tab.key)}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-4 text-start transition-colors',
                isActive
                  ? 'border-primary/30 bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-foreground hover:border-accent/50 hover:bg-muted/45',
              )}
            >
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-lg',
                  isActive ? 'bg-white/12 text-accent' : 'bg-accent/15 text-accent-foreground',
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{tab.label}</span>
                <span
                  className={cn(
                    'mt-0.5 block text-[11px] leading-5',
                    isActive ? 'text-primary-foreground/70' : 'text-muted-foreground',
                  )}
                >
                  {tab.description}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <section
        id={`settings-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${activeTab}`}
      >
        {activeTab === 'general' ? (
          <ShowroomSettingsForm
            key={settings.updated_at ?? 'fallback-settings'}
            canEdit={canEditSettings}
          />
        ) : null}
        {activeTab === 'branches' ? <BranchesPanel canManage={canManageBranches} /> : null}
        {activeTab === 'numbering' ? (
          <NumberingPanel
            key={settings.updated_at ?? 'fallback-settings'}
            canEdit={canEditSettings}
          />
        ) : null}
      </section>
    </div>
  )
}
