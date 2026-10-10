import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ApiError } from '@/api/client'
import { AuthProvider } from '@/auth/AuthProvider'
import { ConfirmProvider } from '@/components/ui/overlays'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Không thử lại các lỗi do người dùng (4xx); chỉ thử lại lỗi mạng/máy chủ một lần.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1,
    },
  },
})

// Router dạng "data router" (thay cho BrowserRouter) để các trang dùng được useBlocker (cảnh báo rời trang khi có thay đổi chưa lưu).
// Mọi đường dẫn vẫn do <Routes> trong App xử lý qua route "*".
const router = createBrowserRouter(
  [{
    path: '*',
    element: (
      <AuthProvider>
        <ConfirmProvider>
          <App />
          <Toaster position="top-right" richColors closeButton />
        </ConfirmProvider>
      </AuthProvider>
    ),
  }],
  { basename: '/admin' },
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
