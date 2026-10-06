import 'server-only'

import type { AuthError } from '@supabase/supabase-js'

/**
 * Supabase meldet drei verschiedene Grenzen alle als HTTP 429 — für den
 * Nutzer heißen sie aber Verschiedenes:
 *
 * - `cooldown`: An diese Adresse ging gerade erst eine Mail. Nach einer
 *   Minute geht es wieder; der Link von eben gilt.
 * - `email`: Das ganze Projekt hat sein Mail-Kontingent verbraucht. Mit dem
 *   eingebauten Versand von Supabase sind das nur wenige Mails pro Stunde —
 *   die Lösung ist ein eigener SMTP-Server (docs/production-setup.md,
 *   Schritt 5). Bis dahin kommt man mit Passwort oder Google trotzdem hinein.
 * - `requests`: Zu viele Versuche von diesem Netz in kurzer Zeit.
 */
export type AuthLimit =
  | { kind: 'cooldown'; seconds: number }
  | { kind: 'email' }
  | { kind: 'requests' }

export function authLimitOf(error: AuthError): AuthLimit | null {
  if (error.status !== 429) return null
  // „For security purposes, you can only request this after 47 seconds."
  const seconds = /after (\d+) seconds?/i.exec(error.message)?.[1]
  if (seconds) return { kind: 'cooldown', seconds: Math.max(1, Number(seconds)) }
  if (error.code === 'over_email_send_rate_limit' || /email rate limit/i.test(error.message)) return { kind: 'email' }
  return { kind: 'requests' }
}

/** Was ausgelöst hat: Link zum Zurücksetzen, Registrierung (Bestätigungsmail) oder Passwort-Anmeldung. */
type Context = 'reset' | 'signup' | 'login'

export function authLimitResponse(limit: AuthLimit, context: Context): Response {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
  if (limit.kind === 'cooldown') {
    headers['Retry-After'] = String(limit.seconds)
    return Response.json({
      error: `An diese Adresse ist gerade erst eine Mail rausgegangen — schau in dein Postfach, auch im Spam. Eine neue kannst du in ${limit.seconds} Sekunden anfordern.`,
      reason: 'cooldown',
      retryAfter: limit.seconds,
    }, { status: 429, headers })
  }
  if (limit.kind === 'email') {
    // Für den Betreiber: Ohne eigenen SMTP-Server ist das der Normalfall, nicht die Ausnahme.
    console.error('[auth] Supabase-Mailversand am Limit — eigener SMTP-Server fehlt (docs/production-setup.md, Schritt 5)', { context })
    return Response.json({
      error: context === 'signup'
        ? 'Bestätigungs-Mails sind gerade ausgelastet. Mit Google klappt die Registrierung sofort — oder versuch es in ein paar Minuten erneut.'
        : 'Mails sind gerade ausgelastet. Versuch es in ein paar Minuten erneut.',
      reason: 'email_limit',
    }, { status: 429, headers })
  }
  return Response.json({
    error: context === 'login'
      ? 'Zu viele Anmeldeversuche in kurzer Zeit. Warte eine Minute und versuch es dann erneut.'
      : 'Zu viele Anfragen in kurzer Zeit. Warte eine Minute und versuch es dann erneut.',
    reason: 'requests',
  }, { status: 429, headers })
}
