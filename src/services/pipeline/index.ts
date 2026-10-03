import 'server-only'

import type { LinkSource } from '@/lib/links'
import { getDownloadUrl, workspaceKeys } from '@/lib/storage/r2'
import { serveFile } from '@/lib/server/serve-file'
import { isCloudMode, isRunId } from '@/services/storage/mode'
import type { PipelineJob, PipelinePublishingPlan } from '@/types/pipeline'
import { UserFacingError } from '@/services/video/source'
import type { ProjectSettings } from '@/types/workspace'
import { cancelCloudJob, cloudMediaUrl, createCloudJob, deleteCloudJob, getCloudJob } from './cloud'
import { createJob, deleteJob, getJob, isJobId, jobDirectory, proxyPath } from './jobs'
import { thumbnailPath } from './run'
import type { PublishingTargets } from '@/services/publishing/jobs'

/**
 * Einstieg für die API-Routen: Lokal oder Trigger.dev, je nach Konfiguration
 * beim Anlegen und nach Form der ID danach. So bleiben alte lokale Projekte
 * abrufbar, wenn später der Cloud-Modus eingeschaltet wird.
 */

export function startPipeline(input: { url: string; source: LinkSource; settings: ProjectSettings; userId?: string; publishing?: PublishingTargets; publishingPlan?: PipelinePublishingPlan }): Promise<PipelineJob> {
  if (input.publishing && !isCloudMode()) {
    throw new UserFacingError('Die automatische Veröffentlichung benötigt den Hintergrunddienst. Bitte die Publishing-Einrichtung unter „Kanäle“ prüfen.')
  }
  return isCloudMode() ? createCloudJob(input) : createJob(input)
}

export function readPipeline(id: string): Promise<PipelineJob | null> {
  return isRunId(id) ? getCloudJob(id) : getJob(id)
}

/**
 * Hält einen Cloud-Lauf an, ohne seine Dateien anzufassen. Lokale Jobs
 * veröffentlichen nie; sie stoppt `removePipeline` gleich mit.
 */
export function stopPipeline(id: string): Promise<void> {
  return isRunId(id) ? cancelCloudJob(id) : Promise.resolve()
}

export function removePipeline(id: string): Promise<void> {
  return isRunId(id) ? deleteCloudJob(id) : deleteJob(id)
}

export async function pipelineMediaResponse(request: Request, id: string): Promise<Response> {
  if (isRunId(id)) {
    // Der Player fragt jeden Abschnitt per Range-Request neu an, und jeder lief
    // durch Anmeldung und Signatur — je bis zu zwei Sekunden, bevor das erste
    // Bild kam. Die Weiterleitung darf daher im Browser liegen, kürzer als die
    // URL gilt, damit jede ausgelieferte Adresse noch zehn Minuten hält.
    const location = await cloudMediaUrl(id, 3600)
    return new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'private, max-age=3000' } })
  }
  if (!isJobId(id)) return new Response('Nicht gefunden', { status: 404 })
  // Das Proxy eines Jobs ändert sich nie — der Browser darf es behalten.
  return serveFile(request, proxyPath(id), { contentType: 'video/mp4' })
}

/** Adresse, unter der ein Renderer (Chrome lokal oder auf dem Worker) das Proxy abholt. */
export async function pipelineMediaForRender(id: string, origin: string): Promise<string | null> {
  if (isRunId(id)) return cloudMediaUrl(id)
  return isJobId(id) ? `${origin}/api/pipeline/${id}/media` : null
}

/** Vorschaubild eines Clips. Ändert sich nie — Browser dürfen es dauerhaft behalten. */
export async function pipelineThumbnailResponse(request: Request, id: string, index: number): Promise<Response> {
  if (isRunId(id)) {
    // Die Weiterleitung selbst darf fast so lange im Cache liegen, wie die signierte URL gilt.
    const location = await getDownloadUrl(workspaceKeys.thumbnail(id, index), 24 * 3600)
    return new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'private, max-age=82800' } })
  }
  if (!isJobId(id)) return new Response('Nicht gefunden', { status: 404 })
  return serveFile(request, thumbnailPath(jobDirectory(id), index), { contentType: 'image/jpeg', cacheControl: 'private, max-age=31536000, immutable' })
}
