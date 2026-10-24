import { Construction } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

interface ComingSoonPageProps {
  title: string
  phase: string
  description: string
}

export function ComingSoonPage({ title, phase, description }: ComingSoonPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${phase} — مرحلة لاحقة`}
        title={title}
        description={description}
        actions={<Badge variant="warning">قيد الانتظار</Badge>}
      />
      <EmptyState
        icon={Construction}
        title="هذه الشاشة قيد البناء"
        description="تم تجهيز الهيكل والتوجيه، وسيتم تنفيذ شاشة العمل الكاملة في مرحلتها المحددة وفق خطة المشروع."
        action={
          <Button asChild variant="outline">
            <Link to="/">العودة للوحة التحكم</Link>
          </Button>
        }
      />
    </div>
  )
}
