import type { SubscriptionTier } from '@/types/database'

/**
 * Tarife und Credits.
 *
 * 1 Credit = 1 Minute analysiertes Ausgangsvideo. Ein 60-Minuten-Podcast
 * kostet 60 Credits; die Clips, die daraus entstehen, sind enthalten, ebenso
 * Bearbeitung und Exporte. Bezahlt wird also die Menge Material, die jemand
 * verarbeiten lässt — nicht, wie viele Clips er behält oder wie lange der
 * Render dauert.
 *
 * Alle Beträge sind Endkundenpreise inklusive Umsatzsteuer. Die Stripe-Preise
 * müssen deshalb mit „Steuer inklusive" angelegt sein.
 *
 * Die Datenbank hält die Kontingente nicht selbst fest: Der Stripe-Webhook
 * übergibt `credits` beim Abo-Wechsel an `apply_subscription`, das
 * Export-Limit geht als Parameter an `consume_trial_export`. Nur
 * `TRIAL.credits` steht zusätzlich als Standardwert der Spalte
 * `profiles.plan_credits` — ändert es sich, braucht die Spalte eine Migration.
 */

export type BillingInterval = 'month' | 'year'

export interface Plan {
  tier: SubscriptionTier
  name: string
  /** Für wen der Tarif gedacht ist — eine Zeile unter dem Namen. */
  audience: string
  priceMonthly: number
  /**
   * Jahrespreis, einmal im Jahr abgerechnet. Credits gibt es trotzdem
   * monatlich (`settle_credit_cycles` schreibt sie über die ganze Periode
   * gut), sonst wäre der Übertrag-Deckel sinnlos.
   */
  priceYearly: number
  /** Credits pro Monat; im Gratis-Test einmalig. */
  credits: number
  socialAccounts: number
  /** Server-Umgebungsvariable mit der Stripe-Preis-ID. */
  priceEnv: string | null
  yearlyPriceEnv: string | null
}

/**
 * Der Gratis-Test: einmalig. Zwei Stunden Video, damit auch eine ganze
 * Podcastfolge hineinpasst — wer sein erstes Video nicht verarbeiten kann,
 * sieht nie einen Clip. Die Exporte begrenzen, was der Test im Render kostet.
 */
export const TRIAL = { credits: 120, exports: 3 } as const

/*
 * Jahrespreise: rund 20 % unter zwölf Monatsbeiträgen, auf glatte
 * Monatsbeträge gerundet (15 / 31 / 79 €). Jeder Tarif spart mindestens
 * 20 %, „20 % sparen" stimmt also überall.
 *
 * Warum nicht 40–50 % wie OpusClip, Vizard oder Submagic: Deren Monatspreis
 * ist ein aufgeblasener Anker, der eigentliche Preis ist der Jahrespreis.
 * Unsere Monatspreise sind schon knapp kalkuliert, und jede Minute kostet
 * Transkription, KI und Render — bei 50 % hätte der Business-Tarif kaum
 * noch Marge, und Credit-Pakete wären fast viermal so teuer wie Abo-Credits.
 * Weniger als „2 Monate geschenkt" (16,7 %) wäre dagegen kein Grund zu
 * wechseln.
 */
export const PLANS: Plan[] = [
  {
    tier: 'free',
    name: 'Free',
    audience: 'Einmal ausprobieren, ohne Kreditkarte.',
    priceMonthly: 0,
    priceYearly: 0,
    credits: TRIAL.credits,
    socialAccounts: 1,
    priceEnv: null,
    yearlyPriceEnv: null,
  },
  {
    tier: 'starter',
    name: 'Starter',
    audience: 'Für gelegentliche Creator.',
    priceMonthly: 19,
    priceYearly: 180,
    credits: 150,
    socialAccounts: 3,
    priceEnv: 'STRIPE_PRICE_STARTER_MONTHLY',
    yearlyPriceEnv: 'STRIPE_PRICE_STARTER_YEARLY',
  },
  {
    tier: 'pro',
    name: 'Creator',
    audience: 'Für Creator, die regelmäßig veröffentlichen.',
    priceMonthly: 39,
    priceYearly: 372,
    credits: 450,
    socialAccounts: 9,
    priceEnv: 'STRIPE_PRICE_CREATOR_MONTHLY',
    yearlyPriceEnv: 'STRIPE_PRICE_CREATOR_YEARLY',
  },
  {
    tier: 'agency',
    name: 'Business',
    audience: 'Für mehrere Marken oder Kunden.',
    priceMonthly: 99,
    priceYearly: 948,
    credits: 1200,
    socialAccounts: 30,
    priceEnv: 'STRIPE_PRICE_BUSINESS_MONTHLY',
    yearlyPriceEnv: 'STRIPE_PRICE_BUSINESS_YEARLY',
  },
]

