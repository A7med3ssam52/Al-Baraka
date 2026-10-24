import { LoaderCircle } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'

export function LoadingPage() {
  return (
    <div className="space-y-6 py-4" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-sm font-semibold text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin text-accent" />
        جارٍ تحميل البيانات...
      </div>

      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-4 rounded-xl border border-border bg-card p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-5 w-36" />
          <div className="mt-6 flex h-48 items-end gap-3">
            {[45, 70, 55, 82, 63, 90, 40].map((height, index) => (
              <Skeleton
                key={index}
                className="flex-1 rounded-md"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-5 w-28" />
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
