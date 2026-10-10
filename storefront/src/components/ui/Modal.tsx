'use client'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Nhiều hộp thoại chồng nhau chỉ trả lại cuộn khi hộp cuối cùng đóng.
let scrollLocks = 0
let savedOverflow = ''
function lockScroll() {
  if (scrollLocks++ === 0) { savedOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden' }
}
function unlockScroll() {
  if (--scrollLocks === 0) document.body.style.overflow = savedOverflow
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** Mô tả ngắn dưới tiêu đề, cũng được đọc bởi trình đọc màn hình. */
  description?: ReactNode
  children: ReactNode
  /** Đang xử lý: không cho đóng bằng Esc/nền/nút X. */
  busy?: boolean
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Hộp thoại dùng chung: role=dialog aria-modal, Esc đóng, bấm nền đóng, khoá cuộn nền,
 * giữ tiêu điểm trong hộp (Tab/Shift+Tab xoay vòng) và trả tiêu điểm về nơi đã mở khi đóng.
 */
export function Modal({ open, onClose, title, description, children, busy = false, size = 'md' }: ModalProps) {
  const titleId = useId()
  const descId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const busyRef = useRef(busy)
  useEffect(() => { onCloseRef.current = onClose; busyRef.current = busy })

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    lockScroll()
    const el = panel.current
    // Tiêu điểm đầu vào: ô nhập đầu tiên nếu có, không thì phần tử bấm được đầu tiên, không thì chính hộp.
    const first = el?.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])') ?? el?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? el)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (!busyRef.current) onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !el) return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement)
      if (items.length === 0) { e.preventDefault(); el.focus(); return }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === firstEl || active === el)) { e.preventDefault(); lastEl.focus() }
      else if (!e.shiftKey && active === lastEl) { e.preventDefault(); firstEl.focus() }
      else if (!el.contains(active)) { e.preventDefault(); firstEl.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      unlockScroll()
      if (previous && document.contains(previous)) previous.focus()
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null
  const width = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' }[size]
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined} tabIndex={-1}
        className={`flex max-h-[92vh] w-full ${width} flex-col overflow-hidden rounded-t-lg bg-surface shadow-xl outline-none sm:rounded-lg`}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold">{title}</h2>
            {description ? <p id={descId} className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="-mr-2 shrink-0 rounded p-2 text-muted hover:text-ink disabled:opacity-40"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
