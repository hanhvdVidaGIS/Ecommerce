import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="container-page py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent">404</p>
      <h1 className="mt-2 text-3xl font-bold">Không tìm thấy trang</h1>
      <p className="mx-auto mt-3 max-w-md text-muted">Đường dẫn có thể đã thay đổi hoặc nội dung không còn hiển thị.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/" className="btn btn-primary">Về trang chủ</Link>
        <Link href="/products" className="btn btn-outline">Xem sản phẩm</Link>
      </div>
    </div>
  )
}
