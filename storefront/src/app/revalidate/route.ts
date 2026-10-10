import { timingSafeEqual } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

/** Backend gọi khi quản trị đổi cấu hình/nội dung: POST /revalidate  { tag } kèm X-Revalidate-Secret. Chỉ nhận các tag đã khai báo. */
const ALLOWED_TAGS = new Set(['site-config'])

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET
  const given = request.headers.get('x-revalidate-secret') ?? ''
  // Chưa cấu hình bí mật thì từ chối mọi yêu cầu (không có chế độ "mở").
  if (!secret || !safeEqual(secret, given)) return NextResponse.json({ ok: false }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { tag?: string } | null
  const tag = body?.tag
  if (!tag || !ALLOWED_TAGS.has(tag)) return NextResponse.json({ ok: false, error: 'invalid_tag' }, { status: 400 })

  // expire: 0 = hết hạn ngay; lần xem kế tiếp lấy dữ liệu mới và trả đúng 404 nếu nội dung đã bị gỡ (khác với 'max' vẫn trả bản cũ trong lúc làm mới).
  revalidateTag(tag, { expire: 0 })
  return NextResponse.json({ ok: true, tag })
}
