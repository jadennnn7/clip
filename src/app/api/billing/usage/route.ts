import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { yearlyBillingAvailable } from '@/lib/stripe/availability'
import type { BillingInterval } from '@/lib/stripe/plans'
import { CreditError, readCreditBalance } from '@/services/billing/credits'

/** Eine Abrechnungsperiode über gut einen Monat ist ein Jahresabo. */
const YEARLY_PERIOD_MS = 40 * 24 * 60 * 60 * 1000

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })
    // Das Lesen holt fällige Monatskontingente nach und läuft deshalb über
    // die Service-Rolle — für genau das angemeldete Konto.
    const balance = await readCreditBalance(user.id)
    // Die Laufzeit steht nicht in der Datenbank, nur das Periodenende: Liegt
    // es weiter als einen Monat voraus, läuft ein Jahresabo.
    const { data: profile } = await supabase.from('profiles').select('current_period_end').eq('id', user.id).maybeSingle()
    const periodEnd = typeof profile?.current_period_end === 'string' ? Date.parse(profile.current_period_end) : NaN
    const interval: BillingInterval | null = balance.monthlyCredits > 0
      ? Number.isFinite(periodEnd) && periodEnd - Date.now() > YEARLY_PERIOD_MS ? 'year' : 'month'
      : null
    return NextResponse.json(
      { ...balance, interval, yearlyAvailable: yearlyBillingAvailable() },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    return NextResponse.json({ error: error instanceof CreditError ? error.message : 'Guthaben nicht verfügbar.' }, {
      status: 503, headers: { 'Cache-Control': 'private, no-store' },
    })
  }
}
