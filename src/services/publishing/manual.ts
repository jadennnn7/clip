import 'server-only'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { objectExists, workspaceKeys } from '@/lib/storage/r2'
import { readOwnedPipeline } from '@/services/pipeline/access'
import type { Clip } from '@/types/database'
import { listAccounts } from './accounts'
import { PublishingApiError } from './auth'
import { getPublishingCapabilities } from './config'
import { accountsWithinLimit, channelLimit, channelLimitMessage } from './limits'
import { dispatchDuePublishingJobs } from './jobs'
import { clipOutputDuration } from '@/lib/clip-export'
import { checkTikTokPost } from './tiktok'
import { tiktokPostSchema } from '@/lib/tiktok-post'

/**
 * Veröffentlichen aus der Clip-Vorschau: ein Klick auf „Veröffentlichen"
 * bzw. „Einplanen" legt pro gewähltem Kanal einen Auftrag in derselben Queue
 * an, die auch die Pipeline befüllt. Der Worker rendert den Clip so, wie er
 * gerade bearbeitet ist, und lädt ihn hoch.
 *
 * Der Klick selbst ist die Freigabe — der Nutzer hat den Clip vor sich und
 * wählt die Kanäle bewusst. Die Aufträge starten deshalb freigegeben, auch
 * auf Kanälen mit Freigabe-Queue.
 */

/**
 * Aufträge der Pipeline zählen die Segmente ab 0. Manuelle beginnen weit
 * dahinter, damit sie nie mit einem automatisch eingeplanten Clip desselben
 * Videos kollidieren.
 */
const MANUAL_CLIP_INDEX = 10_000

const clipSchema = z.object({
  id: z.guid(),
  title: z.string().trim().min(1).max(300),
  start_seconds: z.number().min(0).max(1e7),
  end_seconds: z.number().min(0).max(1e7),
  virality_score: z.number().min(0).max(100),
  analysis_source: z.enum(['ai', 'heuristic']).nullable().optional(),
  words: z.array(z.object({ word: z.string(), start: z.number(), end: z.number() }).loose()).max(50_000),
  caption_style: z.record(z.string(), z.unknown()),
  crop_keyframes: z.array(z.object({ frame: z.number(), x: z.number(), y: z.number(), scale: z.number() })).max(200_000),
  segments: z.array(z.object({ start: z.number(), end: z.number() })).max(10_000).nullable().optional(),
  overlays: z.array(z.record(z.string(), z.unknown())).max(1000).optional(),
  video_settings: z.record(z.string(), z.unknown()).nullable().optional(),
}).loose().refine((clip) => clip.end_seconds > clip.start_seconds, 'Ungültiger Ausschnitt')

export const manualPublishSchema = z.object({
  projectId: z.guid(),
  /** Pipeline-Job des Videos; `null` bei hochgeladenen Videos. */
  sourceJobId: z.string().regex(/^(run_[a-z0-9]+|[0-9a-f-]{36})$/i).nullable(),
  clip: clipSchema,
  removedWords: z.array(z.number().int().min(0)).max(50_000),
  outputFormat: z.enum(['9:16', '1:1', '16:9']),
  accountIds: z.array(z.guid()).min(1).max(30),
  /** `null` = sofort. */
  publishAt: z.iso.datetime({ offset: true }).nullable(),
  caption: z.string().max(2200),
  tiktokPosts: z.record(z.guid(), tiktokPostSchema).optional(),
})

export type ManualPublishInput = z.infer<typeof manualPublishSchema>

interface Source { sourceJobId: string; proxyKey: string; width: number; height: number }

async function resolveSource(userId: string, input: ManualPublishInput): Promise<Source> {
  const missing = new PublishingApiError(409, 'Das Video dieses Projekts liegt nicht im Cloud-Speicher. Importiere es erneut, um Clips daraus zu veröffentlichen.')
  if (input.sourceJobId) {
    const job = await readOwnedPipeline(input.sourceJobId)
    if (job.status !== 'ready' || !job.result) throw new PublishingApiError(409, 'Das Video wird noch verarbeitet. Veröffentliche den Clip, sobald es fertig ist.')
    const proxyKey = workspaceKeys.proxy(job.id)
    if (!await objectExists(proxyKey)) throw missing
    return { sourceJobId: job.id, proxyKey, width: job.result.width, height: job.result.height }
  }
  // Hochgeladene Videos: Das Projekt muss diesem Konto gehören — das prüft
  // die Datenbank per RLS —, und der Browser hat die Datei schon hochgeladen.
  const db = await createClient()
  const { data: project, error } = await db.from('projects').select('id,user_id,width,height,source_type')
    .eq('id', input.projectId).maybeSingle()
  if (error) throw new PublishingApiError(503, 'Das Projekt konnte nicht geprüft werden. Bitte versuche es erneut.')
  if (!project || project.user_id !== userId || project.source_type !== 'upload') throw new PublishingApiError(404, 'Projekt nicht gefunden.')
  const proxyKey = workspaceKeys.upload(input.projectId)
  if (!await objectExists(proxyKey)) throw missing
  return { sourceJobId: input.projectId, proxyKey, width: project.width || 1920, height: project.height || 1080 }
}

