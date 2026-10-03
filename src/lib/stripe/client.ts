import 'server-only'

import Stripe from 'stripe'

let client: Stripe | null = null

/**
 * Stripe erst beim ersten Aufruf anlegen, nicht beim Laden des Moduls.
 *
 * `new Stripe(undefined)` wirft sofort. Auf Modulebene ließ das `next build`
 * beim „Collecting page data" scheitern, solange kein STRIPE_SECRET_KEY
 * gesetzt war — und damit jedes Deployment, auch ohne Bezahlfunktion.
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  client ??= new Stripe(key, { apiVersion: '2026-08-26.dahlia' })
  return client
}
