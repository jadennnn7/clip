/**
 * Partnerprogramm.
 *
 * Jedes Konto hat einen eigenen Link (`/?ref=<code>`). Wer darüber kommt und
 * ein Konto anlegt, gehört zum Partner — solange er noch nie ein Abo hatte.
 * Von jeder Zahlung des geworbenen Kontos bekommt der Partner `rate` des
 * Nettobetrags, `months` lang ab der ersten Zahlung.
 *
 * Wie bei den Credits stehen die Zahlen nur hier: Der Stripe-Webhook übergibt
 * Satz, Laufzeit und Wartezeit an `record_partner_commission`. Eine Änderung
 * gilt für Zahlungen ab dann; schon gebuchte Provisionen behalten ihren Satz.
 *
 * Bewusst 20 % für 12 Monate und nicht 30 % dauerhaft: Jede Minute kostet
 * Transkription, KI, Render und bei YouTube-Links den Proxy — bei Business-
 * und Jahrestarifen bliebe mit mehr Provision kaum Marge.
 */
export const PARTNER = {
  /** Anteil am Nettobetrag (ohne Umsatzsteuer) jeder Zahlung. */
  rate: 0.2,
  /** So lange ab der ersten Zahlung des geworbenen Kontos. */
  months: 12,
  /** So lange nach dem Klick auf den Link zählt eine Anmeldung noch. */
  cookieDays: 30,
  /**
   * Wartezeit, bevor eine Provision auszahlbar wird: 14 Tage Widerruf plus
   * Luft für Erstattungen. Rückbuchungen danach verrechnen sich mit der
   * nächsten Auszahlung.
   */
  holdDays: 30,
  /** Ausgezahlt wird ab diesem Betrag — kleinere Überweisungen lohnen nicht. */
  minPayoutCents: 5000,
} as const

export const REFERRAL_PARAM = 'ref'
export const REFERRAL_COOKIE = 'ocuris_ref'

/**
 * Umsatzsteuer, die in den Preisen steckt, wenn Stripe selbst keine ausweist.
 * Die Preise sind mit „Steuer inklusive" angelegt (siehe `plans.ts`); ohne
 * Stripe Tax kennt Stripe nur den Bruttobetrag.
 */
const INCLUDED_VAT = 0.19

/** Kleinbuchstaben und Ziffern; generierte Codes haben 8 Zeichen, eigene dürfen kürzer oder länger sein. */
export function normalizePartnerCode(value: string | null | undefined): string | null {
  const code = value?.trim().toLowerCase() ?? ''
  return /^[a-z0-9]{4,32}$/.test(code) ? code : null
}

export function partnerLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/?${REFERRAL_PARAM}=${code}`
}

/**
 * Nettoanteil eines gezahlten Betrags in Cent. Rechnet Stripe die Steuer
 * selbst (Stripe Tax), gilt deren Anteil an dieser Rechnung — auch 0 % bei
 * Reverse Charge. Sonst steckt die deutsche Umsatzsteuer im Preis.
 */
export function netCents({ paid, total, tax, taxComputed }: {
  paid: number
  total: number
  tax: number
  taxComputed: boolean
}): number {
  if (!(paid > 0) || !(total > 0)) return 0
  const share = taxComputed ? Math.max(0, total - tax) / total : 1 / (1 + INCLUDED_VAT)
  return Math.max(0, Math.round(paid * share))
}
