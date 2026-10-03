import 'server-only'

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ProjectStatus } from '@/types/database'
import type { PipelineJob, PipelinePublishingPlan } from '@/types/pipeline'
import type { ProjectSettings } from '@/types/workspace'
import type { LinkSource } from '@/lib/links'
import { fetchSourceInfo, UserFacingError } from '@/services/video/source'
import { assertCreditsAvailable } from '@/services/billing/credits'
import { isUuid, localDirectory } from '@/services/storage/local'
import { AbortError } from './process'
import { runPipeline } from './run'

/**
 * Jobs der lokalen Pipeline: anlegen, einreihen, abfragen, abbrechen.
 *
 * Der Zustand liegt als `job.json` neben den Mediendateien. Damit übersteht
 * ein Job einen Neustart des Dev-Servers: Wer danach den Status abfragt,
 * stößt ihn wieder an, und die Schritte überspringen, was schon auf der
 * Platte liegt.
 */

/** Zwei parallel: Download und ffmpeg lasten sonst Leitung und CPU doppelt aus. */
const MAX_CONCURRENT = 2

const TERMINAL: ProjectStatus[] = ['ready', 'error']

interface Registry {
  jobs: Map<string, PipelineJob>
  running: Map<string, AbortController>
  queue: string[]
  lastWrite: Map<string, number>
}

// Auf globalThis, damit Hot Reload im Dev-Server laufende Jobs nicht vergisst.
const registry: Registry = ((globalThis as { __omegaclipPipeline?: Registry }).__omegaclipPipeline ??= {
  jobs: new Map(),
  running: new Map(),
  queue: [],
  lastWrite: new Map(),
})

export const isJobId = isUuid

export function jobDirectory(id: string): string {
  return localDirectory('jobs', id)
}

export function proxyPath(id: string): string {
  return path.join(jobDirectory(id), 'proxy.mp4')
}

async function persist(job: PipelineJob): Promise<void> {
  const file = path.join(jobDirectory(job.id), 'job.json')
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(job))
  // Atomar ersetzen: Ein Absturz mitten im Schreiben hinterlässt sonst eine
  // halbe JSON-Datei, und der Job wäre verloren.
  await rename(temporary, file)
}

function update(id: string, patch: Partial<PipelineJob>, force = false): void {
  const current = registry.jobs.get(id)
  if (!current) return
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
  registry.jobs.set(id, next)

  // Fortschritt kommt mehrmals pro Sekunde; auf die Platte muss er nicht jedes
  // Mal. Statuswechsel werden immer sofort geschrieben.
  const now = Date.now()
  const statusChanged = patch.status !== undefined && patch.status !== current.status
  if (!force && !statusChanged && now - (registry.lastWrite.get(id) ?? 0) < 1000) return
  registry.lastWrite.set(id, now)
  void persist(next).catch((error) => {
    // Nach dem Löschen eines laufenden Jobs ist das Verzeichnis weg — erwartbar.
    if (registry.jobs.has(id)) console.error('[pipeline] Job konnte nicht gespeichert werden', error)
  })
}

/**
 * Prüft den Link, legt den Job an und reiht ihn ein.
 *
 * Die Metadaten werden hier synchron geholt: Ein privates oder gelöschtes
 * Video fällt so schon beim Einfügen auf, nicht erst als Fehlerkarte.
 */
export async function createJob(input: { url: string; source: LinkSource; settings: ProjectSettings; userId?: string; publishingPlan?: PipelinePublishingPlan }): Promise<PipelineJob> {
  const id = randomUUID()
  const directory = jobDirectory(id)
  await mkdir(directory, { recursive: true })

  try {
    const info = await fetchSourceInfo(
      input.url,
      path.join(directory, 'info.json'),
      input.settings.language === 'auto' ? null : input.settings.language,
    )
    // Die Länge ist jetzt bekannt: Reicht das Guthaben nicht, erfährt der
    // Nutzer das beim Einfügen, nicht erst als Fehlerkarte.
    if (input.userId) await assertCreditsAvailable(input.userId, info.durationSeconds)
    const now = new Date().toISOString()
    const job: PipelineJob = {
      id,
      userId: input.userId,
      publishing: input.publishingPlan,
      url: input.url,
      source: input.source,
      settings: input.settings,
      title: info.title,
      thumbnailUrl: info.thumbnailUrl,
      durationSeconds: info.durationSeconds,
      sourceLanguage: info.language,
      caption: info.caption,
      status: 'queued',
      progress: null,
      message: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      result: null,
    }
    registry.jobs.set(id, job)
    await persist(job)
    enqueue(id)
    return job
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

export async function getJob(id: string): Promise<PipelineJob | null> {
  if (!isJobId(id)) return null
  let job = registry.jobs.get(id)
  if (!job) {
    try {
      job = JSON.parse(await readFile(path.join(jobDirectory(id), 'job.json'), 'utf8')) as PipelineJob
      registry.jobs.set(id, job)
    } catch {
      return null
    }
  }

  // Nicht fertig, aber weder in Arbeit noch in der Warteschlange: Der Server
  // wurde neu gestartet. Wieder aufnehmen statt als Fehler stehen lassen.
  if (!TERMINAL.includes(job.status) && !registry.running.has(id) && !registry.queue.includes(id)) {
    update(id, { status: 'queued', progress: null, message: 'Wird fortgesetzt' }, true)
    enqueue(id)
  }
  return registry.jobs.get(id) ?? job
}

/** Bricht einen laufenden Job ab und löscht alle seine Dateien. */
export async function deleteJob(id: string): Promise<void> {
  if (!isJobId(id)) return
  registry.queue = registry.queue.filter((queued) => queued !== id)
  const controller = registry.running.get(id)
  controller?.abort()
  registry.jobs.delete(id)
  registry.lastWrite.delete(id)
  // Der abgebrochene Prozess braucht einen Moment, bis er seine Dateien loslässt.
  if (controller) await new Promise((resolve) => setTimeout(resolve, 300))
  await rm(jobDirectory(id), { recursive: true, force: true })
}

function enqueue(id: string): void {
  if (!registry.queue.includes(id) && !registry.running.has(id)) registry.queue.push(id)
  pump()
}

function pump(): void {
  while (registry.running.size < MAX_CONCURRENT && registry.queue.length > 0) {
    const id = registry.queue.shift()!
    const job = registry.jobs.get(id)
    if (!job) continue
    const controller = new AbortController()
    registry.running.set(id, controller)
    void execute(job, controller).finally(() => {
      registry.running.delete(id)
      pump()
    })
  }
}

async function execute(job: PipelineJob, controller: AbortController): Promise<void> {
  const started = Date.now()
  try {
    const result = await runPipeline(job, {
      directory: jobDirectory(job.id),
      signal: controller.signal,
      report: (patch) => update(job.id, patch),
    })
    if (controller.signal.aborted) return
    update(job.id, { status: 'ready', progress: null, message: null, error: null, result }, true)
    console.info(`[pipeline] ${job.id}: ${result.segments.length} Clips in ${Math.round((Date.now() - started) / 1000)} s (${result.transcriptSource}, ${result.analysis})`)
  } catch (error) {
    if (controller.signal.aborted || error instanceof AbortError) return
    console.error(`[pipeline] ${job.id} fehlgeschlagen`, error)
    const message = error instanceof UserFacingError
      ? error.message
      : `Die Verarbeitung ist fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
    update(job.id, { status: 'error', progress: null, message: null, error: message }, true)
  }
}
