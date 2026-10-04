import type { Metadata } from 'next'
import { AccountSettings } from '@/components/account/AccountSettings'
import { getAccount } from '@/lib/account'

export const metadata: Metadata = { title: 'Konto & Daten — Ocuris' }

export default async function AccountPage() {
  return <AccountSettings account={await getAccount()} />
}
