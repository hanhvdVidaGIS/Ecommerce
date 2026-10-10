import { useContext, useEffect, useRef, type MutableRefObject } from 'react'
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom'
import { useConfirm } from '@/components/ui/overlays'

function RouterBlocker({ when, allowRef }: { when: boolean; allowRef: MutableRefObject<boolean> }) {
  const confirm = useConfirm()
  const blocker = useBlocker(({ currentLocation, nextLocation }) => when && !allowRef.current && currentLocation.pathname !== nextLocation.pathname)
  const asking = useRef(false)

  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return
    asking.current = true
    confirm({ title: 'Rời trang khi chưa lưu?', message: 'Các thay đổi chưa lưu sẽ bị mất.', confirmLabel: 'Rời trang', cancelLabel: 'Ở lại' })
      .then((leave) => (leave ? blocker.proceed() : blocker.reset()))
      .finally(() => { asking.current = false })
  }, [blocker, confirm])

  return null
}

/**
 * Cảnh báo khi rời trang lúc còn thay đổi chưa lưu: đóng/tải lại tab (beforeunload) và chuyển trang trong ứng dụng (useBlocker).
 * `allowRef.current = true` để bỏ qua cảnh báo cho lần chuyển trang do chính việc lưu gây ra.
 */
export function LeaveGuard({ when, allowRef }: { when: boolean; allowRef: MutableRefObject<boolean> }) {
  const inDataRouter = !!useContext(UNSAFE_DataRouterContext)

  useEffect(() => {
    if (!when) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [when])

  // useBlocker chỉ dùng được trong data router; ngoài đó vẫn còn cảnh báo đóng/tải lại tab.
  return inDataRouter ? <RouterBlocker when={when} allowRef={allowRef} /> : null
}
