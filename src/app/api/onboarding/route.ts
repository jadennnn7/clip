import { ONBOARDING_METADATA_KEY } from '@/lib/onboarding'
import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, PublishingApiError, publishingErrorResponse } from '@/services/publishing/auth'

/**
 * Schließt die Erst-Einrichtung ab — beim „Fertig“ ebenso wie beim
 * Überspringen. Danach leitet der Proxy nicht mehr auf `/onboarding` um.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    // Demo-Modus ohne Supabase: Es gibt kein Konto, an dem der Abschluss
    // hängen könnte — und der Proxy leitet dort ohnehin nicht um.
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return Response.json({ completed: true }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new PublishingApiError(401, 'Bitte melde dich an.')

    // `data` wird mit den bestehenden Metadaten zusammengeführt, `full_name`
    // aus der Registrierung bleibt erhalten.
    const { error } = await supabase.auth.updateUser({
      data: { [ONBOARDING_METADATA_KEY]: new Date().toISOString() },
    })
    if (error) throw new PublishingApiError(502, 'Die Einrichtung konnte nicht gespeichert werden. Bitte versuche es erneut.')

    return Response.json({ completed: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return publishingErrorResponse(error)
  }
}
