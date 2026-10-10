'use client'
import { useCallback, useEffect, useState } from 'react'
import { api } from './client-api'
import { errorMessage } from './errors'

export interface AddressUnit { code: string; name: string }

// Danh mục địa giới ít đổi: nhớ trong phiên trình duyệt để không gọi lại mỗi lần đổi trang.
let provincesCache: AddressUnit[] | null = null
const wardsCache = new Map<string, AddressUnit[]>()

interface Loaded { data: AddressUnit[]; loading: boolean; error: string | null; retry: () => void }

function useUnits(key: string | null, fetcher: () => Promise<AddressUnit[]>, cached: () => AddressUnit[] | undefined, store: (v: AddressUnit[]) => void): Loaded {
  const [state, setState] = useState<{ key: string | null; data: AddressUnit[]; error: string | null }>({ key: null, data: [], error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (key === null) return
    const hit = cached()
    if (hit) { setState({ key, data: hit, error: null }); return }
    let live = true
    fetcher().then(
      (data) => { store(data); if (live) setState({ key, data, error: null }) },
      (e) => { if (live) setState({ key, data: [], error: errorMessage(e, 'Không tải được danh sách địa chỉ.') }) },
    )
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const ready = key !== null && state.key === key
  return { data: ready ? state.data : [], loading: key !== null && !ready, error: ready ? state.error : null, retry }
}

export function useProvinces(): Loaded {
  return useUnits('provinces', () => api.get<AddressUnit[]>('/api/public/address/provinces'), () => provincesCache ?? undefined, (v) => { provincesCache = v })
}

/** Phường/xã của một tỉnh; null thì chưa tải gì (chưa chọn tỉnh). */
export function useWards(provinceCode: string | null): Loaded {
  return useUnits(
    provinceCode,
    () => api.get<AddressUnit[]>(`/api/public/address/provinces/${encodeURIComponent(provinceCode!)}/wards`),
    () => (provinceCode ? wardsCache.get(provinceCode) : undefined),
    (v) => { if (provinceCode) wardsCache.set(provinceCode, v) },
  )
}
