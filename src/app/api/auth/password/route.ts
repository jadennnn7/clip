import { z } from 'zod'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/auth-password'
import { requestOrigin } from '@/lib/request-origin'
import { authLimitOf, authLimitResponse } from '@/lib/server/auth-limits'
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
  // Neues Passwort nach „Passwort vergessen?" — mit der Session aus dem Link.
  z.object({
    intent: z.literal('update'),
    password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  }).strict(),
  // Passwort ändern im Konto — nur mit dem aktuellen.
  z.object({
    intent: z.literal('change'),
    currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
    password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  }).strict(),
])

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Sitzungen aus dem Link zum Zurücksetzen tragen `recovery` im `amr`-Claim.
 * Nur sie dürfen ein Passwort ohne das alte setzen, und nur eine Stunde lang —
 * sonst reichte eine gestohlene Sitzung, um den Besitzer auszusperren.
 */
const RESET_METHODS = new Set(['recovery', 'otp', 'magiclink'])
const RESET_WINDOW_SECONDS = 60 * 60

async function cameFromResetLink(supabase: Supabase): Promise<boolean> {
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data) return false
  const now = Date.now() / 1000
  const amr = (data.claims.amr ?? []) as Array<string | { method: string; timestamp: number }>
  return amr.some((entry) => typeof entry !== 'string' && RESET_METHODS.has(entry.method) && now - entry.timestamp < RESET_WINDOW_SECONDS)
}

async function setPassword(supabase: Supabase, password: string): Promise<Response> {
  const { error } = await supabase.auth.updateUser({ password })
  if (!error) return json({ signedIn: true })
  if (error.code === 'weak_password') {
    throw new PublishingApiError(400, 'Dieses Passwort ist zu leicht zu erraten. Nimm ein längeres oder eines mit Zahlen und Sonderzeichen.')
  }
  if (error.code === 'same_password') {
    throw new PublishingApiError(400, 'Das ist dein bisheriges Passwort. Wähle ein neues.')
  }
  throw new PublishingApiError(502, 'Das Passwort konnte nicht gespeichert werden. Bitte versuche es erneut.')
}

/**
 * Registrieren, Anmelden, neues Passwort festlegen und Passwort ändern.
 *
 * Läuft über den Server, damit die Session-Cookies gleich auf der Antwort
 * stehen. Ist in Supabase „Confirm email" aus, liefert die Registrierung
 * sofort eine Session — der Nutzer ist ohne Mail angemeldet. Ist es an, gibt
 * es noch keine Session, sondern einen Bestätigungslink, der über
 * `/auth/callback` eingelöst wird. Einen Anmeldelink ohne Passwort gibt es
 * nicht.
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
      const limit = authLimitOf(error)
      if (limit) return authLimitResponse(limit, 'login')
      if (error.code === 'email_not_confirmed') {
        throw new PublishingApiError(403, 'Bitte bestätige zuerst deine E-Mail-Adresse. Den Link findest du in deinem Postfach.')
      }
      if (error.code === 'invalid_credentials' || error.status === 400) {
        // Konten aus der Zeit vor dem Passwort haben keines — sie legen eins
        // über „Passwort vergessen?" fest.
        throw new PublishingApiError(401, 'E-Mail oder Passwort stimmt nicht. Noch kein Passwort? Leg über „Passwort vergessen?" eins fest.')
      }
      throw new PublishingApiError(502, 'Die Anmeldung hat nicht geklappt. Bitte versuche es erneut.')
    }

    if (input.intent === 'update') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !(await cameFromResetLink(supabase))) {
        throw new PublishingApiError(401, 'Der Link ist abgelaufen. Fordere über „Passwort vergessen?" einen neuen an.')
      }
      return await setPassword(supabase, input.password)
    }

    if (input.intent === 'change') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new PublishingApiError(401, 'Bitte melde dich an.')
      // Erst das aktuelle Passwort prüfen — eine offene Sitzung allein reicht nicht.
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: input.currentPassword })
      if (error) {
        const limit = authLimitOf(error)
        if (limit) return authLimitResponse(limit, 'login')
        if (error.code === 'invalid_credentials' || error.status === 400) {
          throw new PublishingApiError(401, 'Das aktuelle Passwort stimmt nicht.')
        }
        throw new PublishingApiError(502, 'Das Passwort ließ sich nicht prüfen. Bitte versuche es erneut.')
      }
      return await setPassword(supabase, input.password)
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
      // Die Registrierung verschickt eine Bestätigungsmail — sie hängt am Mail-Limit.
      const limit = authLimitOf(error)
      if (limit) return authLimitResponse(limit, 'signup')
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
