import { z } from 'zod'
import { requestOrigin } from '@/lib/request-origin'
import { authLimitOf, authLimitResponse } from '@/lib/server/auth-limits'
import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, PublishingApiError, publishingErrorResponse } from '@/services/publishing/auth'

const MailRequest = z.object({
  email: z.email().max(254),
  kind: z.enum(['reset', 'confirm']),
}).strict()

/**
 * Die beiden Mails, die es rund um die Anmeldung noch gibt.
 *
 * Angemeldet wird nur mit E-Mail und Passwort oder mit Google — einen
 * Anmeldelink ohne Passwort gibt es nicht. Mails gehen nur noch hinaus, wenn
 * man sie braucht:
 *
 * - `reset`: Passwort vergessen. Der Link führt über `/auth/reset` auf
 *   `/new-password`, wo man ein neues festlegt.
 * - `confirm`: Die Bestätigungsmail der Registrierung erneut — nur nötig,
 *   solange in Supabase „Confirm email" an ist.
 *
 * Ob es zur Adresse ein Konto gibt, verrät die Antwort nicht: Supabase
 * schickt bei unbekannter Adresse einfach nichts.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new PublishingApiError(503, 'Die Anmeldung ist noch nicht eingerichtet. Bitte konfiguriere Supabase auf dem Server.')
    }
    const parsed = MailRequest.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new PublishingApiError(400, 'Bitte gib eine gültige E-Mail-Adresse ein.')

    const { email, kind } = parsed.data
    const origin = requestOrigin(request)
    const supabase = await createClient()
    const { error } = kind === 'reset'
      ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/reset` })
      : await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${origin}/auth/callback` } })

    if (error) {
      const limit = authLimitOf(error)
      if (limit) return authLimitResponse(limit, kind === 'reset' ? 'reset' : 'signup')
      throw new PublishingApiError(502, kind === 'reset'
        ? 'Der Link zum Zurücksetzen konnte nicht versendet werden. Bitte versuche es erneut.'
        : 'Die Bestätigungsmail konnte nicht versendet werden. Bitte versuche es erneut.')
    }

    return Response.json({ sent: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return publishingErrorResponse(error)
  }
}
