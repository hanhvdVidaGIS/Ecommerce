import { P } from '@/api/catalog.generated'
import { useAuth } from '@/auth/AuthProvider'
import { PageHeader } from '@/components/ui/data'
import { SettingsForm } from './SettingsForm'

const notStore = (group: string) => group !== 'store'

export default function WebsiteSettingsPage() {
  const { can } = useAuth()
  return (
    <>
      <PageHeader title="Website Settings" description="Tên, logo, màu sắc, font, liên hệ, mạng xã hội, footer và SEO mặc định. Thay đổi áp dụng ngay cho cửa hàng, không cần sửa mã." />
      <SettingsForm include={notStore} canEdit={can(P.WebsiteConfigUpdate)} />
    </>
  )
}
