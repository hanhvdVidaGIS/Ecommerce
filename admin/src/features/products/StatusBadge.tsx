import { useEnumLabel } from '@/api/hooks'
import { Badge } from '@/components/ui/primitives'
import type { ProductStatus } from './api'

/** Màu theo ý nghĩa của trạng thái; nhãn chữ lấy từ Meta của backend. */
export function StatusBadge({ status }: { status: ProductStatus }) {
  const label = useEnumLabel('ProductStatus')
  return <Badge tone={status === 'Active' ? 'success' : status === 'Hidden' ? 'warning' : 'neutral'}>{label(status)}</Badge>
}
