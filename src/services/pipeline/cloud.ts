import 'server-only'

import { NotFoundError, runs, tasks } from '@trigger.dev/sdk'
import { deletePrefix, getDownloadUrl, workspaceKeys } from '@/lib/storage/r2'
import type { LinkSource } from '@/lib/links'
import { assertR2Reachable, isRunId } from '@/services/storage/mode'
import { UserFacingError } from '@/services/video/source'
import type { ProjectStatus } from '@/types/database'
import type { PipelineJob, PipelinePublishingPlan } from '@/types/pipeline'
import type { ProjectSettings } from '@/types/workspace'
import type { linkToClips } from '@/trigger/link-to-clips'
import type { PublishingTargets } from '@/services/publishing/jobs'

/**
 * Pipeline-Jobs als Trigger.dev-Runs.
 *
 * Die Run-ID ist die Job-ID. Status und Fortschritt kommen aus den
 * Run-Metadaten, die der Task setzt; Segmente und Wellenform aus der Ausgabe
 * des Runs. Der Next-Server hält selbst keinen Zustand.
 */

const STEPS: ProjectStatus[] = ['queued', 'downloading', 'transcribing', 'analyzing', 'reframing']

/** Endzustände eines Runs — danach passiert nichts mehr von selbst. */
const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELED', 'FAILED', 'CRASHED', 'SYSTEM_FAILURE', 'EXPIRED', 'TIMED_OUT'])

/**
 * Dev-Runs verfallen nach 10 Minuten, wenn kein `trigger dev` sie abholt;
 * in Produktion erst nach 14 Tagen ohne freien Worker.
 */
const EXPIRED_MESSAGE = process.env.NODE_ENV === 'production'
  ? 'Die Verarbeitung konnte nicht gestartet werden. Bitte starte das Video erneut.'
  : 'Die Verarbeitung wurde nie gestartet: Der Trigger.dev-Worker lief nicht (`npm run trigger:dev`). Starte ihn und versuche es erneut.'

/**
 * Prüft einen YouTube-Link ohne yt-dlp — auf Vercel gibt es keins.
 *
 * Die oEmbed-Schnittstelle liefert Titel und Vorschaubild und antwortet für
 * gelöschte oder ungültige Videos mit 404/400. Private Videos und solche mit
 * gesperrter Einbettung liefern beide 401; die lassen wir durch, der Worker
 * meldet dann den genauen Grund.
 *
 * Das Vorschaubild gleich mitzunehmen hält den Cloud-Modus gleichauf mit dem
 * lokalen, der es per yt-dlp schon vor dem Start kennt — sonst stand bis zum
 * Ende nur ein Platzhalter im Projekt.
 */
async function lookupSource(url: string, source: LinkSource): Promise<{ title: string; thumbnailUrl: string | null }> {
  if (source !== 'youtube') return { title: 'Google-Drive-Video', thumbnailUrl: null }
  const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  if (response && (response.status === 404 || response.status === 400)) {
    throw new UserFacingError('Das Video ist nicht verfügbar. Prüfe den Link.')
  }
  const data = response?.ok ? ((await response.json().catch(() => null)) as { title?: string; thumbnail_url?: string } | null) : null
  const thumbnailUrl = typeof data?.thumbnail_url === 'string' && data.thumbnail_url.startsWith('https://') ? data.thumbnail_url : null
  return { title: data?.title?.trim() || 'YouTube-Video', thumbnailUrl }
}

