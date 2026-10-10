'use client'
import type { ReactNode } from 'react'
import { AuthProvider } from './AuthProvider'
import { CartProvider, useCart } from './CartProvider'
import { SiteProvider, type SiteInfo } from './SiteProvider'
import { ToastProvider } from './ToastProvider'

function AuthWithCart({ children }: { children: ReactNode }) {
  const { reload } = useCart()
  return <AuthProvider onSessionChange={() => void reload()}>{children}</AuthProvider>
}

export function Providers({ site, children }: { site: SiteInfo; children: ReactNode }) {
  return (
    <SiteProvider value={site}>
      <ToastProvider>
        <CartProvider>
          <AuthWithCart>{children}</AuthWithCart>
        </CartProvider>
      </ToastProvider>
    </SiteProvider>
  )
}
