import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, PublishingApiError, publishingErrorResponse } from '@/services/publishing/auth'

/**
 * Meldet dieses Gerät ab. Andere Geräte bleiben angemeldet (`scope: 'local'`).
 *
 * Bewusst ein Route Handler statt einer Server Action: Eine Action, die
 * Cookies ändert, rendert die aktuelle Seite neu — ohne Session also das
 * Dashboard, das dabei selbst zur Anmeldung umleitet. Hier gibt es nur eine
 * Antwort, und der Browser lädt danach die Anmeldeseite komplett neu, damit
 * nichts vom bisherigen Konto im Speicher des Tabs bleibt.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new PublishingApiError(503, 'Im Demo-Modus gibt es keine Anmeldung, von der man sich abmelden könnte.')
    }
    const supabase = await createClient()
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    // Bei einem Netzwerkfehler behält Supabase die Session — dann ist man
    // weiterhin angemeldet, und genau das muss die Oberfläche sagen.
    if (error) throw new PublishingApiError(502, 'Die Abmeldung hat nicht geklappt. Bitte versuche es erneut.')
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return publishingErrorResponse(error)
  }
}
