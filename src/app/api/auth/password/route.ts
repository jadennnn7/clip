import { z } from 'zod'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/auth-password'
import { requestOrigin } from '@/lib/request-origin'
import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, PublishingApiError, publishingErrorResponse } from '@/services/publishing/auth'

const PasswordRequest = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('signup'),
    email: z.email().max(254),
    password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
    fullName: z.string().trim().min(1).max(80),
  }).strict(),
  z.object({
    intent: z.literal('login'),
    email: z.email().max(254),
    password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  }).strict(),
])

/**
 * Registrieren und Anmelden mit E-Mail und Passwort.
 *
 * Läuft über den Server, damit die Session-Cookies gleich auf der Antwort
 * stehen. Das Projekt verlangt eine bestätigte E-Mail-Adresse: Nach der
 * Registrierung gibt es noch keine Session, sondern einen Bestätigungslink,
 * der über `/auth/callback` einlöst wird — dieselbe Strecke wie der
 * Anmeldelink.
 *
 * Antwort: `{ signedIn: true }` (weiter ins Dashboard) oder
 * `{ confirm: true }` (Postfach prüfen).
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new PublishingApiError(503, 'Die Anmeldung ist noch nicht eingerichtet. Bitte konfiguriere Supabase auf dem Server.')
    }
    const parsed = PasswordRequest.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      throw new PublishingApiError(400, `Bitte prüfe deine Eingaben. Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`)
    }
    const input = parsed.data
    const supabase = await createClient()

    if (input.intent === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password })
      if (!error) return json({ signedIn: true })
      if (error.status === 429) throw new PublishingApiError(429, 'Zu viele Versuche. Bitte warte etwas und versuche es erneut.')
      if (error.code === 'email_not_confirmed') {
        throw new PublishingApiError(403, 'Bitte bestätige zuerst deine E-Mail-Adresse. Den Link findest du in deinem Postfach.')
      }
      if (error.code === 'invalid_credentials' || error.status === 400) {
        // Konten aus der Zeit vor dem Passwort haben keines — für sie ist der
        // Anmeldelink der Weg hinein.
        throw new PublishingApiError(401, 'E-Mail oder Passwort stimmt nicht. Noch kein Passwort? Melde dich per Anmeldelink an.')
      }
      throw new PublishingApiError(502, 'Die Anmeldung hat nicht geklappt. Bitte versuche es erneut.')
    }

    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: `${requestOrigin(request)}/auth/callback`,
        data: { full_name: input.fullName },
      },
    })
    if (error) {
      if (error.status === 429) throw new PublishingApiError(429, 'Zu viele Anfragen. Bitte warte etwas und versuche es erneut.')
      if (error.code === 'weak_password') {
        throw new PublishingApiError(400, 'Dieses Passwort ist zu leicht zu erraten. Nimm ein längeres oder eines mit Zahlen und Sonderzeichen.')
      }
      if (error.code === 'user_already_exists' || error.code === 'email_exists') {
        throw new PublishingApiError(409, 'Mit dieser E-Mail gibt es schon ein Konto. Melde dich an.')
      }
      throw new PublishingApiError(502, 'Die Registrierung hat nicht geklappt. Bitte versuche es erneut.')
    }
    // Bei verlangter Bestätigung meldet Supabase eine schon vergebene Adresse
    // nicht als Fehler, sondern als Nutzer ohne Identitäten.
    if (data.user && data.user.identities?.length === 0) {
      throw new PublishingApiError(409, 'Mit dieser E-Mail gibt es schon ein Konto. Melde dich an.')
    }
    return json(data.session ? { signedIn: true } : { confirm: true })
  } catch (error) {
    return publishingErrorResponse(error)
  }
}

function json(body: Record<string, boolean>) {
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
