import 'server-only'

import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDownloadUrl, getPublicUrl, uploadFile } from '@/lib/storage/r2'
import { buildCompositionProps } from '@/lib/composition-props'
import { getServeUrl, renderClipVideo } from '@/services/render/remotion'
import { consumeExport, CreditError, needsWatermark } from '@/services/billing/credits'
import { getProvider, PublishError, backoffMs, MAX_PUBLISH_ATTEMPTS } from '@/services/social'
import type { PublishingJob } from '@/types/publishing'
import { getPublishingAccount } from './accounts'
import { getPublishingCapabilities } from './config'
import { publishingReviewReason } from './policy'

class LostClaim extends Error {}

/** Called by a durable worker, never by browser polling or a serverless tail. */
export async function processPublishingJob(jobId: string, signal?: AbortSignal): Promise<void> {
  const db = createAdminClient()
  const claimToken = randomUUID()
  const { data, error } = await db.rpc('claim_publishing_job', { p_id: jobId, p_claim_token: claimToken, p_lease_seconds: 3900 })
  if (error) throw new Error('Veröffentlichungsauftrag konnte nicht reserviert werden.')
  const job = (Array.isArray(data) ? data[0] : data) as PublishingJob | null
  if (!job?.id) return

  const save = async (patch: Partial<PublishingJob>) => {
    if (signal?.aborted) throw new LostClaim('Worker wurde beendet.')
    const { data: saved, error: saveError } = await db.from('publishing_jobs').update(patch)
      .eq('id', job.id).eq('claim_token', claimToken).in('status', ['rendering', 'publishing'])
      .gt('lease_until', new Date().toISOString()).select('id').maybeSingle()
    if (saveError) throw new Error('Veröffentlichungsstatus konnte nicht gespeichert werden.')
    if (!saved) throw new LostClaim('Auftrag wurde inzwischen verändert.')
    Object.assign(job, patch)
  }
  const finish = (patch: Partial<PublishingJob>) => save({ ...patch, lease_until: null, claim_token: null })
  let directory: string | undefined
  let providerStarted = false
  try {
    // Validate ownership, account state, and tokens before spending render time.
    const initial = await getPublishingAccount(job.user_id, job.account_id)
    if (initial.account.status !== 'active') throw new PublishError('Bitte verbinde diesen Kanal erneut.', 'auth')
    // Freigabe-Clips bleiben unangetastet, bis jemand auf „Veröffentlichen"
    // klickt — kein Render, kein Upload. Die Freigabe setzt `review_required`
    // zurück, erst dann läuft dieser Auftrag weiter.
    if (job.review_required) {
      const capability = getPublishingCapabilities()[initial.account.platform]
      await finish({ status: 'needs_review',
        last_error: publishingReviewReason(job.clip, initial.account, capability.canAutoPublish, capability.notice)
          ?? 'Dieser Clip wartet auf deine Freigabe. Prüfe ihn und bestätige die Veröffentlichung.',
        next_retry_at: null, attempt_count: 0 })
      return
    }
    if (!job.render_key) {
      // Im Gratis-Test ist auch ein veröffentlichter Clip ein Export. Die
      // Auftrags-ID als Referenz: Ein erneuter Versuch zählt nicht doppelt.
      await consumeExport(job.user_id, `publish:${job.id}`).catch((error) => {
        throw error instanceof CreditError && error.status === 402 ? new PublishError(error.message, 'terminal') : error
      })
      directory = await mkdtemp(path.join(os.tmpdir(), 'omegaclip-publish-'))
      const output = path.join(directory, 'clip.mp4')
      await renderClipVideo({
        serveUrl: await getServeUrl(path.join(os.tmpdir(), 'omegaclip-cache')),
        inputProps: buildCompositionProps({
          clip: job.clip, removedWords: [], videoSrc: await getDownloadUrl(job.proxy_key, 6 * 3600),
          sourceWidth: job.source_width, sourceHeight: job.source_height,
          watermark: await needsWatermark(job.user_id),
        }),
        outputFormat: job.output_format, outputPath: output, signal,
      })
      const key = `publishing/${job.user_id}/${job.id}/clip.mp4`
      await uploadFile(key, output, 'video/mp4')
      await save({ render_key: key })
    }
    // Re-read after rendering: disconnection or consent changes take effect.
    const { account, credentials } = await getPublishingAccount(job.user_id, job.account_id)
    if (account.status !== 'active') throw new PublishError('Bitte verbinde diesen Kanal erneut.', 'auth')
    const capability = getPublishingCapabilities()[account.platform]
    // approved_at survives account mode changes; automatic jobs require current opt-in.
    if (!job.checkpoint.approved_at && (account.automation_mode !== 'auto_publish' || !capability.canAutoPublish)) {
      await finish({ status: 'needs_review', review_required: true, attempt_count: 0,
        last_error: 'Die Automatik für diesen Kanal ist pausiert. Bitte prüfe und bestätige den Clip.' })
      return
    }
    const provider = getProvider(account.platform)
    const limit = await provider.getPublishingLimit(credentials)
    if (limit.remaining <= 0) throw new PublishError('Das Veröffentlichungslimit ist erreicht. Der Auftrag wird später erneut versucht.', 'quota')
    await save({ status: 'publishing' })
    const videoUrl = account.platform === 'youtube'
      ? await getDownloadUrl(job.render_key!, 6 * 3600) : getPublicUrl(job.render_key!)
    providerStarted = true
    const result = await provider.publish({
      account: credentials, videoUrl, title: job.clip.title,
      description: job.clip.description, hashtags: job.clip.hashtags,
      idempotencyKey: job.id, checkpoint: job.checkpoint,
      saveCheckpoint: (checkpoint) => save({ checkpoint: { ...job.checkpoint, ...checkpoint } }),
    })
    await finish({
      status: result.requiresManualStep ? 'action_required' : 'published',
      platform_post_id: result.platformPostId, platform_post_url: result.platformPostUrl,
      last_error: result.manualStepReason ?? null, next_retry_at: null,
    })
    await db.from('social_accounts').update({
      ...(result.requiresManualStep ? {} : { last_published_at: new Date().toISOString() }), last_error: null,
    }).eq('id', job.account_id).eq('user_id', job.user_id)
  } catch (cause) {
    if (cause instanceof LostClaim || signal?.aborted) return
    const kind = cause instanceof PublishError ? cause.kind : providerStarted ? 'uncertain' : 'retryable'
    const message = cause instanceof PublishError ? cause.message :
      providerStarted ? 'Der Plattformstatus ist unklar. Bitte prüfe den Kanal; es wird kein neuer Upload gestartet.' : 'Render oder Verbindung fehlgeschlagen. Der Auftrag kann erneut versucht werden.'
    if (kind === 'auth') {
      await db.from('social_accounts').update({ status: 'needs_reauth', last_error: message })
        .eq('id', job.account_id).eq('user_id', job.user_id).neq('status', 'revoked')
    }
    const retry = ['retryable', 'quota'].includes(kind) && job.attempt_count < MAX_PUBLISH_ATTEMPTS
    await finish({
      status: kind === 'uncertain' ? 'action_required' : retry ? (job.review_required ? 'needs_review' : 'pending') : 'failed',
      last_error: message,
      next_retry_at: retry ? new Date(Date.now() + (kind === 'quota' ? 24 * 3600 * 1000 : backoffMs(job.attempt_count))).toISOString() : null,
    })
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true })
  }
}
