import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthenticatedUser, assertSameOrigin, PublishingApiError, publishingErrorResponse } from '@/services/publishing/auth'
import { canTransitionJob } from '@/services/publishing/policy'
import { dispatchPublishingJob } from '@/services/publishing/jobs'
import type { PublishingJob } from '@/types/publishing'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request)
    const { id } = await params
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new PublishingApiError(404, 'Auftrag nicht gefunden.')
    const user = await getAuthenticatedUser()
    const body = await request.json().catch(() => null)
    const action = body?.action
    if (action !== 'approve' && action !== 'retry' && action !== 'cancel') throw new PublishingApiError(400, 'Ungültige Aktion.')
    const db = createAdminClient()
    const { data, error } = await db.from('publishing_jobs').select('*').eq('id', id).eq('user_id', user.id).maybeSingle()
    if (error) throw new Error('Queue unavailable')
    const job = data as PublishingJob | null
    if (!job) throw new PublishingApiError(404, 'Auftrag nicht gefunden.')
    if (!canTransitionJob(job.status, action)) {
      throw new PublishingApiError(409, 'Diese Aktion ist im aktuellen Status nicht möglich. Bitte aktualisiere die Warteschlange.')
    }
    if (action !== 'cancel') {
      const { data: account } = await db.from('social_accounts').select('status').eq('id', job.account_id).eq('user_id', user.id).maybeSingle()
      if (account?.status !== 'active') throw new PublishingApiError(409, 'Bitte verbinde den Kanal zuerst erneut.')
    }
    const now = new Date().toISOString()
    const patch = action === 'cancel' ? { status: 'cancelled' } : {
      status: job.review_required && action === 'retry' ? 'needs_review' : 'pending',
      review_required: action === 'approve' ? false : job.review_required,
      checkpoint: action === 'approve' ? { ...job.checkpoint, approved_at: now } : job.checkpoint,
      attempt_count: 0, next_retry_at: null, last_error: null,
      // Die Freigabe ist der Befehl „jetzt veröffentlichen" — ein Klick, der
      // erst in acht Stunden wirkt, sähe aus wie ein Fehler. Ein erneuter
      // Versuch behält dagegen seinen künftigen Slot.
      publish_at: action === 'approve' ? now : new Date(Math.max(Date.now(), Date.parse(job.publish_at))).toISOString(),
    }
    const { data: updated, error: updateError } = await db.from('publishing_jobs').update(patch)
      .eq('id', id).eq('user_id', user.id).eq('status', job.status).eq('updated_at', job.updated_at)
      .select('id,account_id,attempt_count,updated_at').maybeSingle()
    if (updateError) throw new Error('Queue update failed')
    if (!updated) throw new PublishingApiError(409, 'Der Auftrag wurde inzwischen verändert. Bitte aktualisiere die Warteschlange.')
    // The DB is the outbox: a dispatch outage is recovered by the sweep.
    if (action !== 'cancel') await dispatchPublishingJob(updated).catch(() => undefined)
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return publishingErrorResponse(error) }
}
