'use client'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

type Kind = 'success' | 'error' | 'info'
interface ToastItem { id: number; kind: Kind; message: string }
interface ToastApi { show: (message: string, kind?: Kind) => void }

const Ctx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)
  const show = useCallback((message: string, kind: Kind = 'info') => {
    const id = ++seq.current
    setItems((x) => [...x.slice(-2), { id, kind, message }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4500)
  }, [])
  const api = useMemo(() => ({ show }), [show])
  const tone = { success: 'bg-success text-white', error: 'bg-danger text-white', info: 'bg-ink text-white' }
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto max-w-md rounded px-4 py-3 text-sm shadow-lg ${tone[t.kind]}`}>{t.message}</div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useToast phải nằm trong ToastProvider')
  return v
}
