import { LoaderCircle } from 'lucide-react'

export function AuthLoadingScreen() {
  return (
    <div
      className="grid min-h-screen place-items-center bg-background p-6"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 text-sm font-semibold text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin text-accent" />
        جارٍ التحقق من الجلسة...
      </div>
    </div>
  )
}
