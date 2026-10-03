import { createClient } from '@/lib/supabase/server'
import { deleteAccount } from '@/services/account/delete'
import { assertSameOrigin, PublishingApiError, publishingErrorResponse } from '@/services/publishing/auth'

/** Viele Videos heißen viele Läufe und Dateien — das Löschen darf dauern. */
export const maxDuration = 300

/**
 * Löscht das angemeldete Konto endgültig, siehe `services/account/delete.ts`.
 *
 * Der Body muss die E-Mail-Adresse des Kontos wiederholen. Gegen fremde
 * Seiten schützt schon die Origin-Prüfung; die Adresse stellt sicher, dass
 * ein Mensch bewusst dieses Konto gemeint hat und kein verirrter Aufruf.
 *
 * 204 heißt: Konto und Daten sind weg, die Cookies dieses Geräts gelöscht.
 * Jede andere Antwort heißt, dass das Konto noch besteht — ein zweiter
 * Versuch ist immer sicher.
 */
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new PublishingApiError(503, 'Im Demo-Modus gibt es kein Konto, das man löschen könnte.')
    }
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new PublishingApiError(401, 'Bitte melde dich an, um dein Konto zu löschen.')

    const body = await request.json().catch(() => null) as { confirm?: unknown } | null
    const confirm = typeof body?.confirm === 'string' ? body.confirm.trim().toLowerCase() : ''
    if (!user.email || confirm !== user.email.toLowerCase()) {
      throw new PublishingApiError(400, 'Die E-Mail-Adresse stimmt nicht mit deinem Konto überein.')
    }

    await deleteAccount(user.id)
    // Den Nutzer gibt es nicht mehr; Supabase räumt trotzdem die Cookies ab.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    console.info('[account] Konto gelöscht', user.id)
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof PublishingApiError) return publishingErrorResponse(error)
    console.error('[account] Löschen fehlgeschlagen', error)
    return publishingErrorResponse(new PublishingApiError(502, 'Dein Konto konnte nicht vollständig gelöscht werden. Es besteht noch, auch wenn ein Teil der Daten schon entfernt sein kann — bitte versuche es gleich erneut.'))
  }
}
