import 'server-only'

import type { Clip, Project } from '@/types/database'
import type { ClipCompositionProps } from '@/types/editor'
import { COMPOSITION_HEIGHT, COMPOSITION_WIDTH, FPS } from '@/types/editor'

/**
 * Rendering über Remotion Lambda.
 *
 * Warum Lambda und nicht ein eigener Worker: Ein Clip wird in Chunks auf
 * mehrere Lambda-Instanzen verteilt und parallel gerendert. Ein 60-Sekunden-
 * Clip ist so in unter einer Minute fertig statt in mehreren — und bei
 * Lastspitzen skaliert es ohne eigenes Autoscaling.
 *
 * Kosten: ~0,017 $ pro Minute Video zuzüglich S3, Transfer und CloudWatch.
 * Ab vier Mitarbeitern kommt die Remotion Company License hinzu
 * (0,01 $ pro Render, mindestens 100 $/Monat) — siehe remotion.pro/license.
 *
 * Der Render schreibt nach S3. Der Completion-Schritt kopiert die Datei nach
 * R2 und eine S3-Lifecycle-Regel löscht sie nach 24 Stunden; nur so bleibt der
 * Egress-Vorteil von R2 erhalten.
 */

export interface RenderRequest {
  clip: Clip
  project: Project
  /** Presigned URL der Quelldatei (nicht des Proxys — der Render nutzt das Original). */
  videoSrc: string
}

export interface RenderHandle {
  renderId: string
  bucketName: string
}

export function buildCompositionProps({
  clip,
  project,
  videoSrc,
}: RenderRequest): ClipCompositionProps {
  return {
    videoSrc,
    startSeconds: clip.start_seconds,
    endSeconds: clip.end_seconds,
    words: clip.words,
    captionStyle: clip.caption_style,
    cropKeyframes: clip.crop_keyframes,
    sourceWidth: project.width ?? 1920,
    sourceHeight: project.height ?? 1080,
  }
}

export async function startRender(request: RenderRequest): Promise<RenderHandle> {
  const inputProps = buildCompositionProps(request)
  void inputProps
  void COMPOSITION_WIDTH
  void COMPOSITION_HEIGHT
  void FPS

  // Phase 2:
  //   import { renderMediaOnLambda } from '@remotion/lambda/client'
  //   const { renderId, bucketName } = await renderMediaOnLambda({
  //     region:       process.env.REMOTION_AWS_REGION,
  //     functionName: process.env.REMOTION_FUNCTION_NAME,
  //     serveUrl:     process.env.REMOTION_SERVE_URL,
  //     composition:  'Clip',
  //     inputProps,
  //     codec:        'h264',
  //     imageFormat:  'jpeg',
  //     privacy:      'private',
  //     // Höhere Werte parallelisieren stärker, kosten aber mehr Invocations.
  //     framesPerLambda: 60,
  //   })
  throw new Error('startRender: noch nicht implementiert (Phase 2)')
}

/** Fortschritt abfragen. Wird vom Trigger-Task gepollt. */
export async function getRenderProgress(_handle: RenderHandle): Promise<{
  done: boolean
  progress: number
  outputUrl: string | null
  error: string | null
}> {
  // Phase 2: getRenderProgress() aus @remotion/lambda/client
  throw new Error('getRenderProgress: noch nicht implementiert (Phase 2)')
}

/**
 * Schätzt die zu reservierenden Render-Minuten.
 *
 * Abgerechnet wird die Clip-Länge, nicht die Renderdauer — das ist für Nutzer
 * vorhersehbar, während die Renderdauer von Lambda-Auslastung und Kaltstarts
 * abhängt und niemand sie vorher kennt.
 */
export function estimateRenderMinutes(clip: Clip): number {
  return Number(((clip.end_seconds - clip.start_seconds) / 60).toFixed(2))
}
