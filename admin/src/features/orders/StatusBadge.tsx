import { useEnumLabel } from '@/api/hooks'
import { Badge } from '@/components/ui/primitives'
import { orderStatusTone, paymentStatusTone } from './model'

/** Nhãn lấy từ Meta (backend); màu lấy từ map duy nhất trong model.ts. */
export function OrderStatusBadge({ status }: { status: string }) {
  const label = useEnumLabel('OrderStatus')
  return <Badge tone={orderStatusTone(status)} className="whitespace-nowrap">{label(status)}</Badge>
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const label = useEnumLabel('PaymentStatus')
  return <Badge tone={paymentStatusTone(status)} className="whitespace-nowrap">{label(status)}</Badge>
}
