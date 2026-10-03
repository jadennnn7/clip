import type { ClipSegment } from '@/types/database'
import { FPS, type ClipCompositionProps } from '@/types/editor'

/**
 * Ein Abschnitt des Clips in Frames: wo er in der Ausgabe beginnt, wie lang
 * er ist und bei welchem Frame ab Clip-Start er im Material liegt.
 */
export interface FrameSegment {
  from: number
  durationInFrames: number
  sourceStartFrame: number
}

/**
 * Die Abschnitte in Frames, lückenlos hintereinander.
 *
 * Gerundet wird jede Grenze für sich, nicht jede Länge: So ergeben die
 * Längen in Summe exakt, was die Timeline in Sekunden anzeigt, und ein Clip
 * ohne Schnitte hat genau so viele Frames wie vor dem Schnitt-Editor.
 */
export function frameSegments(
  segments: ClipSegment[] | null | undefined,
  startSeconds: number,
  endSeconds: number,
  fps = FPS,
): FrameSegment[] {
  const total = Math.max(0, Math.round((endSeconds - startSeconds) * fps))
  const list = Array.isArray(segments) && segments.length > 0
    ? segments
      .filter((segment) => segment && Number.isFinite(segment.start) && Number.isFinite(segment.end))
      .slice()
      .sort((a, b) => a.start - b.start)
    : [{ start: 0, end: endSeconds - startSeconds }]

  const result: FrameSegment[] = []
  let from = 0
  let lastEnd = 0
  for (const segment of list) {
    const start = Math.max(lastEnd, Math.round(segment.start * fps))
    const end = Math.min(total, Math.round(segment.end * fps))
    if (end - start < 1) continue
    result.push({ from, durationInFrames: end - start, sourceStartFrame: start })
    from += end - start
    lastEnd = end
  }
  if (result.length === 0) result.push({ from: 0, durationInFrames: Math.max(1, total), sourceStartFrame: 0 })
  return result
}

/** Länge des Clips selbst, ohne Abspann. */
export function contentDurationInFrames(
  props: Pick<ClipCompositionProps, 'segments' | 'startSeconds' | 'endSeconds'>,
  fps = FPS,
): number {
  const segments = frameSegments(props.segments, props.startSeconds, props.endSeconds, fps)
  const last = segments[segments.length - 1]
  return Math.max(1, last.from + last.durationInFrames)
}

/** Der schwarze Abspann „Made with Clyp" im Gratis-Tarif, hinter dem Clip. */
export const OUTRO_SECONDS = 2

/** Frames des Abspanns; 0 ohne Wasserzeichen oder mit `outro: false` (Editor). */
export function outroFrames(props: Pick<ClipCompositionProps, 'watermark' | 'outro'>, fps = FPS): number {
  return props.watermark && props.outro !== false ? Math.round(OUTRO_SECONDS * fps) : 0
}

/** Länge der Composition — Player und Render rechnen hiermit; der Abspann zählt mit. */
export function compositionDurationInFrames(
  props: Pick<ClipCompositionProps, 'segments' | 'startSeconds' | 'endSeconds' | 'watermark' | 'outro'>,
  fps = FPS,
): number {
  return contentDurationInFrames(props, fps) + outroFrames(props, fps)
}
