import 'server-only'

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { RenderJob, RenderRequest } from '@/types/render'
import { DATA_DIR, isUuid, localDirectory } from '@/services/storage/local'
import { getServeUrl, renderClipVideo } from './remotion'

/**
 * Render-Warteschlange im lokalen Modus.
 *
 * Immer nur ein Render gleichzeitig: Remotion verteilt einen Render bereits
 * auf die Hälfte der CPU-Kerne; zwei parallel würden sich nur gegenseitig
 * ausbremsen und den Dev-Server lahmlegen.
 */

interface Registry {
  jobs: Map<string, RenderJob>
  requests: Map<string, RenderRequest>
  running: Map<string, AbortController>
  queue: string[]
}

const registry: Registry = ((globalThis as { __omegaclipRenders?: Registry }).__omegaclipRenders ??= {
  jobs: new Map(),
  requests: new Map(),
  running: new Map(),
  queue: [],
})

export function renderFile(id: string): string {
  return path.join(localDirectory('renders', id), 'clip.mp4')
}

async function persist(job: RenderJob): Promise<void> {
  const file = path.join(localDirectory('renders', job.id), 'render.json')
  await writeFile(`${file}.tmp`, JSON.stringify(job))
  await rename(`${file}.tmp`, file)
}

function update(id: string, patch: Partial<RenderJob>, write = true): void {
  const current = registry.jobs.get(id)
  if (!current) return
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
  registry.jobs.set(id, next)
  if (write) void persist(next).catch(() => {})
}

export async function createLocalRender(request: RenderRequest): Promise<RenderJob> {
  const id = randomUUID()
  await mkdir(localDirectory('renders', id), { recursive: true })
  const now = new Date().toISOString()
  const job: RenderJob = { id, status: 'queued', progress: null, error: null, title: request.title, createdAt: now, updatedAt: now }
  registry.jobs.set(id, job)
  registry.requests.set(id, request)
  await writeFile(path.join(localDirectory('renders', id), 'request.json'), JSON.stringify(request))
  await persist(job)
  registry.queue.push(id)
  pump()
  return job
}

export async function getLocalRender(id: string): Promise<RenderJob | null> {
  if (!isUuid(id)) return null
  let job = registry.jobs.get(id)
  if (!job) {
    try {
      const directory = localDirectory('renders', id)
      job = JSON.parse(await readFile(path.join(directory, 'render.json'), 'utf8')) as RenderJob
      registry.jobs.set(id, job)
      if (job.status === 'queued' || job.status === 'rendering') {
        // Nach einem Neustart: Renders sind deterministisch, also einfach neu starten.
        registry.requests.set(id, JSON.parse(await readFile(path.join(directory, 'request.json'), 'utf8')) as RenderRequest)
        update(id, { status: 'queued', progress: null })
        registry.queue.push(id)
        pump()
      }
    } catch {
      return null
    }
  }
  return registry.jobs.get(id) ?? job
}

export async function deleteLocalRender(id: string): Promise<void> {
  if (!isUuid(id)) return
  registry.queue = registry.queue.filter((queued) => queued !== id)
  registry.running.get(id)?.abort()
  registry.jobs.delete(id)
  registry.requests.delete(id)
  await rm(localDirectory('renders', id), { recursive: true, force: true })
}

function pump(): void {
  if (registry.running.size > 0) return
  const id = registry.queue.shift()
  if (!id) return
  const request = registry.requests.get(id)
  if (!request) return pump()
  const controller = new AbortController()
  registry.running.set(id, controller)
  void execute(id, request, controller).finally(() => {
    registry.running.delete(id)
    pump()
  })
}

async function execute(id: string, request: RenderRequest, controller: AbortController): Promise<void> {
  const started = Date.now()
  try {
    update(id, { status: 'rendering', progress: 0 })
    const serveUrl = await getServeUrl(path.join(DATA_DIR, 'cache'))
    const output = renderFile(id)
    const partial = `${output}.partial.mp4`
    let lastWrite = 0
    await renderClipVideo({
      serveUrl,
      inputProps: request.inputProps,
      outputFormat: request.outputFormat,
      outputPath: partial,
      signal: controller.signal,
      onProgress: (progress) => {
        const now = Date.now()
        update(id, { progress }, now - lastWrite > 1000)
        if (now - lastWrite > 1000) lastWrite = now
      },
    })
    await rename(partial, output)
    update(id, { status: 'ready', progress: 1 })
    console.info(`[render] ${id}: fertig in ${Math.round((Date.now() - started) / 1000)} s`)
  } catch (error) {
    if (controller.signal.aborted) return
    console.error(`[render] ${id} fehlgeschlagen`, error)
    update(id, { status: 'error', progress: null, error: `Der Render ist fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}` })
  }
}
