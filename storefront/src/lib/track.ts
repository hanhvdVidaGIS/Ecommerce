/** Kiểm tra form tra cứu đơn và dịch lỗi của POST /api/orders/track thành thông báo trung tính (không lộ đơn có tồn tại hay không). */
export interface TrackErrors { orderNumber?: string; phone?: string }

export function validateTrack(v: { orderNumber: string; phone: string }, isValidPhone: (p: string) => boolean): TrackErrors {
  const e: TrackErrors = {}
  const n = v.orderNumber.trim()
  if (!n) e.orderNumber = 'Nhập mã đơn hàng.'
  else if (n.length > 30) e.orderNumber = 'Mã đơn hàng tối đa 30 ký tự.'
  if (!v.phone.trim()) e.phone = 'Nhập số điện thoại.'
  else if (!isValidPhone(v.phone)) e.phone = 'Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0 hoặc +84).'
  return e
}

export function trackErrorMessage(e: { status: number; code: string; message: string }): string {
  if (e.status === 404 || e.code === 'not_found') return 'Không tìm thấy đơn với thông tin đã nhập. Hãy kiểm tra lại mã đơn và số điện thoại.'
  if (e.status === 429 || e.code === 'rate_limited') return 'Bạn tra cứu quá nhiều lần. Vui lòng thử lại sau ít phút.'
  if (e.code === 'csrf_failed') return 'Phiên làm việc đã hết hạn. Vui lòng tải lại trang rồi thử lại.'
  return e.message || 'Không tra cứu được. Vui lòng thử lại.'
}
