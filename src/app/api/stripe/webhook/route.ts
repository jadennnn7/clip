import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe/client'
import { netCents } from '@/lib/partner'
import { CREDIT_PACKS, PLANS } from '@/lib/stripe/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordPartnerCommission, reversePartnerCommission } from '@/services/billing/partner'
import type { SubscriptionTier } from '@/types/database'

/**
 * Stripe-Ereignisse → Tarif und Guthaben.
 *
 * Abo-Ereignisse lesen das Abo frisch bei Stripe, statt dem Stand im
 * Ereignis zu trauen: Stripe stellt Ereignisse mehrfach und ungeordnet zu,
 * der aktuelle Stand ist aber immer derselbe. `apply_subscription` rechnet
 * daraus Kontingent und Gutschriften, `grant_token_pack` bucht Nachkäufe
 * einmal je Checkout-Session. `invoice.upcoming` lässt Jahresabos nach dem
 * ersten Jahr monatlich weiterlaufen.
 *
 * Partnerprogramm: Jede bezahlte Rechnung (`invoice.paid`) und jeder
 * Nachkauf eines geworbenen Kontos bucht eine Provision, Erstattungen
 * (`charge.refunded`) und Rückbuchungen (`charge.dispute.created`) nehmen
 * sie anteilig zurück.
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
        const total = session.amount_total ?? 0
        const commission = await recordPartnerCommission(db, {
          customerId: userId,
          reference: session.id,
          paymentIntent: idOf(session.payment_intent),
          netCents: netCents({ paid: total, total, tax: session.total_details?.amount_tax ?? 0, taxComputed: session.automatic_tax.enabled }),
          currency: session.currency ?? 'eur',
          paidAt: new Date(event.created * 1000),
        })
        if (commission !== null) console.log(`[stripe] Partnerprovision ${commission} ct für Checkout ${session.id}`)
        break
      }

      case 'invoice.paid':
        await creditPartnerForInvoice(stripe, db, event.data.object as Stripe.Invoice, event.created)
        break

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const paymentIntent = idOf(charge.payment_intent)
        if (paymentIntent) await reversePartnerCommission(db, paymentIntent, charge.amount_refunded, charge.amount_captured || charge.amount)
        break
      }

      case 'charge.dispute.created': {
        // Eine Rückbuchung nimmt die ganze Provision zurück; gewinnt man den
        // Streit, kommt sie nicht wieder — das wäre ein Fall für Handarbeit.
        const paymentIntent = idOf((event.data.object as Stripe.Dispute).payment_intent)
        if (paymentIntent) await reversePartnerCommission(db, paymentIntent, 1, 1)
        break
      }

      case 'invoice.upcoming': {
        const invoice = event.data.object as Stripe.Invoice
        const ref = invoice.parent?.subscription_details?.subscription
        if (ref) await continueYearlyAsMonthly(stripe, typeof ref === 'string' ? ref : ref.id)
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

/**
 * Provision für eine bezahlte Rechnung eines geworbenen Kontos. Erst prüfen,
 * ob das Konto überhaupt einen Partner hat — sonst kostet jede Rechnung einen
 * Abruf bei Stripe. Die Zahlung selbst (für spätere Erstattungen) steht nur
 * in der vollen Rechnung.
 */
async function creditPartnerForInvoice(stripe: Stripe, db: ReturnType<typeof createAdminClient>, event: Stripe.Invoice, created: number) {
  if (!event.id || event.amount_paid <= 0) return
  const userId = await findUser(db, idOf(event.customer), event.parent?.subscription_details?.metadata?.supabase_user_id)
  // Gelöschtes Konto: Die letzte Rechnung kann nach der Löschung eintreffen.
  if (!userId) return
  const { data: profile, error } = await db.from('profiles').select('referred_by').eq('id', userId).maybeSingle()
  if (error) throw error
  if (!profile?.referred_by) return

  const invoice = await stripe.invoices.retrieve(event.id, { expand: ['payments'] })
  const payment = invoice.payments?.data.find((item) => item.status === 'paid') ?? invoice.payments?.data[0]
  const commission = await recordPartnerCommission(db, {
    customerId: userId,
    reference: invoice.id!,
    paymentIntent: idOf(payment?.payment.payment_intent),
    netCents: netCents({
      paid: invoice.amount_paid,
      total: invoice.total,
      tax: invoice.total - (invoice.total_excluding_tax ?? invoice.total),
      taxComputed: invoice.automatic_tax.enabled || (invoice.total_taxes?.length ?? 0) > 0,
    }),
    currency: invoice.currency,
    paidAt: new Date((invoice.status_transitions.paid_at ?? created) * 1000),
  })
  if (commission !== null) console.log(`[stripe] Partnerprovision ${commission} ct für Rechnung ${invoice.id}`)
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null
  return typeof ref === 'string' ? ref : ref.id
}

/** Monats- und Jahrespreis eines Tarifs geben dieselben Credits pro Monat. */
function planForPrice(priceId: string): { tier: SubscriptionTier; credits: number } | null {
  for (const plan of PLANS) {
    const envs = [plan.priceEnv, plan.yearlyPriceEnv]
    if (envs.some((name) => name && priceId === process.env[name])) {
      return { tier: plan.tier, credits: plan.credits }
    }
  }
  return null
}

/**
 * Ein Jahresabo verlängert sich nicht um ein weiteres Jahr, sondern läuft
 * als Monatsabo desselben Tarifs weiter — Verbraucherverträge dürfen sich
 * stillschweigend nur auf unbestimmte Zeit mit monatlicher Kündigung
 * verlängern (§ 309 Nr. 9 BGB).
 *
 * Stripe meldet `invoice.upcoming` einige Tage vor der Verlängerung. Erst
 * dann kommt der Zeitplan an das Abo, nicht schon beim Kauf: Mit Zeitplan
 * lässt das Kundenportal weder Wechsel noch Kündigung zu, und das soll nur
 * für diese paar Tage gelten. Das laufende Jahr bleibt unverändert, danach
 * gibt der Zeitplan das Abo mit dem Monatspreis frei.
 */
async function continueYearlyAsMonthly(stripe: Stripe, subscriptionId: string) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  // Schon eingeplant (Stripe stellt Ereignisse mehrfach zu), gekündigt oder beendet.
  if (subscription.schedule || subscription.cancel_at_period_end || subscription.cancel_at) return
  if (subscription.status !== 'active' && subscription.status !== 'trialing') return
  const item = subscription.items.data[0]
  const plan = item && PLANS.find((entry) => entry.yearlyPriceEnv && item.price.id === process.env[entry.yearlyPriceEnv])
  if (!plan) return
  const monthlyPrice = plan.priceEnv ? process.env[plan.priceEnv] : undefined
  if (!monthlyPrice) throw new Error(`${plan.priceEnv} fehlt — Jahresabo ${subscription.id} kann nicht ins Monatsabo übergehen`)

  const schedule = await stripe.subscriptionSchedules.create({ from_subscription: subscription.id })
  const current = schedule.phases[0]
  if (!current) throw new Error(`Zeitplan ${schedule.id} ohne Phase`)
  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: 'release',
    proration_behavior: 'none',
    phases: [
      { items: [{ price: item.price.id, quantity: 1 }], start_date: current.start_date, end_date: current.end_date },
      { items: [{ price: monthlyPrice, quantity: 1 }], duration: { interval: 'month', interval_count: 1 } },
    ],
  })
  console.log(`[stripe] Jahresabo ${subscription.id} läuft ab ${new Date(current.end_date * 1000).toISOString()} monatlich weiter`)
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
