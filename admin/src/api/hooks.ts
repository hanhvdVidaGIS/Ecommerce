import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { Meta, SiteConfig } from './types'

/** Cấu hình công khai (tên website, logo, màu, nhãn nghiệp vụ...). Admin dùng cùng nguồn với Storefront. */
export function useSiteConfig() {
  return useQuery({ queryKey: ['site-config'], queryFn: () => api.get<SiteConfig>('/api/public/site-config'), staleTime: 60_000 })
}

/** Danh mục enum cho giao diện (nhãn tiếng Việt, giá trị) lấy từ backend nên không sao chép ở Admin. */
export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: () => api.get<Meta>('/api/admin/meta'), staleTime: Infinity })
}

/** Nhãn nghiệp vụ lấy từ cấu hình: "Sản phẩm", "Danh mục", "Thương hiệu" có thể là "Quần áo", "Hãng"... tuỳ ngành. */
export function useLabels() {
  const { data } = useSiteConfig()
  const s = data?.settings ?? {}
  return {
    product: s['store.productLabel'] || 'Sản phẩm',
    category: s['store.categoryLabel'] || 'Danh mục',
    brand: s['store.brandLabel'] || 'Thương hiệu',
    currency: s['store.currency'] || 'VND',
    timezone: s['store.timezone'] || 'Asia/Ho_Chi_Minh',
    siteName: s['general.siteName'] || 'Quản trị',
  }
}

/** Nhãn hiển thị của một giá trị enum theo Meta (fallback là chính giá trị). */
export function useEnumLabel(enumName: string) {
  const { data } = useMeta()
  const options = data?.enums?.[enumName] ?? []
  return (value: string | null | undefined) => options.find((o) => o.value === value)?.label ?? value ?? ''
}
