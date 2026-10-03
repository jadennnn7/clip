import { AbortTaskRunError, metadata, task } from '@trigger.dev/sdk'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { uploadFile, workspaceKeys } from '@/lib/storage/r2'
import { runPipeline, thumbnailPath } from '@/services/pipeline/run'
import { UserFacingError } from '@/services/video/source'
import { assertR2Reachable } from '@/services/storage/mode'
import type { LinkSource } from '@/lib/links'
import type { PipelineJob, PipelinePublishingPlan, PipelineResult } from '@/types/pipeline'
import type { ProjectSettings } from '@/types/workspace'
import { enqueueGeneratedClips, type PublishingTargets } from '@/services/publishing/jobs'
import { chargeSourceCredits } from '@/services/billing/credits'

export interface LinkToClipsPayload {
  url: string
  source: LinkSource
  settings: ProjectSettings
  title: string
  userId?: string
  publishing?: PublishingTargets
  publishingPlan?: PipelinePublishingPlan
}

export type LinkToClipsOutput = PipelineResult & { proxyKey: string }

/**
 * Link → fertige Clips auf dem Trigger.dev-Worker.
 *
 * Dieselbe `runPipeline` wie im lokalen Modus, nur mit einem temporären
 * Arbeitsverzeichnis. Am Ende wandert das 720p-Proxy nach R2; Segmente und
 * Wellenform sind die Ausgabe des Runs, der Next-Server liest sie über
 * `runs.retrieve`. Fortschritt läuft über die Run-Metadaten.
 */
export const linkToClips = task({
  id: 'link-to-clips',
  // Zwei Kerne: ffmpeg und die Gesichtserkennung laufen nacheinander, aber
  // der Download profitiert von einem zweiten Kern fürs Muxen.
  machine: 'medium-2x',
  maxDuration: 60 * 60,
  retry: { maxAttempts: 2 },
  run: async (payload: LinkToClipsPayload, { ctx, signal }): Promise<LinkToClipsOutput> => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'omegaclip-'))
    const now = new Date().toISOString()
    const job: PipelineJob = {
      id: ctx.run.id,
      userId: payload.userId,
      publishing: payload.publishingPlan,
      url: payload.url,
      source: payload.source,
      settings: payload.settings,
      title: payload.title,
      thumbnailUrl: null,
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

    try {
      // Auch hier: Der Worker kann andere Umgebungsvariablen haben als Next.
      await assertR2Reachable()
      const result = await runPipeline(job, {
        directory,
        signal,
        deferBilling: true,
        report: (patch) => {
          for (const [key, value] of Object.entries(patch)) metadata.set(key, value ?? null)
        },
      })
      metadata.set('message', 'Video wird gespeichert')
      const proxyKey = workspaceKeys.proxy(ctx.run.id)
      await uploadFile(proxyKey, path.join(directory, 'proxy.mp4'), 'video/mp4')
      // Vorschaubilder: dieselben Indizes wie in `thumbnail_url` der Segmente.
      await Promise.all(result.segments.map((segment, index) =>
        segment.thumbnail_url
          ? uploadFile(workspaceKeys.thumbnail(ctx.run.id, index), thumbnailPath(directory, index), 'image/jpeg')
          : null,
      ))
      signal.throwIfAborted()
      if (job.userId) await chargeSourceCredits(job.userId, job.id, result.durationSeconds)
      if (payload.publishing) {
        metadata.set('message', 'Clips werden für deine Kanäle eingeplant')
        result.publishing = await enqueueGeneratedClips({
          targets: payload.publishing, sourceJobId: ctx.run.id, result, proxyKey,
          outputFormat: payload.settings.aspectRatio,
        })
        if (result.publishing.notice) {
          result.notice = [result.notice, result.publishing.notice].filter(Boolean).join(' ')
        }
      }
      return { ...result, proxyKey }
    } catch (error) {
      // Ein privates Video wird durch einen zweiten Versuch nicht öffentlich.
      if (error instanceof UserFacingError) throw new AbortTaskRunError(error.message)
      throw error
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
})
