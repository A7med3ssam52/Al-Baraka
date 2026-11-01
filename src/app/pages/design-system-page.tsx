import { Palette } from 'lucide-react'
import { useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useTheme, THEMES, type ThemeId } from '@/components/theme-provider'

export function DesignSystemPage() {
  const { theme, setTheme } = useTheme()
  const [selected, setSelected] = useState<ThemeId>(theme)

  function apply(id: ThemeId) {
    setSelected(id)
    setTheme(id)
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="النظام التصميمي"
        title="النظام التصميمي"
        description="اختيار سمة العرض (الثيم) من السمات المتاحة. بقية المكونات قيد البناء مؤقتًا."
        actions={
          <Badge variant="accent">
            <Palette className="size-3" />
            {THEMES.length} سمات
          </Badge>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>اختيار السمة</CardTitle>
          <CardDescription>
            اختر سمة عرض. التغيير يُطبَّق فورًا ويُحفظ تلقائيًا.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {THEMES.map((t) => {
              const active = selected === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => apply(t.id)}
                  className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-start transition ${
                    active
                      ? 'border-accent bg-accent/10 ring-2 ring-accent/40'
                      : 'border-border bg-card hover:bg-muted/40'
                  }`}
                >
                  <span
                    className="h-10 w-full rounded-lg border border-border"
                    style={{ backgroundColor: t.swatch }}
                  />
                  <span className="text-sm font-bold">{t.name}</span>
                  <span className="text-[11px] text-muted-foreground">{t.description}</span>
                  {active ? <Badge variant="success">مفعّل</Badge> : null}
                </button>
              )
            })}
          </div>
          <div className="mt-4">
            <Button variant="outline" onClick={() => apply('default')}>
              إعادة تعيين إلى الافتراضي
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}