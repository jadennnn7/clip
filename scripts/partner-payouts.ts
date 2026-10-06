#!/usr/bin/env tsx

/**
 * Auszahlungen im Partnerprogramm.
 *
 *   npm run partner:payouts
 *     Listet alle Partner, deren auszahlbarer Betrag die Mindestgrenze
 *     erreicht (siehe PARTNER in src/lib/partner.ts).
 *
 *   npm run partner:payouts -- <email> "<Referenz>"
 *     Bucht den gesamten auszahlbaren Betrag dieses Partners als ausgezahlt,
 *     z. B. mit „Überweisung 2026-10" als Referenz. Erst überweisen, dann
 *     buchen — die Seite des Partners zeigt den Betrag danach als ausgezahlt.
 */

import { createClient } from '@supabase/supabase-js'
import { PARTNER } from '../src/lib/partner'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Fehlende Umgebungsvariablen NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

interface Payable {
  user_id: string
  email: string
  partner_code: string | null
  available_cents: number
}

async function payables(minCents: number): Promise<Payable[]> {
  const { data, error } = await supabase.rpc('partner_payables', { p_min_cents: minCents })
  if (error) {
    console.error('❌ Auszahlbare Beträge nicht lesbar:', error.message)
    process.exit(1)
  }
  return (data ?? []) as Payable[]
}

async function list() {
  const rows = await payables(PARTNER.minPayoutCents)
  if (!rows.length) {
    console.log(`Niemand hat ${euro.format(PARTNER.minPayoutCents / 100)} oder mehr auszahlbar.`)
    return
  }
  console.log(`Auszahlbar ab ${euro.format(PARTNER.minPayoutCents / 100)}:\n`)
  for (const row of rows) {
    console.log(`  ${euro.format(Number(row.available_cents) / 100).padStart(12)}  ${row.email}  (${row.partner_code ?? '–'})`)
  }
  console.log('\nBuchen nach der Überweisung: npm run partner:payouts -- <email> "<Referenz>"')
}

async function pay(rawEmail: string, reference: string) {
  const email = rawEmail.trim().toLowerCase()
  const row = (await payables(1)).find((item) => item.email.trim().toLowerCase() === email)
  if (!row) {
    console.error(`❌ ${email} hat nichts auszahlbar.`)
    process.exit(1)
  }
  const amount = Number(row.available_cents)
  if (amount < PARTNER.minPayoutCents) {
    console.warn(`⚠️ ${euro.format(amount / 100)} liegt unter der Mindestgrenze — wird trotzdem gebucht.`)
  }
  const { error } = await supabase.rpc('record_partner_payout', {
    p_user_id: row.user_id,
    p_amount_cents: amount,
    p_reference: reference,
  })
  if (error) {
    console.error('❌ Auszahlung nicht gebucht:', error.message)
    process.exit(1)
  }
  console.log(`✅ ${euro.format(amount / 100)} an ${row.email} als ausgezahlt gebucht („${reference.trim()}“).`)
}

const [email, reference] = process.argv.slice(2)
if (email && !reference?.trim()) {
  console.log('Verwendung: npm run partner:payouts -- <email> "<Referenz>"')
  process.exit(1)
}
;(email ? pay(email, reference!) : list()).catch((error: unknown) => {
  console.error('❌', error instanceof Error ? error.message : error)
  process.exit(1)
})
