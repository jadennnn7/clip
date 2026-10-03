import { classifyLink } from '@/lib/links'
import { startPipeline } from '@/services/pipeline'
import { UserFacingError } from '@/services/video/source'
import type { StartPipelineResponse } from '@/types/pipeline'
import { DEFAULT_PROJECT_SETTINGS, type ProjectSettings } from '@/types/workspace'
import { getAuthenticatedUser, assertSameOrigin, publishingErrorResponse } from '@/services/publishing/auth'
import { getPublishingCapabilities, getPublishingSetupNotice } from '@/services/publishing/config'
import { listAccounts } from '@/services/publishing/accounts'
import { accountsWithinLimit, channelLimit } from '@/services/publishing/limits'
import { buildPublishingPlan } from '@/services/publishing/plan'
import { assertCreditsAvailable, CreditError } from '@/services/billing/credits'

/**
 * Startet die Verarbeitung eines Links.
 *
 * Antwortet, sobald der Link geprüft und der Job eingereiht ist — der Rest
 * läuft im Hintergrund, der Browser fragt den Status über
 * `/api/pipeline/[jobId]` ab.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    url?: unknown
    rightsConfirmed?: unknown
    settings?: Partial<Record<keyof ProjectSettings, unknown>>
  } | null

  const link = typeof body?.url === 'string' ? classifyLink(body.url) : null
  if (!link) return error(400, 'Bitte einen gültigen HTTPS-Link von YouTube oder Google Drive einfügen.')

  // Das Schema erzwingt die Rechtebestätigung für Link-Quellen (siehe
  // `services/video/ingest.ts`); ohne sie wird nichts heruntergeladen.
  if (body?.rightsConfirmed !== true) return error(400, 'Bitte bestätige, dass du die Rechte an diesem Video hältst.')

  try {
    const hasAuth = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    let userId: string | undefined
    if (hasAuth) {
      try { assertSameOrigin(request); userId = (await getAuthenticatedUser()).id }
      catch (cause) { return publishingErrorResponse(cause) }
    }
    if (userId) await assertCreditsAvailable(userId)
    const setupNotice = getPublishingSetupNotice()
    // Nur die Kanäle, die der Tarif umfasst (siehe `services/publishing/limits.ts`).
    const accounts = userId && !setupNotice
      ? accountsWithinLimit(await listAccounts(userId), await channelLimit(userId)) : []
    const publishingPlan = buildPublishingPlan(accounts, getPublishingCapabilities(), setupNotice)
    const job = await startPipeline({
      url: link.url, source: link.source, settings: readSettings(body.settings), userId,
      publishingPlan,
      publishing: userId && publishingPlan.targets.length
        ? { userId, accountIds: publishingPlan.targets.map((target) => target.accountId) } : undefined,
    })
    const response: StartPipelineResponse = {
      jobId: job.id,
      title: job.title,
      source: job.source,
      durationSeconds: job.durationSeconds,
      thumbnailUrl: job.thumbnailUrl,
      publishing: publishingPlan,
    }
    return Response.json(response, { status: 202 })
  } catch (cause) {
    if (cause instanceof CreditError) return error(cause.status, cause.message)
    if (cause instanceof UserFacingError) return error(422, cause.message)
    console.error('[pipeline] Start fehlgeschlagen', cause)
    return error(500, 'Der Link konnte nicht verarbeitet werden. Bitte erneut versuchen.')
  }
}

function readSettings(input: Partial<Record<keyof ProjectSettings, unknown>> | undefined): ProjectSettings {
  const settings = { ...DEFAULT_PROJECT_SETTINGS }
  if (typeof input?.language === 'string' && /^(auto|[a-z]{2,3})$/.test(input.language)) settings.language = input.language
  if (input?.clipLength === 'auto' || input?.clipLength === 'short' || input?.clipLength === 'medium' || input?.clipLength === 'long') {
    settings.clipLength = input.clipLength
  }
  if (typeof input?.topic === 'string') settings.topic = input.topic.slice(0, 200)
  if (input?.aspectRatio === '9:16' || input?.aspectRatio === '1:1' || input?.aspectRatio === '16:9') settings.aspectRatio = input.aspectRatio
  return settings
}

function error(status: number, message: string) {
  return Response.json({ error: message }, { status })
}
