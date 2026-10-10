import type { SiteConfig } from '@/api/types'

/** OpenAPI không biểu diễn được kiểu đệ quy (children: unknown[]), nên khai báo lại đúng hình dạng của MenuNodeDto. */
export interface MenuNode {
  id: string
  title: string
  targetType: string
  slug: string | null
  url: string | null
  children: MenuNode[]
}

/** Đích của mục menu: Category → /products?category=, Page → /pages/, Url giữ nguyên. Giá trị rỗng trả về '#'. */
export function menuHref(item: Pick<MenuNode, 'targetType' | 'slug' | 'url'>): string {
  switch (item.targetType) {
    case 'Category': return item.slug ? `/products?category=${encodeURIComponent(item.slug)}` : '#'
    case 'Page': return item.slug ? `/pages/${encodeURIComponent(item.slug)}` : '#'
    default: return item.url || '#'
  }
}

export function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href)
}

export function menuByCode(config: SiteConfig, code: string): MenuNode[] {
  return (config.menus.find((m) => m.code === code)?.items ?? []) as MenuNode[]
}