/** Was ein Jahrestarif umgerechnet im Monat kostet. */
export function yearlyPerMonth(plan: Plan): number {
  return plan.priceYearly / 12
}

/** Die kleinste Ersparnis über alle Tarife, abgerundet — so stimmt die Zahl für jeden. */
export const YEARLY_SAVING_PERCENT = Math.floor(
  Math.min(
    ...PLANS.filter((plan) => plan.priceMonthly > 0).map((plan) => (1 - plan.priceYearly / (plan.priceMonthly * 12)) * 100),
  ),
)

/**
 * Laufzeit des Jahrestarifs. Nach dem ersten Jahr läuft das Abo monatlich
 * weiter statt sich um ein Jahr zu verlängern — bei Verbrauchern darf eine
 * stillschweigende Verlängerung nur noch auf unbestimmte Zeit mit
 * monatlicher Kündigung erfolgen (§ 309 Nr. 9 BGB). Siehe Stripe-Webhook,
 * `invoice.upcoming`.
 */
export const YEARLY_TERM_NOTE = '12 Monate Laufzeit, danach monatlich kündbar.'

export function priceEnvFor(plan: Plan, interval: BillingInterval): string | null {
  return interval === 'year' ? plan.yearlyPriceEnv : plan.priceEnv
}

/** Das Hauptangebot, das Landing-Page und Aufladen-Dialog hervorheben. */
export const FEATURED_TIER: SubscriptionTier = 'pro'

/**
 * Was jeder Tarif kann, auch der Gratis-Test. Nichts davon hängt am Tarif —
 * die Tarife unterscheiden sich in Credits und Kanälen, sonst nicht.
 */
export const INCLUDED_EVERYWHERE = [
  'Clips mit Score aus jedem Video',
  'Untertitel, Bildausschnitt, Titel und Hashtags',
  'Editor mit Schnitt im Transkript',
  'Freigabe-Queue oder Auto-Publish',
]

/**
 * Nicht verbrauchte Abo-Credits wandern mit, aber höchstens ein
 * Monatskontingent. Nachgekaufte Credits verfallen nicht.
 */
export const ROLLOVER_NOTE = 'Ungenutzte Credits wandern in den nächsten Monat mit, bis zu einem Monatskontingent.'

/**
 * Nachkauf, nur zusätzlich zu einem Abo. Pro Minute teurer als jeder Tarif,
 * damit bei regelmäßigem Mehrbedarf der größere Tarif die bessere Wahl bleibt.
 */
export interface CreditPack {
  id: string
  credits: number
  price: number
  priceEnv: string
  label: string
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'credits_100', credits: 100, price: 15, priceEnv: 'STRIPE_PRICE_CREDITS_100', label: '100 Credits' },
  { id: 'credits_300', credits: 300, price: 42, priceEnv: 'STRIPE_PRICE_CREDITS_300', label: '300 Credits' },
  { id: 'credits_600', credits: 600, price: 79, priceEnv: 'STRIPE_PRICE_CREDITS_600', label: '600 Credits' },
]

export function getPlan(tier: SubscriptionTier): Plan {
  return PLANS.find((plan) => plan.tier === tier) ?? PLANS[0]
}

/**
 * Credits für ein Video dieser Länge. Angefangene Minuten zählen voll — mit
 * einer Sekunde Kulanz, damit ein Video von 60,4 s nicht zwei Credits kostet.
 */
export function creditsForSeconds(seconds: number): number {
  return Math.max(1, Math.ceil((seconds - 1) / 60))
}

const decimal = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
const whole = new Intl.NumberFormat('de-DE')

/** „2,5 Stunden", „30 Minuten" — wie viel Video eine Credit-Menge verarbeitet. */
export function videoTimeFor(credits: number): string {
  if (credits < 60) return `${whole.format(Math.floor(credits))} Minuten`
  const hours = credits / 60
  return `${decimal.format(hours)} ${hours === 1 ? 'Stunde' : 'Stunden'}`
}

/** Die Eckdaten eines Tarifs als kurze Zeilen — für Abo-Seite, Registrierung und Assistent. */
export function planFacts(plan: Plan): string[] {
  const channels = `${plan.socialAccounts} ${plan.socialAccounts === 1 ? 'verbundener Kanal' : 'verbundene Kanäle'}`
  if (plan.priceEnv === null) {
    return [
      `${whole.format(plan.credits)} Credits einmalig (${videoTimeFor(plan.credits)} Video)`,
      `${TRIAL.exports} Exporte`,
      channels,
    ]
  }
  return [
    `${whole.format(plan.credits)} Credits pro Monat (${videoTimeFor(plan.credits)} Video)`,
    'Exporte inklusive',
    channels,
  ]
}
