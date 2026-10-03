import 'server-only'

import { tasks } from '@trigger.dev/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { pipelineClipId } from '@/lib/pipeline-clip-id'
import { segmentToClip } from '@/lib/pipeline-clips'
import type { PipelinePublishingSummary, PipelineResult } from '@/types/pipeline'
import type { OutputFormat } from '@/types/workspace'
import type { PublishingJob } from '@/types/publishing'
import { listAccounts } from './accounts'
import { accountsWithinLimit, channelLimit } from './limits'
import { getPublishingCapabilities } from './config'
import { initialPublishingStatus, publishingReviewReason, publishTime } from './policy'

export interface PublishingTargets { userId: string; accountIds: string[] }

/** Database uniqueness is permanent; Trigger idempotency alone has a retention limit. */
export async function enqueueGeneratedClips(input: {
  targets: PublishingTargets
  sourceJobId: string
  result: PipelineResult
  proxyKey: string
  outputFormat: OutputFormat
}): Promise<PipelinePublishingSummary> {
  const { targets, result } = input
  // Der Tarif kann sich seit dem Start des Imports geändert haben.
  const [allAccounts, limit] = await Promise.all([listAccounts(targets.userId), channelLimit(targets.userId)])
  const accounts = accountsWithinLimit(allAccounts, limit).filter((account) => targets.accountIds.includes(account.id))
  const capabilities = getPublishingCapabilities()
  const now = new Date()
  const ranked = result.segments.map((segment, index) => ({ segment, index })).sort((a, b) => b.segment.virality_score - a.segment.virality_score)
  // Dieselben IDs wie die Clips im Workspace: So findet die Oberfläche zu
  // jedem Queue-Eintrag den Clip.
  const clipIds = await Promise.all(ranked.map(({ index }) => pipelineClipId(targets.userId, input.sourceJobId, index)))
  const rows = ranked.flatMap(({ segment, index }, rank) => {
    const clip = segmentToClip(segment, input.sourceJobId, now.toISOString(), result, clipIds[rank], targets.userId)
    return accounts.flatMap((account) => {
      const capability = capabilities[account.platform]
      if (!capability.configured) return []
      const status = initialPublishingStatus(clip, account, capability.canAutoPublish)
      if (!status) return []
      return [{
        user_id: targets.userId, source_job_id: input.sourceJobId, clip_index: index,
        account_id: account.id, clip, source_width: result.width, source_height: result.height,
        proxy_key: input.proxyKey, output_format: input.outputFormat, title: clip.title,
        status, review_required: status === 'needs_review', publish_at: publishTime(rank, now),
        last_error: status === 'needs_review' ? publishingReviewReason(clip, account, capability.canAutoPublish, capability.notice) : null,
      }]
    })
  })
  const skippedCount = result.segments.length * targets.accountIds.length - rows.length
  const automaticCount = rows.filter((row) => !row.review_required).length
  const summary: PipelinePublishingSummary = {
    queuedCount: rows.length,
    automaticCount,
    reviewCount: rows.length - automaticCount,
    notice: skippedCount > 0
      ? `${skippedCount} ${skippedCount === 1 ? 'Veröffentlichung wurde' : 'Veröffentlichungen wurden'} nicht eingeplant, weil ein Kanal inzwischen getrennt, pausiert, nicht mehr eingerichtet oder nicht mehr in deinem Tarif enthalten ist. Prüfe deine Kanäle.`
      : null,
  }
  if (!rows.length) return summary
  const db = createAdminClient()
  const { error } = await db.from('publishing_jobs').upsert(rows, {
    onConflict: 'user_id,source_job_id,clip_index,account_id', ignoreDuplicates: true,
  })
  if (error) throw new Error('Veröffentlichungen konnten nicht gespeichert werden.')
  // Failure to dispatch never discards durable rows: the scheduled worker repairs it.
  await dispatchDuePublishingJobs(targets.userId).catch(() => undefined)
  return summary
}

export async function dispatchPublishingJob(job: Pick<PublishingJob, 'id' | 'account_id' | 'attempt_count' | 'updated_at'>): Promise<void> {
  await tasks.trigger('publish-clip', { jobId: job.id }, {
    idempotencyKey: `publishing:${job.id}:${job.attempt_count}:${job.updated_at}`,
    concurrencyKey: job.account_id,
  })
}

