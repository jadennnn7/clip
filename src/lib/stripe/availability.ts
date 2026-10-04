import 'server-only'

import { PLANS } from '@/lib/stripe/plans'

/**
 * Ob Landing-Page und Abo-Seite die Wahl „Jährlich" zeigen.
 *
 * Versteckt nur in einem Fall: Stripe ist eingerichtet, aber nicht für jeden
 * bezahlten Tarif gibt es eine Jahres-Preis-ID. Dann wären die Monatstarife
 * kaufbar, der Jahrestarif nicht — ein Knopf, der beim Klick „noch nicht
 * buchbar" meldet. Ohne Stripe (lokal, Vorschau) ist gar nichts kaufbar;
 * dort steht der Jahrestarif wie die Monatstarife zur Ansicht.
 */
export function yearlyBillingAvailable(): boolean {
  if (!process.env.STRIPE_SECRET_KEY) return true
  return PLANS.every((plan) => plan.priceEnv === null || Boolean(plan.yearlyPriceEnv && process.env[plan.yearlyPriceEnv]))
}
