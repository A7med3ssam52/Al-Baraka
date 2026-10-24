import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'

import { StatusPage } from '@/app/pages/status-page'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <StatusPage
      icon={Compass}
      code="404"
      title="الصفحة غير موجودة"
      description="الرابط الذي تحاول الوصول إليه غير صحيح أو تم نقله. يمكنك العودة إلى لوحة التحكم والبدء من هناك."
      actions={
        <>
          <Button asChild>
            <Link to="/">العودة للوحة التحكم</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/design-system">عرض النظام التصميمي</Link>
          </Button>
        </>
      }
    />
  )
}
