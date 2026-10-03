import { createAdminClient } from '@/lib/supabase/admin'
import { assertSameOrigin, getAuthenticatedUser, PublishingApiError, publishingErrorResponse } from '@/services/publishing/auth'
import { getPublishingSetupNotice } from '@/services/publishing/config'
import { listAccounts } from '@/services/publishing/accounts'
import { manualPublishSchema, publishClipManually } from '@/services/publishing/manual'

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser()
    const setupNotice = getPublishingSetupNotice()
    if (setupNotice) return Response.json(
      { jobs: [], configured: false, error: setupNotice },
      { headers: { 'Cache-Control': 'no-store' } },
    )
    const sourceJobId = new URL(request.url).searchParams.get('source_job_id')
    if (sourceJobId && !/^(run_[a-z0-9]+|[0-9a-f-]{36})$/i.test(sourceJobId)) {
      throw new PublishingApiError(400, 'Ungültiges Projekt.')
    }
    let query = createAdminClient().from('publishing_jobs')
      // Checkpoints contain upload session URLs: never expose them to the UI.
      .select('id,source_job_id,clip_index,account_id,title,status,publish_at,render_key,last_error,platform_post_id,platform_post_url,attempt_count,next_retry_at,created_at,updated_at,clip,review_required')
      .eq('user_id', user.id).order('created_at', { ascending: false })
    query = sourceJobId ? query.eq('source_job_id', sourceJobId).limit(1000) : query.limit(200)
    const { data, error } = await query
    if (error) {
      if (error.code === 'PGRST205' || /could not find the table|schema cache/i.test(error.message)) {
        throw new PublishingApiError(
          503,
          'Das Datenbankschema fehlt noch. Bitte supabase/schema.sql (oder die Migrationen) in deinem Supabase-Projekt ausführen.',
        )
      }
      throw new PublishingApiError(502, 'Die Veröffentlichungs-Queue konnte nicht geladen werden.')
    }
    const accounts = await listAccounts(user.id)
    const jobs = (data ?? []).map(({ clip, ...job }) => {
      const account = accounts.find((value) => value.id === job.account_id)
      return { ...job, platform: account?.platform, account_username: account?.platform_username,
        clip_id: clip.id ?? null, virality_score: clip.virality_score ?? null,
        clip_start_seconds: clip.start_seconds, clip_end_seconds: clip.end_seconds,
        caption: [clip.description, (clip.hashtags ?? []).join(' ')].filter(Boolean).join('\n\n') }
    })
    return Response.json({ jobs, configured: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return publishingErrorResponse(error) }
}

/** Veröffentlichen oder Einplanen aus der Clip-Vorschau (siehe `services/publishing/manual.ts`). */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    const user = await getAuthenticatedUser()
    const setupNotice = getPublishingSetupNotice()
    if (setupNotice) throw new PublishingApiError(503, setupNotice)
    const parsed = manualPublishSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new PublishingApiError(400, 'Der Clip konnte nicht eingeplant werden: ungültige Angaben.')
    const result = await publishClipManually(user.id, parsed.data)
    return Response.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return publishingErrorResponse(error) }
}
