import { z } from 'zod'
import { requestOrigin } from '@/lib/request-origin'
import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, PublishingApiError, publishingErrorResponse } from '@/services/publishing/auth'

const AuthRequest = z.object({
  email: z.email().max(254),
  intent: z.enum(['login', 'signup']).default('login'),
  fullName: z.string().trim().min(1).max(80).optional(),
}).strict()

export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new PublishingApiError(503, 'Die Anmeldung ist noch nicht eingerichtet. Bitte konfiguriere Supabase auf dem Server.')
    }
    const parsed = AuthRequest.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new PublishingApiError(400, 'Bitte gib eine gültige E-Mail-Adresse ein.')

    const { email, intent, fullName } = parsed.data
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Den tatsächlichen Request-Origin verwenden — damit zeigt der Magic
        // Link immer auf die URL, über die der Nutzer gerade zugreift.
        emailRedirectTo: `${requestOrigin(request)}/auth/callback`,
        shouldCreateUser: intent === 'signup',
        ...(intent === 'signup' && fullName
          ? { data: { full_name: fullName } }
          : {}),
      },
    })

    if (error) {
      if (error.status === 429) {
        throw new PublishingApiError(429, 'Zu viele Anfragen. Bitte warte etwas und versuche es erneut.')
      }
      // Login ohne bestehendes Konto (shouldCreateUser: false)
      if (intent === 'login' && /signups? not allowed|user not found|unable to validate/i.test(error.message)) {
        throw new PublishingApiError(404, 'Kein Konto mit dieser E-Mail. Bitte zuerst registrieren.')
      }
      throw new PublishingApiError(502, intent === 'signup'
        ? 'Der Registrierungslink konnte nicht versendet werden. Bitte versuche es erneut.'
        : 'Der Anmeldelink konnte nicht versendet werden. Bitte versuche es erneut.')
    }

    return Response.json({ sent: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return publishingErrorResponse(error)
  }
}
