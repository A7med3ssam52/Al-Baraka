import { ShieldX } from 'lucide-react'
import { Link } from 'react-router-dom'

import { StatusPage } from '@/app/pages/status-page'
import { Button } from '@/components/ui/button'

export function ForbiddenPage() {
  return (
    <StatusPage
      icon={ShieldX}
      code="403"
      title="لا تملك صلاحية الوصول"
      description="هذه الشاشة متاحة لدور معين فقط. تواصل مع مدير المعرض إذا كنت تعتقد أن لديك صلاحية الوصول."
      actions={
        <>
          <Button asChild>
            <Link to="/">العودة للوحة التحكم</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/settings">مراجعة الإعدادات</Link>
          </Button>
        </>
      }
    />
  )
}
