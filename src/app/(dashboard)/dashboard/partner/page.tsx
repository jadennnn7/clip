import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { PartnerProgram } from '@/components/partner/PartnerProgram'
import { getAccount } from '@/lib/account'
import { OPERATOR } from '@/lib/legal'
import { partnerLink } from '@/lib/partner'
import { PartnerError, readPartnerOverview, type PartnerOverview } from '@/services/billing/partner'

export const metadata: Metadata = { title: 'Partnerprogramm — Ocuris' }

/** Die öffentliche Adresse für den Link; hinter einem Tunnel nicht `localhost`. */
async function publicOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  const list = await headers()
  const first = (name: string) => list.get(name)?.split(',')[0]?.trim() || null
  const host = first('x-forwarded-host') ?? first('host') ?? 'localhost:3000'
  return `${first('x-forwarded-proto') ?? 'http'}://${host}`
}

export default async function PartnerPage() {
  const account = await getAccount()
  let overview: PartnerOverview | null = null
  let error: string | null = account ? null : 'Im Demo-Modus ohne Konto gibt es kein Partnerprogramm.'
  if (account) {
    try {
      overview = await readPartnerOverview(account.id)
    } catch (cause) {
      error = cause instanceof PartnerError ? cause.message : 'Dein Partnerstand konnte nicht geladen werden.'
      if (!(cause instanceof PartnerError)) console.error('[partner] Seite', cause)
    }
  }

  return (
    <PartnerProgram
      overview={overview}
      link={overview ? partnerLink(await publicOrigin(), overview.code) : null}
      error={error}
      contactEmail={process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || OPERATOR.email}
    />
  )
}
