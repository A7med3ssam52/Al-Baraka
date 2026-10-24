import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface StatusPageProps {
  icon: LucideIcon
  code: string
  title: string
  description: string
  actions?: ReactNode
}

export function StatusPage({ icon: Icon, code, title, description, actions }: StatusPageProps) {
  return (
    <div className="grid min-h-[65vh] place-items-center py-10">
      <div className="mx-auto flex max-w-lg flex-col items-center text-center">
        <div className="relative mb-6">
          <div className="grid size-24 place-items-center rounded-3xl border border-border bg-card shadow-sm">
            <Icon className="size-10 text-accent" />
          </div>
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[10px] font-extrabold tracking-[0.18em] text-primary-foreground">
            {code}
          </span>
        </div>
        <h1 className="text-2xl font-extrabold text-balance sm:text-3xl">{title}</h1>
        <p className="mt-3 text-sm leading-8 text-muted-foreground">{description}</p>
        {actions ? <div className="mt-7 flex flex-wrap justify-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
