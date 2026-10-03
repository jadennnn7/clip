import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CreditError, readCreditBalance } from '@/services/billing/credits'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })
    // Das Lesen holt fällige Monatskontingente nach und läuft deshalb über
    // die Service-Rolle — für genau das angemeldete Konto.
    const balance = await readCreditBalance(user.id)
    return NextResponse.json(balance, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof CreditError ? error.message : 'Guthaben nicht verfügbar.' }, {
      status: 503, headers: { 'Cache-Control': 'private, no-store' },
    })
  }
}
