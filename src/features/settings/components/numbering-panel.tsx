import { AlertTriangle, Hash, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/features/auth/use-auth'
import { useSettings } from '@/features/settings/use-settings'

import { fetchBranches, fetchDocumentSequences } from '../api'
import { documentTypeLabels, type BranchRecord, type DocumentSequence } from '../types'
import { DocumentPrefixForm } from './document-prefix-form'

interface NumberingPanelProps {
  canEdit: boolean
}

export function NumberingPanel({ canEdit }: NumberingPanelProps) {
  const { appUser } = useAuth()
  const { settings } = useSettings()
  const [branches, setBranches] = useState<BranchRecord[]>([])
  const [branchesLoading, setBranchesLoading] = useState(true)
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [sequences, setSequences] = useState<DocumentSequence[]>([])
  const [sequencesLoading, setSequencesLoading] = useState(true)
  const [sequencesError, setSequencesError] = useState<string | null>(null)
  const [sequencesReloadKey, setSequencesReloadKey] = useState(0)

  useEffect(() => {
    let active = true

    fetchBranches()
      .then((nextBranches) => {
        if (!active) return
        setBranches(nextBranches)
      })
      .catch(() => {
        if (!active) return
        setBranches([])
      })
      .finally(() => {
        if (active) setBranchesLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const branchOptions = useMemo(() => {
    if (branches.length > 0) return branches

    return (appUser?.branches ?? []).map((branch) => ({
      id: branch.id,
      code: branch.code,
      name: branch.name,
      address: null,
      is_active: true,
      created_at: '',
      updated_at: '',
    }))
  }, [appUser?.branches, branches])

  const defaultBranch = appUser?.branches.find((branch) => branch.isDefault) ?? appUser?.branches[0]
  const defaultBranchId =
    branchOptions.find((branch) => branch.id === defaultBranch?.id)?.id ??
    branchOptions[0]?.id ??
    ''
  const activeBranchId = selectedBranchId || defaultBranchId
  const selectedBranch = branchOptions.find((branch) => branch.id === activeBranchId)
  const visibleSequences = activeBranchId ? sequences : []

  useEffect(() => {
    if (!activeBranchId) return

    let active = true

    const load = async () => {
      setSequencesLoading(true)
      setSequencesError(null)

      try {
        const nextSequences = await fetchDocumentSequences(activeBranchId)
        if (!active) return
        setSequences(nextSequences)
      } catch (loadError) {
        if (!active) return
        setSequences([])
        setSequencesError(
          loadError instanceof Error
            ? loadError.message
            : 'تعذر تحميل مسلسلات الترقيم. حاول مرة أخرى.',
        )
      } finally {
        if (active) setSequencesLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [activeBranchId, sequencesReloadKey])

  return (
    <div className="space-y-4">
      <DocumentPrefixForm key={settings.updated_at ?? 'fallback-prefixes'} canEdit={canEdit} />

      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold">المسلسلات الحالية</h2>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              الرقم التالي المتاح لكل نوع مستند في الفرع والسنة الحالية.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {branchesLoading ? (
              <Skeleton className="h-10 w-48" />
            ) : (
              <Select
                value={activeBranchId}
                onChange={(event) => setSelectedBranchId(event.target.value)}
                aria-label="اختيار الفرع"
                className="w-full sm:w-56"
                disabled={branchOptions.length === 0}
              >
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} ({branch.code})
                  </option>
                ))}
              </Select>
            )}
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setSequencesReloadKey((key) => key + 1)}
              disabled={sequencesLoading || !activeBranchId}
              aria-label="تحديث المسلسلات"
            >
              <RefreshCw className={sequencesLoading ? 'animate-spin' : undefined} />
            </Button>
          </div>
        </div>

        {sequencesError ? (
          <div className="p-4">
            <EmptyState
              icon={AlertTriangle}
              title="تعذر تحميل المسلسلات"
              description={sequencesError}
              action={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSequencesReloadKey((key) => key + 1)}
                >
                  <RefreshCw />
                  إعادة المحاولة
                </Button>
              }
            />
          </div>
        ) : sequencesLoading ? (
          <div className="space-y-3 p-4" role="status" aria-live="polite">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : visibleSequences.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Hash}
              title="لا توجد مسلسلات لهذا الفرع"
              description="سيتم إنشاء المسلسلات تلقائيًا عند إضافة الفرع أو عند أول استخدام لكل نوع مستند."
            />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نوع المستند</TableHead>
                    <TableHead>البادئة</TableHead>
                    <TableHead>الرقم التالي</TableHead>
                    <TableHead>مثال</TableHead>
                    <TableHead>عدد الخانات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleSequences.map((sequence) => (
                    <TableRow key={sequence.document_type}>
                      <TableCell className="font-semibold">
                        {documentTypeLabels[sequence.document_type]}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">
                          {sequence.prefix}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{sequence.next_number}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                          {sequence.sample}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {sequence.padding}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="divide-y divide-border md:hidden">
              {visibleSequences.map((sequence) => (
                <article key={sequence.document_type} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold">
                      {documentTypeLabels[sequence.document_type]}
                    </p>
                    <Badge variant="secondary" className="font-mono">
                      {sequence.prefix}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <p className="text-muted-foreground">الرقم التالي</p>
                      <p className="mt-0.5 font-mono font-bold">{sequence.next_number}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">المثال</p>
                      <p className="mt-0.5 font-mono font-bold" dir="ltr">
                        {sequence.sample}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
              {selectedBranch
                ? `${selectedBranch.name} — ${selectedBranch.code}`
                : 'لم يتم اختيار فرع'}
              <span className="mx-1.5 text-accent" aria-hidden="true">
                •
              </span>
              المسلسل الحالي لفرع واحد فقط؛ لكل فرع وسنة مسلسل مستقل.
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
