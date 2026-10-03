import { z } from 'zod'
import { ASSISTANT_HISTORY_LIMIT, ASSISTANT_MESSAGE_MAX_LENGTH } from '@/lib/assistant'
import { describeAiFailure, hasAiProvider } from '@/services/ai/analyze'
import { answerSupportQuestion } from '@/services/ai/assistant'
import { assertSameOrigin, PublishingApiError } from '@/services/publishing/auth'
import { rateLimitKey, rateLimitResponse, takeRateLimit } from '@/services/rate-limit'

/** Jede Frage ist ein KI-Aufruf: genug für ein Gespräch, zu wenig für Missbrauch. */
const LIMITS = [
  { bucket: 'assistant:10m', limit: 20, windowSeconds: 600 },
  { bucket: 'assistant:day', limit: 150, windowSeconds: 86_400 },
]

const AssistantRequest = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    text: z.string().trim().min(1).max(ASSISTANT_MESSAGE_MAX_LENGTH * 2),
  })).min(1).max(40),
  page: z.string().max(200).regex(/^\/[\w\-/]*$/).optional(),
})

/**
 * Antwort des Hilfe-Assistenten. Der Verlauf lebt im Browser; der Server
 * bekommt nur die letzten Nachrichten und hält keinen Zustand.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
  } catch (cause) {
    if (cause instanceof PublishingApiError) return error(cause.status, cause.message)
    throw cause
  }

  const parsed = AssistantRequest.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return error(400, 'Die Frage konnte nicht gelesen werden.')
  const messages = parsed.data.messages.slice(-ASSISTANT_HISTORY_LIMIT)
  if (messages.at(-1)?.role !== 'user') return error(400, 'Es fehlt eine Frage.')
  if (!hasAiProvider()) return error(503, 'Der Assistent braucht einen KI-Schlüssel (GEMINI_API_KEY oder AI_FALLBACK_API_KEY).')

  try {
    const limited = await takeRateLimit(await rateLimitKey(request), LIMITS)
    if (!limited.ok) return rateLimitResponse(limited)
  } catch (cause) {
    if (cause instanceof PublishingApiError) return error(cause.status, cause.message)
    throw cause
  }

  try {
    const result = await answerSupportQuestion({
      messages: messages.map((message) => ({ ...message, text: message.text.slice(0, ASSISTANT_MESSAGE_MAX_LENGTH) })),
      page: parsed.data.page,
      signal: request.signal,
    })
    if (!result.answer) return error(502, 'Der Assistent hat gerade keine Antwort. Bitte frag noch einmal.')
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    if (request.signal.aborted) return error(499, 'Abgebrochen.')
    console.error('[assistant] Antwort fehlgeschlagen', cause)
    return error(502, describeAiFailure(cause))
  }
}

function error(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}
