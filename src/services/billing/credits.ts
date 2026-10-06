import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCredits } from '@/lib/credit-format'
import { creditsForSeconds, TRIAL } from '@/lib/stripe/plans'
import { UserFacingError } from '@/services/video/source'
import type { SubscriptionTier } from '@/types/database'

/**
 * Credits: 1 Credit = 1 Minute analysiertes Ausgangsvideo.
 *
 * Gebucht wird in der Datenbank (`charge_clip_tokens`, `consume_trial_export`),
 * atomar und je Referenz genau einmal. Dieser Dienst rechnet Sekunden in
 * Credits um und übersetzt die Antworten in Meldungen für den Nutzer.
 */

const SETUP_ERROR = 'Das Credit-System ist noch nicht vollständig eingerichtet. Bitte die Datenbank-Einrichtung abschließen.'
const CHECK_ERROR = 'Das Guthaben konnte nicht geprüft werden. Bitte später erneut versuchen.'
const NO_PROFILE = 'Dein Credit-Konto wurde noch nicht eingerichtet. Bitte die Datenbank-Einrichtung abschließen.'

export class CreditError extends UserFacingError {
  constructor(message: string, readonly status: 402 | 503 = 503) {
    super(message)
  }
}

function databaseFailure(error: { code?: string; message?: string } | null, operation: string): never {
  console.error(`[credits] ${operation}`, { code: error?.code, message: error?.message })
  if (error?.code === 'P0002') throw new CreditError(NO_PROFILE)
  const missingSchema = ['PGRST202', 'PGRST205', '42P01', '42883', '42703'].includes(error?.code ?? '')
  throw new CreditError(missingSchema ? SETUP_ERROR : CHECK_ERROR)
}

function billingClient(): SupabaseClient {
  try { return createAdminClient() } catch { throw new CreditError(SETUP_ERROR) }
}

/**
 * Admins (`ADMIN_EMAILS`, durch Komma getrennt) testen ohne Grenzen: Ihr
 * Guthaben wird weder geprüft noch belastet, Exporte sind unbegrenzt. Das
 * Wasserzeichen bekommen sie dagegen immer, auch mit Abo — so sehen sie
 * Vorschau und Export so, wie Gratis-Nutzer sie bekommen.
 * Erkannt an der E-Mail aus Supabase Auth — die im Profil kann der Nutzer
 * selbst ändern.
 */
async function isAdmin(userId: string, db: SupabaseClient): Promise<boolean> {
  const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean)
  if (admins.length === 0) return false
  const { data, error } = await db.auth.admin.getUserById(userId)
  if (error) return false
  const email = data.user?.email?.trim().toLowerCase()
  return Boolean(email && admins.includes(email))
}

export interface CreditBalance {
  tier: SubscriptionTier
  /** Abo-Guthaben inklusive Gratis-Test; verfällt über die Übertrag-Grenze. */
  planCredits: number
  /** Nachgekaufte Credits; verfallen nicht. */
  packCredits: number
  available: number
  /** Kontingent des aktiven Abos, 0 ohne Abo. */
  monthlyCredits: number
  /** Wann das nächste Monatskontingent fällig ist; null ohne Abo. */
  nextGrantAt: string | null
  /** Verbleibende Gratis-Exporte, null wenn Exporte nicht begrenzt sind. */
  trialExportsLeft: number | null
  /** Clips tragen das Ocuris-Wasserzeichen: ohne aktives Abo, bei Admins immer. */
  watermark: boolean
}

const TIERS: readonly SubscriptionTier[] = ['free', 'starter', 'pro', 'agency']

/** Holt fällige Monatskontingente nach und liest dann das Guthaben. */
export async function readCreditBalance(userId: string, db = billingClient()): Promise<CreditBalance> {
  const { data, error } = await db.rpc('credit_balance', { p_user_id: userId })
  if (error) databaseFailure(error, 'Guthaben lesen')
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  if (!row) throw new CreditError(NO_PROFILE)

  const number = (value: unknown) => {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }
  const planCredits = number(row.plan_credits)
  const packCredits = number(row.pack_credits)
  const monthlyCredits = number(row.monthly_credits)
  const exportsUsed = number(row.trial_exports_used)
  const tier = row.tier as SubscriptionTier
  if (planCredits === null || packCredits === null || monthlyCredits === null || exportsUsed === null
    || !TIERS.includes(tier) || typeof row.on_trial !== 'boolean') {
    databaseFailure(null, 'Ungültiges Credit-Konto')
  }
  const admin = await isAdmin(userId, db)
  return {
    tier,
    planCredits,
    packCredits,
    available: planCredits + packCredits,
    monthlyCredits,
    nextGrantAt: typeof row.next_grant_at === 'string' ? row.next_grant_at : null,
    trialExportsLeft: row.on_trial && !admin ? Math.max(0, TRIAL.exports - exportsUsed) : null,
    // Nachgekaufte Credits allein machen keinen Tarif — nur ein laufendes Abo.
    // Admins immer: Sie sollen beim Testen sehen, was Gratis-Nutzer bekommen.
    watermark: admin || monthlyCredits === 0,
  }
}

