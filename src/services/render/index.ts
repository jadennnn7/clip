import 'server-only'

import { NotFoundError, runs, tasks } from '@trigger.dev/sdk'
import { contentDisposition, serveFile } from '@/lib/server/serve-file'
import { deleteObject, getAttachmentUrl, workspaceKeys } from '@/lib/storage/r2'
import { assertCloudStorage, isCloudMode, isRunId } from '@/services/storage/mode'
import type { RenderJob, RenderRequest } from '@/types/render'
import type { renderClip } from '@/trigger/render-clip'
import { createLocalRender, deleteLocalRender, getLocalRender, renderFile } from './local'

/**
 * Renders anlegen, abfragen, ausliefern — lokal (Warteschlange im
 * Next-Prozess) oder als Trigger.dev-Run mit Ergebnis in R2.
 */

export async function startRender(request: RenderRequest): Promise<RenderJob> {
  if (!isCloudMode()) return createLocalRender(request)
  assertCloudStorage()
  const handle = await tasks.trigger<typeof renderClip>('render-clip', request)
  const now = new Date().toISOString()
  return { id: handle.id, status: 'queued', progress: null, error: null, title: request.title, createdAt: now, updatedAt: now }
}

export async function readRender(id: string): Promise<RenderJob | null> {
  if (!isRunId(id)) return getLocalRender(id)
  const run = await runs.retrieve<typeof renderClip>(id).catch(() => null)
  if (!run) return null
  const progress = typeof run.metadata?.progress === 'number' ? run.metadata.progress : null
  const status: RenderJob['status'] = run.isSuccess ? 'ready' : run.isFailed || run.isCancelled || run.isCompleted ? 'error' : run.isExecuting ? 'rendering' : 'queued'
  return {
    id,
    status,
    progress: status === 'ready' ? 1 : progress,
    error: status === 'error' ? run.error?.message ?? 'Der Render ist fehlgeschlagen.' : null,
    title: run.payload?.title ?? 'clip',
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  }
}

export async function renderFileResponse(request: Request, id: string): Promise<Response> {
  const job = await readRender(id)
  if (!job || job.status !== 'ready') return new Response('Nicht gefunden', { status: 404 })
  const filename = `${job.title.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 100) || 'clip'}.mp4`
  if (isRunId(id)) return Response.redirect(await getAttachmentUrl(workspaceKeys.render(id), filename), 302)
  const response = await serveFile(request, renderFile(id), { contentType: 'video/mp4', downloadName: filename, cacheControl: 'private, no-store' })
  response.headers.set('Content-Disposition', contentDisposition(filename))
  return response
}

export async function removeRender(id: string): Promise<void> {
  if (!isRunId(id)) return deleteLocalRender(id)
  // Ein beendeter Lauf lässt sich „abbrechen", ohne dass etwas passiert; nur
  // ein unbekannter ist kein Fehler. DeleteObject ist für fehlende Dateien
  // ebenfalls ein Erfolg — was hier scheitert, ist ein echter Fehler.
  await runs.cancel(id).catch((error) => {
    if (!(error instanceof NotFoundError)) throw error
  })
  await deleteObject(workspaceKeys.render(id))
}
