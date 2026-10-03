import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe/client'
import { CREDIT_PACKS, PLANS } from '@/lib/stripe/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SubscriptionTier } from '@/types/database'

/**
 * Stripe-Ereignisse → Tarif und Guthaben.
 *
 * Abo-Ereignisse lesen das Abo frisch bei Stripe, statt dem Stand im
 * Ereignis zu trauen: Stripe stellt Ereignisse mehrfach und ungeordnet zu,
 * der aktuelle Stand ist aber immer derselbe. `apply_subscription` rechnet
 * daraus Kontingent und Gutschriften, `grant_token_pack` bucht Nachkäufe
 * einmal je Checkout-Session.
 */
export async function POST(req: NextRequest) {
  const stripe = getStripe()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !webhookSecret) return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 })
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    const db = createAdminClient()
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id)
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
        const ended = subscription.status === 'canceled' || subscription.status === 'incomplete_expired'
        const userId = await findUser(db, customerId, subscription.metadata?.supabase_user_id)
        if (!userId) {
          // Beendetes Abo ohne Profil: Das Konto wurde gelöscht, die Löschung
          // hat das Abo beendet. Nichts zu tun — ein Fehler hieße drei Tage
          // lang Wiederholungen von Stripe.
          if (ended) {
            console.log(`[stripe] Abo ${subscription.id} beendet, Konto bereits gelöscht`)
            break
          }
          throw new Error(`Kein Profil für Stripe-Kunde ${customerId}`)
        }

        const item = subscription.items.data[0]
        const plan = item ? planForPrice(item.price.id) : null
        // Eine fehlende Preis-Variable darf kein bezahltes Abo herabstufen:
        // Fehler zurückgeben, Stripe stellt das Ereignis später erneut zu.
        if (!plan && !ended) throw new Error(`Unbekannter Preis ${item?.price.id ?? '–'} im Abo ${subscription.id}`)
        const { error } = await db.rpc('apply_subscription', {
          p_user_id: userId,
          p_tier: plan?.tier ?? 'free',
          p_monthly_credits: plan?.credits ?? 0,
          p_status: subscription.status,
          p_period_start: item ? new Date(item.current_period_start * 1000).toISOString() : null,
          p_period_end: item ? new Date(item.current_period_end * 1000).toISOString() : null,
          p_subscription_id: subscription.id,
          p_customer_id: customerId,
        })
        if (error) throw error
        console.log(`[stripe] Abo ${subscription.id}: ${plan?.tier ?? 'unbekannt'} (${subscription.status})`)
        break
      }

      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session
        const pack = CREDIT_PACKS.find((item) => item.id === session.metadata?.credit_pack)
        if (session.mode !== 'payment' || !pack || session.payment_status !== 'paid') break
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
        const userId = await findUser(db, customerId ?? null, session.client_reference_id ?? session.metadata?.supabase_user_id)
        if (!userId) throw new Error(`Kein Profil für Checkout ${session.id}`)
        const { error } = await db.rpc('grant_token_pack', { p_user_id: userId, p_tokens: pack.credits, p_reference: session.id })
        if (error) throw error
        console.log(`[stripe] ${pack.credits} Credits für Checkout ${session.id}`)
        break
      }

      case 'invoice.payment_failed':
        // Stripe versucht es erneut und setzt das Abo auf past_due; das
        // meldet customer.subscription.updated. Bis dahin bleibt das
        // Guthaben unangetastet, neue Monatsgutschriften pausieren.
        console.warn(`[stripe] Zahlung fehlgeschlagen: ${(event.data.object as Stripe.Invoice).id}`)
        break

      default:
        break
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Error processing webhook:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

function planForPrice(priceId: string): { tier: SubscriptionTier; credits: number } | null {
  for (const plan of PLANS) {
    if (!plan.priceEnv) continue
    if (priceId === process.env[plan.priceEnv]) {
      return { tier: plan.tier, credits: plan.credits }
    }
  }
  return null
}

/** Profil zum Stripe-Kunden; die Supabase-ID aus den Metadaten als Rückfall für den ersten Kauf. */
async function findUser(db: ReturnType<typeof createAdminClient>, customerId: string | null, userId?: string | null) {
  if (customerId) {
    const { data, error } = await db.from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle()
    if (error) throw error
    if (data) return data.id as string
  }
  if (!userId) return null
  const { data, error } = await db.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (error) throw error
  return (data?.id as string | undefined) ?? null
}
