import { describeAiFailure, hasAiProvider } from '@/services/ai/analyze'
import { suggestHookTitles } from '@/services/ai/hook-title'
import { assertSameOrigin, PublishingApiError } from '@/services/publishing/auth'
import { rateLimitKey, rateLimitResponse, takeRateLimit } from '@/services/rate-limit'

/** Jeder Vorschlag ist ein KI-Aufruf. */
const LIMITS = [
  { bucket: 'hook-title:10m', limit: 30, windowSeconds: 600 },
  { bucket: 'hook-title:day', limit: 300, windowSeconds: 86_400 },
]

/**
 * Hook-Titel-Vorschläge für einen Clip.
 *
 * Der Browser schickt nur den Wortlaut des Clips — Clips liegen im lokalen
 * Workspace, der Server kennt sie nicht.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
  } catch (cause) {
    if (cause instanceof PublishingApiError) return error(cause.status, cause.message)
    throw cause
  }
  const body = (await request.json().catch(() => null)) as { transcript?: unknown; title?: unknown } | null
  const transcript = typeof body?.transcript === 'string' ? body.transcript.replace(/\s+/g, ' ').trim().slice(0, 8000) : ''
  if (transcript.length < 20) return error(400, 'Der Clip enthält zu wenig gesprochenen Text für einen Hook-Titel.')
  if (!hasAiProvider()) return error(503, 'KI-Vorschläge brauchen einen KI-Schlüssel (GEMINI_API_KEY oder AI_FALLBACK_API_KEY).')

  try {
    const limited = await takeRateLimit(await rateLimitKey(request), LIMITS)
    if (!limited.ok) return rateLimitResponse(limited)
  } catch (cause) {
    if (cause instanceof PublishingApiError) return error(cause.status, cause.message)
    throw cause
  }

  try {
    const titles = await suggestHookTitles({
      transcript,
      title: typeof body?.title === 'string' ? body.title.slice(0, 200) : undefined,
      signal: request.signal,
    })
    if (titles.length === 0) return error(502, 'Die KI hat keinen brauchbaren Titel geliefert. Bitte erneut versuchen.')
    return Response.json({ titles })
  } catch (cause) {
    if (request.signal.aborted) return error(499, 'Abgebrochen.')
    console.error('[hook-title] Vorschläge fehlgeschlagen', cause)
    return error(502, describeAiFailure(cause))
  }
}

function error(status: number, message: string) {
  return Response.json({ error: message }, { status })
}
