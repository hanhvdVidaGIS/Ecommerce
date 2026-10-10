import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/ui/data'
import { Button } from '@/components/ui/primitives'

export function NotFoundPage() {
  return <EmptyState title="Không tìm thấy trang" description="Địa chỉ không tồn tại hoặc đã được di chuyển." action={<Link to="/"><Button variant="secondary">Về trang tổng quan</Button></Link>} />
}

export function ForbiddenPage() {
  return <EmptyState title="Bạn không có quyền truy cập" description="Liên hệ Super Admin nếu bạn cần quyền này." action={<Link to="/"><Button variant="secondary">Về trang tổng quan</Button></Link>} />
}
