'use client'
import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/** Nút sao chép văn bản; báo "Đã sao chép" cho người dùng đọc màn hình (aria-live) và dự phòng khi trình duyệt chặn clipboard. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState<'idle' | 'ok' | 'fail'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function copy() {
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        ta.remove()
      } catch { ok = false }
    }
    setDone(ok ? 'ok' : 'fail')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDone('idle'), 2000)
  }

  return (
    <button type="button" onClick={copy} className="inline-flex min-h-9 shrink-0 items-center gap-1 border border-line px-2.5 text-xs font-medium hover:border-ink" aria-label={`Sao chép ${label}`}>
      {done === 'ok' ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      <span aria-live="polite">{done === 'ok' ? 'Đã sao chép' : done === 'fail' ? 'Không sao chép được' : 'Sao chép'}</span>
    </button>
  )
}
