'use client'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-page py-24 text-center" role="alert">
      <h1 className="text-2xl font-bold">Có lỗi xảy ra</h1>
      <p className="mx-auto mt-3 max-w-md text-muted">Không tải được trang. Vui lòng thử lại sau ít phút.</p>
      {error.digest ? <p className="mt-2 text-xs text-muted">Mã lỗi: {error.digest}</p> : null}
      <button type="button" onClick={reset} className="btn btn-primary mt-8">Thử lại</button>
    </div>
  )
}
