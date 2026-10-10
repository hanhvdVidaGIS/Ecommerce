'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, errorMessage } from './errors'

export interface QueryState<T> {
  data: T | null
  loading: boolean
  error: string | null
  /** Mã HTTP của lỗi gần nhất (404 để hiện "không tìm thấy"). */
  status: number | null
  reload: () => void
  setData: (next: T | null | ((prev: T | null) => T | null)) => void
}

/**
 * Tải dữ liệu một lần khi `key` đổi, có trạng thái tải/lỗi/thử lại. `fetcher` có thể đổi theo mỗi lần render;
 * chỉ `key` quyết định khi nào tải lại. Kết quả của lần gọi cũ bị bỏ khi `key` đổi.
 */
export function useApiQuery<T>(fetcher: () => Promise<T>, key: string, enabled = true): QueryState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<number | null>(null)
  const [nonce, setNonce] = useState(0)
  const fetchRef = useRef(fetcher)
  useEffect(() => { fetchRef.current = fetcher })

  useEffect(() => {
    if (!enabled) return
    let alive = true
    setLoading(true)
    setError(null)
    setStatus(null)
    fetchRef.current().then(
      (d) => { if (alive) { setData(d); setLoading(false) } },
      (e) => {
        if (!alive) return
        setError(errorMessage(e, 'Không tải được dữ liệu. Vui lòng thử lại.'))
        setStatus(e instanceof ApiError ? e.status : null)
        setLoading(false)
      },
    )
    return () => { alive = false }
  }, [key, nonce, enabled])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, loading, error, status, reload, setData }
}
