/** Đọc số trang từ query ?page=: chỉ nhận số nguyên dương, còn lại về trang 1. */
export function parsePage(raw: string | string[] | null | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v || !/^\d{1,6}$/.test(v)) return 1
  const n = Number(v)
  return n >= 1 ? n : 1
}

export function totalPages(total: number, pageSize: number): number {
  return pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1
}
