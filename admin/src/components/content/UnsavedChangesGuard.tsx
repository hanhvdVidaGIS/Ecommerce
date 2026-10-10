import { useContext, useEffect, useRef } from 'react'
import { UNSAFE_DataRouterContext, UNSAFE_NavigationContext, useBlocker } from 'react-router-dom'
import { useConfirm } from '@/components/ui/overlays'

const CONFIRM = { title: 'Rời trang khi chưa lưu?', message: 'Các thay đổi chưa lưu sẽ bị mất.', confirmLabel: 'Rời trang' } as const

/** Báo của trình duyệt khi đóng/tải lại tab. Chuỗi tuỳ biến bị trình duyệt bỏ qua; chỉ cần preventDefault. */
function useBeforeUnload(when: boolean) {
  useEffect(() => {
    if (!when) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [when])
}

/** Dùng khi ứng dụng chạy trên data router (createBrowserRouter): chặn mọi điều hướng, kể cả nút Back. */
function BlockerGuard({ when }: { when: boolean }) {
  const confirm = useConfirm()
  const blocker = useBlocker(when)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    void confirm(CONFIRM).then((ok) => (ok ? blocker.proceed() : blocker.reset()))
  }, [blocker, confirm])
  return null
}

/**
 * Dự phòng cho <BrowserRouter> (không có data router nên `useBlocker` không dùng được; xem báo cáo):
 * bọc push/replace/go của navigator để chặn điều hướng trong ứng dụng. Nút Back của trình duyệt (popstate) không chặn được.
 */
function HistoryGuard({ when }: { when: boolean }) {
  const confirm = useConfirm()
  const { navigator } = useContext(UNSAFE_NavigationContext)
  const confirmRef = useRef(confirm)
  confirmRef.current = confirm

  useEffect(() => {
    if (!when) return
    const original = { push: navigator.push, replace: navigator.replace, go: navigator.go }
    const restore = () => { navigator.push = original.push; navigator.replace = original.replace; navigator.go = original.go }
    let asking = false
    const guard = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => {
      if (asking) return
      asking = true
      void confirmRef.current(CONFIRM).then((ok) => {
        asking = false
        if (ok) { restore(); fn.apply(navigator, args) }
      })
    }
    navigator.push = guard(original.push)
    navigator.replace = guard(original.replace)
    navigator.go = guard(original.go)
    return restore
  }, [when, navigator])
  return null
}

/** Cảnh báo khi rời trang có thay đổi chưa lưu. Đặt một lần trong trình soạn, truyền `when = form.isDirty`. */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const isDataRouter = useContext(UNSAFE_DataRouterContext) != null
  useBeforeUnload(when)
  return isDataRouter ? <BlockerGuard when={when} /> : <HistoryGuard when={when} />
}