export async function publishClipManually(userId: string, input: ManualPublishInput): Promise<{ count: number }> {
  const publishAt = input.publishAt ? new Date(input.publishAt) : new Date()
  // Eine Minute Spielraum für die Uhr des Browsers.
  if (publishAt.getTime() < Date.now() - 60_000) throw new PublishingApiError(400, 'Der Zeitpunkt liegt in der Vergangenheit.')
  if (publishAt.getTime() > Date.now() + 365 * 24 * 3600 * 1000) throw new PublishingApiError(400, 'Bitte wähle einen Zeitpunkt innerhalb der nächsten zwölf Monate.')

  const capabilities = getPublishingCapabilities()
  const [allAccounts, limit] = await Promise.all([listAccounts(userId), channelLimit(userId)])
  const accounts = allAccounts.filter((account) => input.accountIds.includes(account.id))
  if (accounts.length !== new Set(input.accountIds).size) throw new PublishingApiError(404, 'Ein gewählter Kanal wurde nicht gefunden. Bitte lade die Seite neu.')
  const included = new Set(accountsWithinLimit(allAccounts, limit).map((account) => account.id))
  if (accounts.some((account) => !included.has(account.id))) throw new PublishingApiError(403, channelLimitMessage(limit))
  const unavailable = accounts.find((account) => account.status !== 'active' || !capabilities[account.platform].configured)
  if (unavailable) throw new PublishingApiError(409, `Der Kanal ${unavailable.platform_username ?? unavailable.platform} ist nicht verbunden. Bitte verbinde ihn erneut.`)

  for (const account of accounts.filter((value) => value.platform === 'tiktok')) {
    const options = input.tiktokPosts?.[account.id]
    if (!options) throw new PublishingApiError(400, 'Wähle die Sichtbarkeit und bestätige die direkte TikTok-Veröffentlichung in der Clip-Vorschau.')
    await checkTikTokPost(userId, account.id, options, clipOutputDuration(input.clip))
  }

  const source = await resolveSource(userId, input)

  // Was der Nutzer sieht, ist, was hochgeladen wird: ausgeblendete Wörter
  // fallen aus dem Snapshot, die Beschreibung ist die eingegebene.
  const removed = new Set(input.removedWords)
  const clip = {
    ...input.clip,
    user_id: userId,
    words: input.clip.words.filter((_, index) => !removed.has(index)),
    description: input.caption.trim(),
    hashtags: [],
  } as unknown as Clip

  const db = createAdminClient()
  const { data: last, error: lastError } = await db.from('publishing_jobs').select('clip_index')
    .eq('user_id', userId).eq('source_job_id', source.sourceJobId)
    .order('clip_index', { ascending: false }).limit(1).maybeSingle()
  if (lastError) throw new PublishingApiError(503, 'Die Veröffentlichungs-Queue ist gerade nicht erreichbar.')
  const now = new Date().toISOString()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const clipIndex = Math.max(MANUAL_CLIP_INDEX, (last?.clip_index ?? -1) + 1) + attempt
    const rows = accounts.map((account) => ({
      user_id: userId, source_job_id: source.sourceJobId, clip_index: clipIndex, account_id: account.id,
      clip, source_width: source.width, source_height: source.height, proxy_key: source.proxyKey,
      output_format: input.outputFormat, title: clip.title, status: 'pending', review_required: false,
      checkpoint: { approved_at: now, ...(account.platform === 'tiktok' ? { tiktok_post_info: JSON.stringify(input.tiktokPosts![account.id]) } : {}) }, publish_at: publishAt.toISOString(),
    }))
    const { error } = await db.from('publishing_jobs').insert(rows)
    // Zwei gleichzeitige Klicks können denselben Index greifen — dann den nächsten.
    if (error?.code === '23505') continue
    if (error) {
      console.error('[publishing] Manueller Auftrag', { code: error.code, message: error.message })
      throw new PublishingApiError(502, 'Der Clip konnte nicht eingeplant werden. Bitte versuche es erneut.')
    }
    // Die Datenbank ist die Outbox: Fällt der Anstoß aus, holt ihn der Sweep nach.
    if (publishAt.getTime() <= Date.now()) await dispatchDuePublishingJobs(userId).catch(() => undefined)
    return { count: rows.length }
  }
  throw new PublishingApiError(409, 'Der Clip konnte nicht eingeplant werden. Bitte versuche es erneut.')
}
