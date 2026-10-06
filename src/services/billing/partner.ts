import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { PARTNER } from '@/lib/partner'

/**
 * Partnerprogramm: Provisionen buchen und den Stand eines Partners lesen.
 *
 * Gebucht wird in der Datenbank (`record_partner_commission`,
 * `reverse_partner_commission`), idempotent über die Stripe-Referenz. Satz,
 * Laufzeit und Wartezeit kommen aus `PARTNER` in src/lib/partner.ts.
 */

export interface PartnerCommission {
  id: string
  netCents: number
  commissionCents: number
  reversedCents: number
  paidAt: string
  availableAt: string
}

export interface PartnerPayout {
  id: string
  amountCents: number
  createdAt: string
}

export interface PartnerOverview {
  code: string
  signups: number
  customers: number
  pendingCents: number
  /** Kann nach einer Erstattung nach der Auszahlung negativ sein. */
  availableCents: number
  paidOutCents: number
  nextReleaseAt: string | null
  commissions: PartnerCommission[]
  payouts: PartnerPayout[]
}

export class PartnerError extends Error {}

const SETUP_ERROR = 'Das Partnerprogramm ist noch nicht eingerichtet. Bitte die Datenbank-Migration einspielen.'
const READ_ERROR = 'Dein Partnerstand konnte nicht geladen werden. Bitte später erneut versuchen.'

function failure(error: { code?: string; message?: string }, operation: string): never {
  console.error(`[partner] ${operation}`, { code: error.code, message: error.message })
  const missingSchema = ['PGRST202', 'PGRST205', '42P01', '42883', '42703'].includes(error.code ?? '')
  throw new PartnerError(missingSchema ? SETUP_ERROR : READ_ERROR)
}

/** Wie viele Zeilen die Partnerseite zeigt — ältere stehen nur noch in der Summe. */
const HISTORY = 50

export async function readPartnerOverview(userId: string, db: SupabaseClient = createAdminClient()): Promise<PartnerOverview> {
  const [overview, commissions, payouts] = await Promise.all([
    db.rpc('partner_overview', { p_user_id: userId }),
    db.from('partner_commissions')
      .select('id, net_cents, commission_cents, reversed_cents, paid_at, available_at')
      .eq('user_id', userId).order('paid_at', { ascending: false }).limit(HISTORY),
    db.from('partner_payouts')
      .select('id, amount_cents, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(HISTORY),
  ])
  if (overview.error) failure(overview.error, 'Stand lesen')
  if (commissions.error) failure(commissions.error, 'Provisionen lesen')
  if (payouts.error) failure(payouts.error, 'Auszahlungen lesen')
  const row = (Array.isArray(overview.data) ? overview.data[0] : overview.data) as Record<string, unknown> | null
  if (!row || typeof row.partner_code !== 'string') failure({ message: 'Leere Antwort' }, 'Stand lesen')

  return {
    code: row.partner_code as string,
    signups: Number(row.signups),
    customers: Number(row.customers),
    pendingCents: Number(row.pending_cents),
    availableCents: Number(row.available_cents),
    paidOutCents: Number(row.paid_out_cents),
    nextReleaseAt: typeof row.next_release_at === 'string' ? row.next_release_at : null,
    commissions: (commissions.data ?? []).map((item) => ({
      id: item.id as string,
      netCents: Number(item.net_cents),
      commissionCents: Number(item.commission_cents),
      reversedCents: Number(item.reversed_cents),
      paidAt: item.paid_at as string,
      availableAt: item.available_at as string,
    })),
    payouts: (payouts.data ?? []).map((item) => ({
      id: item.id as string,
      amountCents: Number(item.amount_cents),
      createdAt: item.created_at as string,
    })),
  }
}

export interface CommissionInput {
  /** Das geworbene Konto, das bezahlt hat. */
  customerId: string
  /** Stripe-Rechnung oder Checkout-Session — bucht je Referenz genau einmal. */
  reference: string
  paymentIntent: string | null
  netCents: number
  currency: string
  paidAt: Date
}

/** Bucht die Provision einer Zahlung; null, wenn das Konto keinen Partner hat oder die Laufzeit vorbei ist. */
export async function recordPartnerCommission(db: SupabaseClient, input: CommissionInput): Promise<number | null> {
  if (input.netCents <= 0) return null
  const { data, error } = await db.rpc('record_partner_commission', {
    p_customer_id: input.customerId,
    p_reference: input.reference,
    p_payment_intent: input.paymentIntent,
    p_net_cents: input.netCents,
    p_currency: input.currency,
    p_paid_at: input.paidAt.toISOString(),
    p_rate: PARTNER.rate,
    p_months: PARTNER.months,
    p_hold_days: PARTNER.holdDays,
  })
  if (error) throw error
  return typeof data === 'number' ? data : null
}

/** Nimmt Provisionen zu einer Zahlung anteilig zurück; Stripe meldet den bisher erstatteten Gesamtbetrag. */
export async function reversePartnerCommission(db: SupabaseClient, paymentIntent: string, refundedCents: number, amountCents: number) {
  if (!(amountCents > 0)) return
  const { error } = await db.rpc('reverse_partner_commission', {
    p_payment_intent: paymentIntent,
    p_refunded_cents: Math.max(0, Math.round(refundedCents)),
    p_amount_cents: Math.round(amountCents),
  })
  if (error) throw error
}
