import { X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { Button } from './primitives'

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', dismissible = true }: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  dismissible?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose()
      if (e.key === 'Tab' && panelRef.current) {
        // giữ tiêu điểm bên trong hộp thoại
        const focusable = panelRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')
        if (focusable.length === 0) return
        const first = focusable[0], last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    queueMicrotask(() => panelRef.current?.querySelector<HTMLElement>('[autofocus],input,select,textarea,button')?.focus())
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus()
    }
  }, [open, onClose, dismissible])

  if (!open) return null
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={dismissible ? onClose : undefined} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn('relative flex max-h-[92vh] w-full flex-col rounded-t-xl bg-surface shadow-xl sm:rounded-xl', widths[size])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {dismissible && (
            <button type="button" onClick={onClose} aria-label="Đóng" className="rounded p-1 text-muted hover:bg-surface-2">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ---------- Xác nhận ---------- */
interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
}

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null)

/** Hộp thoại xác nhận dùng dạng Promise: `if (!(await confirm({ title: 'Xoá?' }))) return`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...options, resolve })), [])
  const close = (value: boolean) => {
    state?.resolve(value)
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>{state?.cancelLabel ?? 'Huỷ'}</Button>
            <Button variant={state?.tone === 'primary' ? 'primary' : 'danger'} onClick={() => close(true)}>{state?.confirmLabel ?? 'Xác nhận'}</Button>
          </>
        }
      >
        {state?.message && <div className="text-sm text-muted">{state.message}</div>}
      </Modal>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm phải dùng bên trong ConfirmProvider')
  return ctx
}
