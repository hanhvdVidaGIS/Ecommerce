'use client'
import type { ReactNode } from 'react'
import { Modal } from './Modal'

interface Props {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Hành động phá huỷ (xoá/huỷ đơn): nút xác nhận màu cảnh báo. */
  danger?: boolean
  busy?: boolean
  /** Lỗi trả về từ lần xác nhận trước (hiện trong hộp, role=alert). */
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
  /** Nội dung thêm, ví dụ ô nhập lý do. Nếu có form riêng, hãy tự bọc <form onSubmit>. */
  children?: ReactNode
}

/** Hộp xác nhận dựa trên Modal: Esc/Huỷ đóng, tiêu điểm vào nút/ô đầu tiên. */
export function ConfirmDialog({ open, title, description, confirmLabel = 'Xác nhận', cancelLabel = 'Không', danger, busy, error, onConfirm, onCancel, children }: Props) {
  return (
    <Modal open={open} onClose={onCancel} title={title} description={description} busy={busy} size="sm">
      <form onSubmit={(e) => { e.preventDefault(); if (!busy) onConfirm() }} noValidate>
        {children}
        {error ? <p role="alert" className="mt-3 rounded border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button type="submit" className={`btn ${danger ? 'bg-danger text-white hover:opacity-90' : 'btn-primary'}`} disabled={busy}>{busy ? 'Đang xử lý…' : confirmLabel}</button>
        </div>
      </form>
    </Modal>
  )
}
