import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Admin chạy dưới /admin/ để dùng chung tên miền với Storefront và API sau reverse proxy.
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:5099'

export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5173,
    // Cùng nguồn gốc với trình duyệt nên cookie HttpOnly và CSRF hoạt động như production.
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/uploads': { target: API_TARGET, changeOrigin: false },
    },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], css: false },
})
