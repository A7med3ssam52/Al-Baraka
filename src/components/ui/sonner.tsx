import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { useTheme } from '@/components/theme-provider'

function Toaster(props: ToasterProps) {
  const { theme } = useTheme()
  return (
    <Sonner
      dir="rtl"
      theme={theme === 'dark' ? 'dark' : 'light'}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:border-border group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
