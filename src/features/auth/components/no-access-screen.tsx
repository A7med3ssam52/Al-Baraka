import { LogOut, ShieldOff, UserRoundX } from 'lucide-react'

import { StatusPage } from '@/app/pages/status-page'
import { Button } from '@/components/ui/button'

import { useAuth } from '../use-auth'

interface NoAccessScreenProps {
  hasProfile: boolean
}

export function NoAccessScreen({ hasProfile }: NoAccessScreenProps) {
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen bg-background px-4">
      <StatusPage
        icon={hasProfile ? ShieldOff : UserRoundX}
        code="403"
        title={hasProfile ? 'الحساب غير مهيأ' : 'لا يوجد ملف موظف'}
        description={
          hasProfile
            ? 'تم إنشاء حسابك لكن لم يُسند إليه أي دور بعد. تواصل مع مدير المعرض لتفعيل صلاحياتك.'
            : 'هذا الحساب غير مرتبط بملف موظف في النظام. تواصل مع مدير المعرض لتسوية الحساب.'
        }
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