export async function dispatchDuePublishingJobs(userId?: string): Promise<number> {
  const db = createAdminClient()
  const now = new Date().toISOString()
  // A hard-killed worker gets at most five recovery runs. Ambiguous external
  // state needs reconciliation by a human, never an automatic fresh upload.
  let expired = db.from('publishing_jobs').update({
    status: 'action_required', last_error: 'Der Auftrag wurde wiederholt unterbrochen. Bitte prüfe den Kanal, bevor du erneut veröffentlichst.',
    claim_token: null, lease_until: null,
  }).in('status', ['rendering', 'publishing']).lte('lease_until', now).gte('attempt_count', 5)
  if (userId) expired = expired.eq('user_id', userId)
  const { error: recoveryError } = await expired
  if (recoveryError) throw new Error('Unterbrochene Veröffentlichungen konnten nicht geprüft werden.')
  // `needs_review` fehlt hier absichtlich: Freigabe-Clips startet nur der
  // Klick auf „Veröffentlichen" (PATCH /api/publishing/[id]), nie die Queue.
  let query = db.from('publishing_jobs').select('id,account_id,attempt_count,updated_at')
    .or(`and(status.eq.pending,publish_at.lte.${now},or(next_retry_at.is.null,next_retry_at.lte.${now})),and(status.in.(rendering,publishing),lease_until.lte.${now})`)
    .lt('attempt_count', 5).order('publish_at').limit(100)
  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query
  if (error) throw new Error('Veröffentlichungen konnten nicht geladen werden.')
  const results = await Promise.allSettled((data ?? []).map(dispatchPublishingJob))
  if (results.some((result) => result.status === 'rejected')) throw new Error('Einige Aufträge konnten nicht gestartet werden. Die Warteschlange versucht es erneut.')
  return results.length
}

/** Diese Aufträge haben die Plattform noch nicht erreicht und lassen sich stoppen. */
const STOPPABLE_STATUSES = ['needs_review', 'pending', 'failed']
/**
 * Hier läuft ein Render oder Upload. Ein fortgesetzter Upload beginnt wieder
 * bei `rendering` — mitten darin abzubrechen hinterließe einen halben Post,
 * wie beim Trennen eines Kanals (`disconnect_social_account`).
 */
const IN_FLIGHT_STATUSES = ['rendering', 'publishing']

/** Ohne Service-Role-Key oder Tabelle gibt es keine Aufträge — also nichts zu stoppen. */
function hasPublishingQueue(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function isMissingQueue(error: { code?: string; message: string }): boolean {
  return error.code === 'PGRST205' || /could not find the table|schema cache/i.test(error.message)
}

/**
 * Ob gerade ein Clip dieses Videos gerendert oder hochgeladen wird. Ohne
 * Video: irgendeiner des Kontos — das braucht die Kontolöschung.
 */
export async function hasInFlightPublishing(userId: string, sourceJobId?: string): Promise<boolean> {
  if (!hasPublishingQueue()) return false
  let query = createAdminClient().from('publishing_jobs').select('id')
    .eq('user_id', userId).in('status', IN_FLIGHT_STATUSES)
  if (sourceJobId !== undefined) query = query.eq('source_job_id', sourceJobId)
  const { data, error } = await query.limit(1)
  if (error) {
    if (isMissingQueue(error)) return false
    throw new Error('Laufende Veröffentlichungen konnten nicht geprüft werden.')
  }
  return (data?.length ?? 0) > 0
}

/** Stoppt alle Veröffentlichungen eines Videos (ohne Video: des Kontos), die noch nicht begonnen haben. */
export async function cancelPendingPublishing(userId: string, sourceJobId?: string): Promise<void> {
  if (!hasPublishingQueue()) return
  let query = createAdminClient().from('publishing_jobs').update({
    status: 'cancelled', claim_token: null, lease_until: null, next_retry_at: null,
    last_error: sourceJobId === undefined ? 'Gestoppt, weil das Konto gelöscht wird.' : 'Gestoppt, weil das Video gelöscht wird.',
  }).eq('user_id', userId).in('status', STOPPABLE_STATUSES)
  if (sourceJobId !== undefined) query = query.eq('source_job_id', sourceJobId)
  const { error } = await query
  if (error && !isMissingQueue(error)) throw new Error('Geplante Veröffentlichungen konnten nicht gestoppt werden.')
}
