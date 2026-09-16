import type { SubscriptionTier } from '@/types/database'

/**
 * Abo-Stufen.
 *
 * Bepreist wird nach Render-Minuten und verbundenen Kanälen — das sind die
 * beiden Größen, die tatsächlich Kosten verursachen: Remotion Lambda rechnet
 * nach Videolänge ab (~$0,017/Min plus Lizenzanteil), und jeder zusätzliche
 * Kanal verbraucht Publishing-Kontingent, das bei YouTube projektweit
 * gedeckelt ist (100 Uploads/Tag).
 */
export interface Plan {
  tier: SubscriptionTier
  name: string
  priceMonthly: number
  renderMinutes: number
  socialAccounts: number
  priceIdEnv: string
  features: string[]
}

export const PLANS: Plan[] = [
  {
    tier: 'free',
    name: 'Free',
    priceMonthly: 0,
    renderMinutes: 10,
    socialAccounts: 1,
    priceIdEnv: '',
    features: ['10 Render-Minuten / Monat', '1 verbundener Kanal', 'Wasserzeichen im Export'],
  },
  {
    tier: 'starter',
    name: 'Starter',
    priceMonthly: 29,
    renderMinutes: 120,
    socialAccounts: 3,
    priceIdEnv: 'NEXT_PUBLIC_STRIPE_PRICE_STARTER',
    features: [
      '120 Render-Minuten / Monat',
      '3 verbundene Kanäle',
      'Kein Wasserzeichen',
      'Freigabe-Queue',
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    priceMonthly: 79,
    renderMinutes: 500,
    socialAccounts: 9,
    priceIdEnv: 'NEXT_PUBLIC_STRIPE_PRICE_PRO',
    features: [
      '500 Render-Minuten / Monat',
      '9 verbundene Kanäle',
      'Auto-Publish ab Score 80',
      'Prioritäts-Rendering',
    ],
  },
  {
    tier: 'agency',
    name: 'Agency',
    priceMonthly: 199,
    renderMinutes: 2000,
    socialAccounts: 30,
    priceIdEnv: 'NEXT_PUBLIC_STRIPE_PRICE_AGENCY',
    features: [
      '2.000 Render-Minuten / Monat',
      '30 verbundene Kanäle',
      'Mehrere Workspaces',
      'Eigene Untertitel-Vorlagen',
    ],
  },
]

export function getPlan(tier: SubscriptionTier): Plan {
  return PLANS.find((plan) => plan.tier === tier) ?? PLANS[0]
}
