import type { Metadata } from 'next'
import { AddressesClient } from '@/components/account/AddressesClient'

export const metadata: Metadata = { title: 'Sổ địa chỉ' }

export default function AddressesPage() {
  return <AddressesClient />
}
