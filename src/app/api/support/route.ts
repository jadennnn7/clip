import { z } from 'zod'
import { ASSISTANT_MESSAGE_MAX_LENGTH } from '@/lib/assistant'
import { SUPPORT_MESSAGE_MAX_LENGTH, SUPPORT_TRANSCRIPT_LIMIT } from '@/lib/support'
import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, PublishingApiError } from '@/services/publishing/auth'
import { rateLimitResponse, takeRateLimit } from '@/services/rate-limit'
import { createSupportRequest, SupportError } from '@/services/support/requests'

/** Genug für ein echtes Anliegen und einen Nachtrag, zu wenig, um das Postfach zu fluten. */
const LIMITS = [
  { bucket: 'support:hour', limit: 3, windowSeconds: 3600 },
  { bucket: 'support:day', limit: 8, windowSeconds: 86_400 },
]

const SupportRequest = z.object({
  message: z.string().trim().min(1).max(SUPPORT_MESSAGE_MAX_LENGTH),
  transcript: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    text: z.string().trim().min(1).max(ASSISTANT_MESSAGE_MAX_LENGTH * 2),
  })).max(SUPPORT_TRANSCRIPT_LIMIT).default([]),
  page: z.string().max(200).regex(/^\/[\w\-/]*$/).optional(),
})

/**
 * Nachricht an das Team aus dem Hilfe-Widget. Absender ist immer das
 * angemeldete Konto — die Antwort geht an dessen E-Mail-Adresse, nicht an
 * eine, die der Browser nennt.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
  } catch (cause) {
    if (cause instanceof PublishingApiError) return error(cause.status, cause.message)
    throw cause
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return error(503, 'Im Demo-Modus ohne Konto lässt sich keine Nachricht senden.')
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return error(401, 'Bitte melde dich an, um uns zu schreiben.')
  const email = user.email?.trim()
  if (!email) return error(400, 'In deinem Konto ist keine E-Mail-Adresse hinterlegt, an die wir antworten könnten.')

  const parsed = SupportRequest.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return error(400, 'Die Nachricht konnte nicht gelesen werden.')

  const limited = await takeRateLimit({ userId: user.id }, LIMITS)
  if (!limited.ok) return rateLimitResponse(limited)

  const fullName = user.user_metadata?.full_name
  try {
    await createSupportRequest({
      userId: user.id,
      email,
      name: typeof fullName === 'string' && fullName.trim() ? fullName.trim() : null,
      message: parsed.data.message,
      transcript: parsed.data.transcript,
      page: parsed.data.page ?? null,
    })
    return Response.json({ email }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    if (cause instanceof SupportError) return error(503, cause.message)
    console.error('[support] fehlgeschlagen', cause)
    return error(500, 'Deine Nachricht konnte nicht gesendet werden. Bitte versuch es gleich noch einmal.')
  }
}

function error(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}
