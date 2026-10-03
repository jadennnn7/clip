import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthenticatedUser } from '@/services/publishing/auth'

/**
 * Rate-Limits für Routen, die pro Aufruf Geld kosten (KI-Anfragen).
 *
 * Gezählt wird in der Datenbank (`take_rate_limit`, Migration
 * `20260930200000_rate_limits.sql`), damit das Limit über alle
 * Serverless-Instanzen gilt. Fehlt die Datenbank oder die Migration, zählt
 * ersatzweise jede Instanz für sich — schwächer, aber nie ohne Grenze.
 */

export interface RateLimitRule {
  /** Name des Zählers, z. B. `assistant:10m`. */
  bucket: string
  limit: number
  windowSeconds: number
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number; message: string }

const memory = new Map<string, { windowStart: number; hits: number }>()
let warned = false

function takeInMemory(key: string, rule: RateLimitRule): boolean {
  const windowStart = Math.floor(Date.now() / 1000 / rule.windowSeconds) * rule.windowSeconds
  const id = `${key}:${rule.bucket}`
  const entry = memory.get(id)
  const hits = entry && entry.windowStart === windowStart ? entry.hits + 1 : 1
  memory.set(id, { windowStart, hits })
  // Die Map bleibt klein: alte Fenster fliegen beim Überlaufen raus.
  if (memory.size > 10_000) {
    for (const [candidate, value] of memory) if (value.windowStart < windowStart) memory.delete(candidate)
  }
  return hits <= rule.limit
}

async function takeInDatabase(userId: string, rule: RateLimitRule): Promise<boolean | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  const { data, error } = await createAdminClient().rpc('take_rate_limit', {
    p_user_id: userId, p_bucket: rule.bucket, p_limit: rule.limit, p_window_seconds: rule.windowSeconds,
  })
  if (error || typeof data !== 'boolean') {
    if (!warned) {
      warned = true
      console.warn('[rate-limit] Datenbank-Zähler nicht verfügbar, zähle pro Instanz. Migration: supabase/migrations/20260930200000_rate_limits.sql', error?.code)
    }
    return null
  }
  return data
}

function secondsUntilNextWindow(rule: RateLimitRule): number {
  const now = Date.now() / 1000
  return Math.max(1, Math.ceil(Math.floor(now / rule.windowSeconds) * rule.windowSeconds + rule.windowSeconds - now))
}

/**
 * Zählt einen Aufruf gegen alle Regeln. `key` ist die Nutzer-ID; ohne
 * Anmeldung (Demo-Modus) die IP — dann nur im Speicher.
 */
export async function takeRateLimit(key: { userId: string } | { ip: string }, rules: RateLimitRule[]): Promise<RateLimitResult> {
  for (const rule of rules) {
    const allowed = 'userId' in key
      ? (await takeInDatabase(key.userId, rule)) ?? takeInMemory(key.userId, rule)
      : takeInMemory(`ip:${key.ip}`, rule)
    if (!allowed) {
      const retryAfterSeconds = secondsUntilNextWindow(rule)
      const wait = retryAfterSeconds > 3600
        ? 'morgen wieder'
        : `in ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} ${Math.ceil(retryAfterSeconds / 60) === 1 ? 'Minute' : 'Minuten'} wieder`
      return { ok: false, retryAfterSeconds, message: `Zu viele Anfragen in kurzer Zeit. Das geht ${wait}.` }
    }
  }
  return { ok: true }
}

export function rateLimitResponse(result: Extract<RateLimitResult, { ok: false }>): Response {
  return Response.json({ error: result.message }, {
    status: 429,
    headers: { 'Retry-After': String(result.retryAfterSeconds), 'Cache-Control': 'no-store' },
  })
}

/** Die erste Adresse aus `x-forwarded-for` — für den Demo-Modus ohne Konto. */
export function requestIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

/**
 * Wer zählt: das angemeldete Konto. Nur ohne eingerichtete Anmeldung
 * (Demo-Modus) die IP. Ohne Session wirft es mit Status 401.
 */
export async function rateLimitKey(request: Request): Promise<{ userId: string } | { ip: string }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return { ip: requestIp(request) }
  return { userId: (await getAuthenticatedUser()).id }
}