/**
 * Ob die Clips dieses Kontos das Wasserzeichen tragen. Render und
 * Auto-Publish fragen hier, nicht beim Browser: Die Props, die der Player
 * schickt, entscheiden darüber nicht.
 */
export async function needsWatermark(userId: string, db = billingClient()): Promise<boolean> {
  return (await readCreditBalance(userId, db)).watermark
}

function outOfCredits(balance: CreditBalance): string {
  return balance.monthlyCredits > 0
    ? 'Dein Guthaben ist aufgebraucht. Kauf Credits nach oder wechsle in einen größeren Tarif.'
    : 'Dein Guthaben ist aufgebraucht. Mit einem Tarif bekommst du jeden Monat neue Credits.'
}

/**
 * Bricht vor Download und Analyse ab, wenn das Guthaben nicht reicht. Ohne
 * bekannte Länge (Google Drive meldet sie erst nach dem Download) genügt
 * ein Credit; die genaue Prüfung folgt, sobald die Länge feststeht.
 */
export async function assertCreditsAvailable(userId: string, durationSeconds?: number | null, db = billingClient()) {
  if (await isAdmin(userId, db)) return
  const balance = await readCreditBalance(userId, db)
  const known = typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0
  const needed = known ? creditsForSeconds(durationSeconds) : 1
  if (balance.available >= needed) return
  if (!known || balance.available < 1) throw new CreditError(outOfCredits(balance), 402)
  throw new CreditError(
    `Dieses Video braucht ${formatCredits(needed)} Credits (1 Credit pro Minute), verfügbar sind ${formatCredits(balance.available)}. ` +
    (balance.monthlyCredits > 0 ? 'Kauf Credits nach oder wähle ein kürzeres Video.' : 'Wähle einen Tarif oder ein kürzeres Video.'),
    402,
  )
}

/**
 * Bucht die Quellminuten eines fertigen Jobs ab — erst nach Erfolg, damit
 * ein fehlgeschlagener Download oder eine gescheiterte Analyse nichts kostet.
 * Die Datenbank bucht je Job genau einmal.
 */
export async function chargeSourceCredits(userId: string, jobId: string, durationSeconds: number, db = billingClient()) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new CreditError('Die Videolänge für die Abrechnung ist ungültig.')
  if (await isAdmin(userId, db)) return
  const credits = creditsForSeconds(durationSeconds)
  const { data, error } = await db.rpc('charge_clip_tokens', {
    p_user_id: userId,
    p_tokens: credits,
    p_reference: `clip:${jobId}`,
  })
  // An RPC error can be an ambiguous network result. Never attempt a second,
  // non-idempotent profile update as a fallback: it can charge twice.
  if (error) databaseFailure(error, 'Credits abbuchen')
  if (data === true) return
  if (data !== false) databaseFailure(null, 'Ungültige Abbuchungsantwort')
  const balance = await readCreditBalance(userId, db)
  throw new CreditError(`Dieses Video braucht ${formatCredits(credits)} Credits, verfügbar sind ${formatCredits(balance.available)}.`, 402)
}

/**
 * Zählt einen Export im Gratis-Test; mit Abo sind Exporte frei. Dieselbe
 * Referenz zählt nur einmal — ein erneuter Versuch desselben Exports kostet
 * nichts.
 */
export async function consumeExport(userId: string, reference: string, db = billingClient()) {
  if (await isAdmin(userId, db)) return
  const { data, error } = await db.rpc('consume_trial_export', {
    p_user_id: userId,
    p_reference: reference,
    p_limit: TRIAL.exports,
  })
  if (error) databaseFailure(error, 'Export zählen')
  if (data === true) return
  if (data !== false) databaseFailure(null, 'Ungültige Export-Antwort')
  throw new CreditError(`Deine ${TRIAL.exports} Gratis-Exporte sind aufgebraucht. In jedem Tarif sind Exporte inklusive.`, 402)
}
