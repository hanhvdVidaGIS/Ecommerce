/** Địa chỉ Backend API dùng ở phía máy chủ (Server Components, route handler). Trình duyệt dùng đường dẫn tương đối /api. */
export const API_URL = process.env.API_URL ?? 'http://localhost:5099'

/** Địa chỉ công khai của cửa hàng, dùng cho canonical, sitemap, Open Graph. */
export const SITE_URL = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
