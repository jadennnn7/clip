import { metadata, task } from '@trigger.dev/sdk'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { uploadFile, workspaceKeys } from '@/lib/storage/r2'
import { getServeUrl, renderClipVideo } from '@/services/render/remotion'
import type { RenderRequest } from '@/types/render'

/**
 * MP4-Render eines Clips auf dem Trigger.dev-Worker.
 *
 * Remotion bündelt die Composition beim ersten Render pro Maschine (die
 * Quellen liegen per `additionalFiles` im Image) und lädt beim ersten Mal
 * Chrome Headless Shell. Das Ergebnis landet in R2.
 */
export const renderClip = task({
  id: 'render-clip',
  // Chrome rendert Frames parallel über die Hälfte der Kerne.
  machine: 'large-1x',
  maxDuration: 30 * 60,
  retry: { maxAttempts: 2 },
  run: async (payload: RenderRequest, { ctx, signal }) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'omegaclip-render-'))
    try {
      metadata.set('progress', 0)
      const serveUrl = await getServeUrl(path.join(os.tmpdir(), 'omegaclip-cache'))
      const output = path.join(directory, 'clip.mp4')
      await renderClipVideo({
        serveUrl,
        inputProps: payload.inputProps,
        outputFormat: payload.outputFormat,
        outputPath: output,
        signal,
        onProgress: (progress) => metadata.set('progress', progress),
      })
      const key = workspaceKeys.render(ctx.run.id)
      await uploadFile(key, output, 'video/mp4')
      return { key }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
})
