import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe/client'
import { CREDIT_PACKS, PLANS } from '@/lib/stripe/plans'
import { requestOrigin } from '@/lib/request-origin'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertSameOrigin, getAuthenticatedUser, publishingErrorResponse } from '@/services/publishing/auth'

/**
 * Startet einen Kauf bei Stripe.
 *
 * - Tarif ohne laufendes Abo: Checkout für ein neues Abo.
 * - Tarif mit laufendem Abo: Stripe-Kundenportal mit dem gewählten Tarif zur
 *   Bestätigung. So entsteht nie ein zweites Abo neben dem ersten, und Stripe
 *   verrechnet den Wechsel anteilig (Einstellungen im Kundenportal).
 * - Credit-Paket: nur zusätzlich zu einem Abo, als Einmalzahlung.
 * - Portal: Zahlungsdaten, Rechnungen und Kündigung im Stripe-Kundenportal.
 *
 * Der Browser nennt nur den Tarif oder das Paket; welche Stripe-
 * Preis-ID dazugehört, steht in Server-Umgebungsvariablen.
 */
export async function POST(request: Request) {
  const stripe = getStripe()
  if (!stripe) return json(503, 'Die Bezahlung ist noch nicht eingerichtet.')
  let userId: string
  try {
    assertSameOrigin(request)
    userId = (await getAuthenticatedUser()).id
  } catch (cause) {
    return publishingErrorResponse(cause)
  }

  const body = (await request.json().catch(() => null)) as { kind?: unknown; tier?: unknown; packId?: unknown } | null
  if (body?.kind === 'portal') return openPortal(stripe, userId, request)
  const plan = body?.kind === 'plan' ? PLANS.find((item) => item.tier === body.tier && item.priceEnv) : undefined
  const pack = body?.kind === 'pack' ? CREDIT_PACKS.find((item) => item.id === body.packId) : undefined
  const priceEnv = plan?.priceEnv ?? pack?.priceEnv
  if (!priceEnv) return json(400, 'Unbekannter Tarif oder unbekanntes Paket.')
  const priceId = process.env[priceEnv]
  if (!priceId) {
    console.error(`[checkout] ${priceEnv} ist nicht gesetzt`)
    return json(503, 'Dieser Tarif ist noch nicht buchbar.')
  }

  try {
    const db = createAdminClient()
    const { data: profile, error } = await db.from('profiles')
      .select('email, stripe_customer_id, stripe_subscription_id, monthly_credits')
      .eq('id', userId).maybeSingle()
    if (error || !profile) throw error ?? new Error('Profil fehlt')
    const subscribed = Boolean(profile.stripe_subscription_id) && Number(profile.monthly_credits) > 0
    const returnUrl = billingUrl(request)

    if (pack && !subscribed) {
      return json(409, 'Credits gibt es zusätzlich zu einem Tarif. Wähle zuerst einen Tarif.')
    }

    if (plan && subscribed && profile.stripe_customer_id) {
      const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id!)
      const item = subscription.items.data[0]
      if (!item) throw new Error(`Abo ${subscription.id} hat keine Position`)
      if (item.price.id === priceId) return json(409, 'Das ist schon dein aktueller Tarif.')
      const portal = await stripe.billingPortal.sessions.create({
        customer: profile.stripe_customer_id,
        return_url: returnUrl,
        flow_data: {
          type: 'subscription_update_confirm',
          subscription_update_confirm: {
            subscription: subscription.id,
            items: [{ id: item.id, price: priceId, quantity: 1 }],
          },
          after_completion: { type: 'redirect', redirect: { return_url: `${returnUrl}?changed=true` } },
        },
      })
      return NextResponse.json({ url: portal.url })
    }

    let customerId = profile.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email || undefined,
        metadata: { supabase_user_id: userId },
      })
      customerId = customer.id
      const { error: saveError } = await db.from('profiles').update({ stripe_customer_id: customerId }).eq('id', userId)
      if (saveError) throw saveError
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: userId,
      mode: pack ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${returnUrl}?success=true`,
      cancel_url: `${returnUrl}?canceled=true`,
      metadata: pack ? { supabase_user_id: userId, credit_pack: pack.id } : { supabase_user_id: userId },
      ...(pack ? {} : { subscription_data: { metadata: { supabase_user_id: userId } } }),
    })
    return NextResponse.json({ url: session.url })
  } catch (cause) {
    console.error('[checkout] fehlgeschlagen', cause)
    return json(500, 'Der Checkout ließ sich nicht starten. Bitte versuch es gleich noch einmal.')
  }
}

async function openPortal(stripe: NonNullable<ReturnType<typeof getStripe>>, userId: string, request: Request) {
  try {
    const { data: profile, error } = await createAdminClient().from('profiles')
      .select('stripe_customer_id').eq('id', userId).maybeSingle()
    if (error) throw error
    if (!profile?.stripe_customer_id) return json(409, 'Es gibt noch kein Abo, das sich verwalten ließe.')
    const portal = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: billingUrl(request),
    })
    return NextResponse.json({ url: portal.url })
  } catch (cause) {
    console.error('[checkout] Portal fehlgeschlagen', cause)
    return json(500, 'Das Kundenportal ließ sich nicht öffnen. Bitte versuch es gleich noch einmal.')
  }
}

function billingUrl(request: Request) {
  return `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || requestOrigin(request)}/dashboard/billing`
}

function json(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
}
