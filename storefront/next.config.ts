import type { NextConfig } from 'next'

// Địa chỉ Backend API. Trình duyệt chỉ nói chuyện với Storefront (cùng nguồn gốc) nên cookie HttpOnly và CSRF hoạt động như production.
const API_URL = process.env.API_URL ?? 'http://localhost:5099'

const config: NextConfig = {
  // Cho phép build kiểm tra vào thư mục riêng mà không động tới .next của máy chủ dev đang chạy.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  poweredByHeader: false,
  output: 'standalone', // gói chạy độc lập cho Docker (xem Dockerfile)
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_URL}/api/:path*` },
      { source: '/uploads/:path*', destination: `${API_URL}/uploads/:path*` },
    ]
  },
  async redirects() {
    // Liên kết ngắn do quản trị đặt trong banner/menu: chuyển tới trang thật.
    return [
      { source: '/login', destination: '/account/login', permanent: false },
      { source: '/register', destination: '/account/register', permanent: false },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default config
