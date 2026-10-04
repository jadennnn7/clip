import type { SubscriptionTier } from '@/types/database'
import type { BillingInterval } from '@/lib/stripe/plans'

export type CheckoutRequest =
  | { kind: 'plan'; tier: SubscriptionTier; interval?: BillingInterval }
  | { kind: 'pack'; packId: string }
  | { kind: 'portal' }

/**
 * Startet Checkout oder Tarifwechsel. `null` heißt: Die Seite wechselt gerade
 * zu Stripe, der Knopf bleibt im Ladezustand. Sonst eine Meldung für den Nutzer.
 */
export async function startCheckout(request: CheckoutRequest): Promise<string | null> {
  try {
    const response = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    const data = await response.json().catch(() => null) as { url?: unknown; error?: unknown } | null
    if (response.ok && typeof data?.url === 'string') {
      window.location.assign(data.url)
      return null
    }
    if (response.status === 401) return 'Bitte melde dich erneut an, um den Kauf abzuschließen.'
    return typeof data?.error === 'string' ? data.error : 'Der Checkout ließ sich nicht starten. Bitte versuch es gleich noch einmal.'
  } catch {
    return 'Keine Verbindung zum Checkout. Bitte versuch es gleich noch einmal.'
  }
}
