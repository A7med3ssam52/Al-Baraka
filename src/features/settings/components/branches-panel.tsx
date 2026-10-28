import { AlertTriangle, Building2, MapPin, Pencil, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
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
import { formatDate } from '@/lib/utils'

import { fetchBranches } from '../api'
import type { BranchRecord } from '../types'
import { BranchDialog } from './branch-dialog'

interface BranchesPanelProps {
  canManage: boolean
}

export function BranchesPanel({ canManage }: BranchesPanelProps) {
  const { isOwner } = useAuth()
  const [branches, setBranches] = useState<BranchRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState<BranchRecord | null>(null)

  useEffect(() => {
    let active = true

    fetchBranches()
      .then((nextBranches) => {
        if (!active) return
        setBranches(nextBranches)
        setError(null)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'تعذر تحميل الفروع. تحقق من الاتصال وحاول مرة أخرى.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [reloadKey])

  const reload = () => {
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  const openCreate = () => {
    setSelectedBranch(null)
    setDialogOpen(true)
  }

  const openEdit = (branch: BranchRecord) => {
    setSelectedBranch(branch)
    setDialogOpen(true)
  }

  const activeCount = branches.filter((branch) => branch.is_active).length

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Building2 className="size-4 text-accent-foreground" />
            فروع المعرض
          </h2>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            {branches.length} فرع — {activeCount} نشط. كل فرع له ترقيم مستندات وخزنة مستقلة.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={reload}
            disabled={loading}
            aria-label="تحديث الفروع"
          >
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
          </Button>
          {isOwner ? (
            <Button type="button" onClick={openCreate}>
              <Plus />
              إضافة فرع
            </Button>
          ) : null}
        </div>
      </div>

      {!isOwner && canManage ? (
        <p className="border-b border-border bg-muted/35 px-4 py-2.5 text-[11px] leading-5 text-muted-foreground">
          إضافة الفروع متاحة للمالك فقط. يمكنك تعديل بيانات الفروع المسندة إليك.
        </p>
      ) : null}

      {error ? (
        <div className="p-4">
          <EmptyState
            icon={AlertTriangle}
            title="تعذر تحميل الفروع"
            description={error}
            action={
              <Button type="button" variant="outline" onClick={reload}>
                <RefreshCw />
                إعادة المحاولة
              </Button>
            }
          />
        </div>
      ) : loading ? (
        <div className="space-y-3 p-4" role="status" aria-live="polite">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-44 max-w-full" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      ) : branches.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={Building2}
            title="لا توجد فروع ظاهرة"
            description="تأكد من إسناد فرع لحسابك، أو أضف فرعًا جديدًا إن كنت مالك النظام."
            action={
              isOwner ? (
                <Button type="button" onClick={openCreate}>
                  <Plus />
                  إضافة فرع
                </Button>
              ) : null
            }
          />
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الفرع</TableHead>
                  <TableHead>العنوان</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>تاريخ الإنشاء</TableHead>
                  <TableHead className="text-end">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((branch) => {
                  const isLaunchBranch = branch.code === 'SNH-01'

                  return (
                    <TableRow key={branch.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                            <Building2 className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
                              {branch.name}
                              {isLaunchBranch ? (
                                <Badge variant="accent">الفرع الرئيسي</Badge>
                              ) : null}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] tracking-wide text-muted-foreground">
                              {branch.code}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {branch.address ? (
                          <span className="flex max-w-64 items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                            <MapPin className="mt-0.5 size-3.5 shrink-0" />
                            {branch.address}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={branch.is_active ? 'success' : 'destructive'}>
                          {branch.is_active ? 'نشط' : 'معطل'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(branch.created_at)}
                        </span>
                      </TableCell>
                      <TableCell className="text-end">
                        {canManage ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(branch)}
                          >
                            <Pencil />
                            تعديل
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className="divide-y divide-border md:hidden">
            {branches.map((branch) => {
              const isLaunchBranch = branch.code === 'SNH-01'

              return (
                <article key={branch.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
                        {branch.name}
                        {isLaunchBranch ? <Badge variant="accent">الرئيسي</Badge> : null}
                      </p>
                      <p className="mt-1 font-mono text-[11px] tracking-wide text-muted-foreground">
                        {branch.code}
                      </p>
                    </div>
                    <Badge variant={branch.is_active ? 'success' : 'destructive'}>
                      {branch.is_active ? 'نشط' : 'معطل'}
                    </Badge>
                  </div>

                  {branch.address ? (
                    <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-5 text-muted-foreground">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" />
                      {branch.address}
                    </p>
                  ) : null}

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-[10px] text-muted-foreground">
                      أُنشئ في {formatDate(branch.created_at)}
                    </span>
                    {canManage ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(branch)}
                      >
                        <Pencil />
                        تعديل
                      </Button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}

      {dialogOpen ? (
        <BranchDialog
          key={selectedBranch?.id ?? 'new-branch'}
          branch={selectedBranch}
          open
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) setSelectedBranch(null)
          }}
          onSaved={reload}
        />
      ) : null}
    </Card>
  )
}
