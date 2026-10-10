/** JSON-LD an toàn khi nhúng vào <script>: thoát ký tự "<" (và dấu phân cách dòng U+2028/2029) để chuỗi dữ liệu không thể đóng thẻ script. */
const LS = String.fromCharCode(0x2028)
const PS = String.fromCharCode(0x2029)

export function ld(data: unknown): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, '\\u003c').split(LS).join('\\u2028').split(PS).join('\\u2029') }
}

export interface Crumb { name: string; url: string }

export function breadcrumbLd(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
  }
}
