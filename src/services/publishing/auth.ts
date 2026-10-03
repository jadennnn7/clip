import 'server-only'

import { requestOrigin } from '@/lib/request-origin'
import { createClient } from '@/lib/supabase/server'
import { publishingAppOrigin } from './config'

export class PublishingApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'PublishingApiError'
  }
}

/** Never falls back to the demo workspace identity. */
export async function getAuthenticatedUser(): Promise<{ id: string }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new PublishingApiError(503, 'Publishing benötigt eine eingerichtete Anmeldung. Im Demo-Modus werden keine Konten verbunden oder Clips veröffentlicht.')
  }
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new PublishingApiError(401, 'Bitte melde dich an, um deine Kanäle zu verwalten.')
  return { id: user.id }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite === 'cross-site') throw new PublishingApiError(403, 'Diese Anfrage muss aus OmegaClip kommen.')

  // Erlaube den konfigurierten App-Origin (NEXT_PUBLIC_APP_URL) ODER den
  // tatsächlichen Request-Origin (z.B. localhost im lokalen Dev-Server).
  const allowedOrigins = new Set<string>([requestOrigin(request), new URL(request.url).origin])
  try { allowedOrigins.add(publishingAppOrigin()) } catch { /* keine konfigurierte URL */ }

  if (!origin || !allowedOrigins.has(origin)) {
    throw new PublishingApiError(403, 'Diese Anfrage muss aus OmegaClip kommen.')
  }
}

/** Do not return provider bodies, tokens, or database errors to the browser. */
export function publishingErrorResponse(error: unknown): Response {
  const status = error instanceof PublishingApiError ? error.status : 500
  const message = error instanceof PublishingApiError ? error.message : 'Die Publishing-Anfrage konnte nicht abgeschlossen werden. Bitte versuche es erneut.'
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}
