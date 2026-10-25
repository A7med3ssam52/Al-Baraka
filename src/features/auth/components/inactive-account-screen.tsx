import { LogOut, ShieldOff } from 'lucide-react'

import { StatusPage } from '@/app/pages/status-page'
import { Button } from '@/components/ui/button'

import { useAuth } from '../use-auth'

export function InactiveAccountScreen() {
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen bg-background px-4">
      <StatusPage
        icon={ShieldOff}
        code="403"
        title="الحساب معطل"
        description="تم تعطيل حسابك من قبل إدارة المعرض، ولا يمكنك الوصول إلى بيانات النظام. تواصل مع المدير لإعادة تفعيل الحساب."
        actions={
          <Button type="button" onClick={() => void signOut()}>
            <LogOut />
            تسجيل الخروج
          </Button>
        }
      />
    </div>
  )
}