export async function createCloudJob(input: { url: string; source: LinkSource; settings: ProjectSettings; userId?: string; publishing?: PublishingTargets; publishingPlan?: PipelinePublishingPlan }): Promise<PipelineJob> {
  // Vor dem Run: Ein falsch eingerichtetes R2 soll sofort auffallen, nicht
  // erst nach Download, Transkription und Analyse.
  await assertR2Reachable()
  const { title, thumbnailUrl } = await lookupSource(input.url, input.source)
  const handle = await tasks.trigger<typeof linkToClips>('link-to-clips', { ...input, title }, { tags: [`source:${input.source}`] })
  const now = new Date().toISOString()
  return {
    id: handle.id,
    userId: input.userId,
    publishing: input.publishingPlan,
    url: input.url,
    source: input.source,
    settings: input.settings,
    title,
    thumbnailUrl,
    durationSeconds: null,
    sourceLanguage: null,
    caption: null,
    status: 'queued',
    progress: null,
    message: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    result: null,
  }
}

export async function getCloudJob(id: string): Promise<PipelineJob | null> {
  if (!isRunId(id)) return null
  // Nur „gibt es nicht" heißt null. Ein Ausfall der Trigger-API darf ein
  // Projekt weder als verschwunden markieren noch ein Löschen überspringen.
  const run = await runs.retrieve<typeof linkToClips>(id).catch((error) => {
    if (error instanceof NotFoundError) return null
    throw error
  })
  if (!run) return null

  const meta = (run.metadata ?? {}) as Partial<Pick<PipelineJob, 'status' | 'progress' | 'message' | 'title' | 'thumbnailUrl' | 'durationSeconds'>>
  const payload = run.payload
  const step = meta.status && STEPS.includes(meta.status) ? meta.status : 'queued'

  let status: ProjectStatus = step
  let error: string | null = null
  if (run.isSuccess && run.output) status = 'ready'
  else if (run.isCancelled) { status = 'error'; error = 'Die Verarbeitung wurde abgebrochen.' }
  // Ein verfallener Run ist nie gestartet und zählt bei der API weder als
  // fehlgeschlagen noch als abgeschlossen — ohne diesen Zweig bliebe das
  // Projekt für immer in der Warteschlange.
  else if (run.status === 'EXPIRED') { status = 'error'; error = EXPIRED_MESSAGE }
  else if (run.isFailed || run.isCompleted || TERMINAL_STATUSES.has(run.status)) { status = 'error'; error = run.error?.message ?? 'Die Verarbeitung ist fehlgeschlagen.' }

  const output = run.output
  return {
    id,
    userId: payload?.userId,
    publishing: payload?.publishingPlan,
    url: payload?.url ?? '',
    source: payload?.source ?? 'youtube',
    settings: payload?.settings ?? { language: 'auto', clipLength: 'auto', topic: '', aspectRatio: '9:16' },
    title: meta.title ?? payload?.title ?? 'Neues Projekt',
    thumbnailUrl: meta.thumbnailUrl ?? null,
    durationSeconds: meta.durationSeconds ?? output?.durationSeconds ?? null,
    sourceLanguage: output?.language ?? null,
    caption: null,
    status,
    progress: status === 'ready' || status === 'error' ? null : meta.progress ?? null,
    message: status === 'ready' || status === 'error' ? null : meta.message ?? null,
    error,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    result: status === 'ready' && output ? output : null,
  }
}

/** Kurzlebige URL fürs Abspielen; der Render bekommt eine mit längerer Laufzeit. */
export function cloudMediaUrl(id: string, expiresIn = 6 * 3600): Promise<string> {
  return getDownloadUrl(workspaceKeys.proxy(id), expiresIn)
}

/**
 * Hält den Lauf an. Ein schon beendeter Lauf bleibt, wie er ist — das meldet
 * die API als Erfolg. Jeder andere Fehler zählt: Ein Lauf, der weiterläuft,
 * plant am Ende noch Veröffentlichungen ein.
 */
export async function cancelCloudJob(id: string): Promise<void> {
  if (!isRunId(id)) return
  await runs.cancel(id).catch((error) => {
    if (!(error instanceof NotFoundError)) throw error
  })
}

export async function deleteCloudJob(id: string): Promise<void> {
  if (!isRunId(id)) return
  await cancelCloudJob(id)
  await deletePrefix(workspaceKeys.job(id))
}
