import type { Clip, ClipSegment, TranscriptWord } from '../types/database'

/**
 * Bildrate der Pipeline — dieselbe wie `FPS` in `types/editor`. Hier lokal,
 * damit dieses Modul ohne Pfad-Alias lädt: `scripts/test-clip-export.mjs`
 * importiert es direkt mit Node.
 */
const FPS = 30
const FRAME = 1 / FPS

// --- Abschnitte (Schnitte innerhalb eines Clips) ----------------------------
//
// Ein Clip ist ein Fenster [start_seconds, end_seconds] im Quellvideo. Darin
// liegen die behaltenen Abschnitte, in Sekunden ab Clip-Start — wie die
// Wort-Timestamps an das Material gebunden. Die Ausgabe spielt sie lückenlos
// hintereinander; aus 0–5 s und 8–20 s wird ein 17-Sekunden-Clip.
//
// Alle Grenzen liegen auf Frames. Sonst rundeten Player, Render und Timeline
// jeweils etwas anders, und an einem Schnitt blitzte ein Frame auf.

export function snapToFrame(seconds: number): number {
  return Math.round(seconds * FPS) / FPS
}

/** Kürzester Abschnitt, der beim Teilen oder Trimmen entstehen darf. */
export const MIN_SEGMENT_SECONDS = 0.2

export function clipWindowDuration(clip: Pick<Clip, 'start_seconds' | 'end_seconds'>): number {
  return Math.max(0, clip.end_seconds - clip.start_seconds)
}

/**
 * Sortiert, auf Frames gelegt, in den Clip geklemmt, Überlappungen
 * verschmolzen. Berührende Abschnitte bleiben getrennt — das ist ein
 * Schnitt ohne Lücke, den der Nutzer bewusst gesetzt hat.
 */
export function normalizeSegments(segments: ClipSegment[] | null | undefined, duration: number): ClipSegment[] {
  const total = snapToFrame(Math.max(0, duration))
  if (!Array.isArray(segments) || segments.length === 0) return [{ start: 0, end: total }]
  const cleaned = segments
    .filter((segment) => segment && Number.isFinite(segment.start) && Number.isFinite(segment.end))
    .map((segment) => ({
      start: Math.min(total, Math.max(0, snapToFrame(segment.start))),
      end: Math.min(total, Math.max(0, snapToFrame(segment.end))),
    }))
    .filter((segment) => segment.end - segment.start >= FRAME - 1e-6)
    .sort((a, b) => a.start - b.start)

  const result: ClipSegment[] = []
  for (const segment of cleaned) {
    const last = result[result.length - 1]
    if (last && segment.start < last.end - 1e-6) last.end = Math.max(last.end, segment.end)
    else result.push({ ...segment })
  }
  return result.length > 0 ? result : [{ start: 0, end: total }]
}

/** Die behaltenen Abschnitte eines Clips; ohne Schnitte einer über den ganzen Clip. */
export function clipSegments(clip: Pick<Clip, 'start_seconds' | 'end_seconds' | 'segments'>): ClipSegment[] {
  return normalizeSegments(clip.segments, clipWindowDuration(clip))
}

export function outputDuration(segments: ClipSegment[]): number {
  return segments.reduce((sum, segment) => sum + (segment.end - segment.start), 0)
}

/** Länge des fertigen Clips nach allen Schnitten. */
export function clipOutputDuration(clip: Pick<Clip, 'start_seconds' | 'end_seconds' | 'segments'>): number {
  return outputDuration(clipSegments(clip))
}

export function hasCuts(clip: Pick<Clip, 'start_seconds' | 'end_seconds' | 'segments'>): boolean {
  return clipSegments(clip).length > 1
}

/**
 * Quellzeit (ab Clip-Start) → Ausgabezeit. Eine Zeit in einer Lücke landet
 * auf dem Anfang des nächsten Abschnitts — dort, wo das Bild weitergeht.
 */
export function sourceToOutput(segments: ClipSegment[], time: number): number {
  let output = 0
  for (const segment of segments) {
    if (time < segment.start) return output
    if (time < segment.end) return output + (time - segment.start)
    output += segment.end - segment.start
  }
  return output
}

/** Ausgabezeit → Quellzeit (ab Clip-Start). */
export function outputToSource(segments: ClipSegment[], time: number): number {
  let output = 0
  for (const segment of segments) {
    const length = segment.end - segment.start
    if (time < output + length) return segment.start + Math.max(0, time - output)
    output += length
  }
  return segments[segments.length - 1]?.end ?? 0
}

/** Liegt diese Quellzeit in einem herausgeschnittenen Bereich? */
export function isCutAt(segments: ClipSegment[], time: number): boolean {
  return !segments.some((segment) => time >= segment.start && time < segment.end)
}

/** Die Abschnitte auf der Ausgabe-Zeitachse, wie die Timeline sie zeigt. */
export function outputSegments(segments: ClipSegment[]): Array<ClipSegment & { outputStart: number; outputEnd: number; index: number }> {
  let output = 0
  return segments.map((segment, index) => {
    const outputStart = output
    output += segment.end - segment.start
    return { ...segment, outputStart, outputEnd: output, index }
  })
}

/**
 * Wörter auf die Ausgabe-Zeitachse. Herausgeschnittene fallen weg, an einem
 * Schnitt angeschnittene behalten ihren sichtbaren Teil — sofern davon mehr
 * als ein Splitter übrig ist. Ein Rest von wenigen Millisekunden würde im
 * Untertitel als Wort aufblitzen, das man nie hört.
 */
export function wordsToOutput(words: TranscriptWord[], segments: ClipSegment[]): TranscriptWord[] {
  const result: TranscriptWord[] = []
  for (const word of words) {
    const minimum = Math.min(0.06, Math.max(0.001, (word.end - word.start) * 0.3))
    let first: number | null = null
    let last = 0
    for (const segment of segments) {
      const start = Math.max(word.start, segment.start)
      const end = Math.min(word.end, segment.end)
      if (end - start >= minimum) {
        if (first === null) first = start
        last = end
      }
    }
    if (first === null) continue
    const start = sourceToOutput(segments, first)
    const end = sourceToOutput(segments, last) || start
    if (end > start) result.push({ ...word, start, end })
  }
  return result
}

/**
 * Verschiebt Abschnitte, wenn sich das Clip-Fenster ändert.
 *
 * Die Ränder wandern mit dem Fenster: Wer den Startpunkt früher legt, will
 * das neue Material sehen — also beginnt der erste Abschnitt wieder bei 0,
 * und der letzte endet am neuen Ende.
 */
function retimeSegments(segments: ClipSegment[] | null | undefined, delta: number, duration: number): ClipSegment[] | null {
  if (!Array.isArray(segments) || segments.length <= 1) return null
  const shifted = segments
    .map((segment) => ({ start: Math.max(0, segment.start + delta), end: Math.min(duration, segment.end + delta) }))
    .filter((segment) => segment.end - segment.start >= FRAME)
  if (shifted.length === 0) return null
  shifted[0].start = 0
  shifted[shifted.length - 1].end = duration
  const normalized = normalizeSegments(shifted, duration)
  return normalized.length > 1 ? normalized : null
}

/** Keep source-time alignment when the in-point moves. Retain hidden words so trim is reversible. */
export function trimClip(clip: Clip, requestedStart: number, requestedEnd: number, sourceDuration = Infinity): Clip {
  if (!Number.isFinite(requestedStart) || !Number.isFinite(requestedEnd)) return clip
  const minimum = Math.min(0.5, sourceDuration)
  const start = Math.max(0, Math.min(requestedStart, sourceDuration - minimum))
  const end = Math.min(sourceDuration, Math.max(start + minimum, requestedEnd))
  const delta = clip.start_seconds - start
  const trimmed: Clip = {
    ...clip,
    start_seconds: start,
    end_seconds: end,
    words: clip.words.map((word) => ({ ...word, start: word.start + delta, end: word.end + delta })),
    crop_keyframes: clip.crop_keyframes.map((keyframe) => ({ ...keyframe, frame: keyframe.frame + Math.round(delta * FPS) })),
  }
  if (clip.segments) trimmed.segments = retimeSegments(clip.segments, delta, end - start)
  return trimmed
}

export function visibleCaptionWords(clip: Clip, removedWordIndices: number[] = []): TranscriptWord[] {
  const removed = new Set(removedWordIndices)
  const duration = clip.end_seconds - clip.start_seconds
  return clip.words.flatMap((word, index) => {
    if (removed.has(index) || !word.word.trim() || !Number.isFinite(word.start) || !Number.isFinite(word.end)) return []
    const start = Math.max(0, word.start)
    const end = Math.min(duration, word.end)
    return end > start ? [{ ...word, start, end }] : []
  }).sort((a, b) => a.start - b.start)
}

/**
 * Die Untertitelwörter so, wie sie im fertigen Clip stehen: ohne
 * ausgeblendete Wörter und auf die Zeitachse nach allen Schnitten gelegt.
 * Genau diese Liste bekommen Player, Render und die SRT-Datei.
 */
export function outputCaptionWords(clip: Clip, removedWordIndices: number[] = []): TranscriptWord[] {
  const words = visibleCaptionWords(clip, removedWordIndices)
  return clip.segments ? wordsToOutput(words, clipSegments(clip)) : words
}

export function subtitleTimestamp(seconds: number, separator = ','): string {
  const milliseconds = Math.max(0, Math.round(seconds * 1000))
  const hours = Math.floor(milliseconds / 3_600_000)
  const minutes = Math.floor(milliseconds / 60_000) % 60
  const wholeSeconds = Math.floor(milliseconds / 1000) % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}${separator}${String(milliseconds % 1000).padStart(3, '0')}`
}

export type ClipExportFormat = 'srt' | 'vtt' | 'txt' | 'json'

export function exportClip(clip: Clip, removedWordIndices: number[], format: ClipExportFormat, outputFormat = '9:16'): string {
  const words = outputCaptionWords(clip, removedWordIndices)
  if (format === 'txt') return `${words.map((word) => word.word).join(' ')}\n`
  if (format === 'json') {
    return JSON.stringify({
      schema: 'omegaclip-edit-v2',
      title: clip.title,
      description: clip.description,
      hashtags: clip.hashtags,
      hook: clip.hook_text,
      sourceTrim: { startSeconds: clip.start_seconds, endSeconds: clip.end_seconds },
      segments: clipSegments(clip),
      outputDurationSeconds: Math.round(clipOutputDuration(clip) * 1000) / 1000,
      outputFormat,
      captionStyle: clip.caption_style,
      cropKeyframes: clip.crop_keyframes,
      overlays: clip.overlays ?? [],
      videoSettings: clip.video_settings ?? null,
      words,
      excludedCaptionWordIndices: removedWordIndices,
      excludedWordsAffectAudio: false,
      videoRendered: false,
    }, null, 2)
  }
  const groups: TranscriptWord[][] = []
  const size = Math.max(1, Math.min(12, clip.caption_style.wordsPerLine))
  for (const word of words) {
    const last = groups.at(-1)
    if (!last || last.length >= size || word.start - last[last.length - 1].end > 0.8) groups.push([word])
    else last.push(word)
  }
  const separator = format === 'vtt' ? '.' : ','
  const cues = groups.map((group, index) => {
    const text = group.map((word) => word.word.replace(/[\r\n]+/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join(' ')
    return `${index + 1}\n${subtitleTimestamp(group[0].start, separator)} --> ${subtitleTimestamp(Math.max(...group.map((word) => word.end)), separator)}\n${text}`
  }).join('\n\n')
  return `${format === 'vtt' ? 'WEBVTT\n\n' : ''}${cues}\n`
}

export function downloadClipExport(clip: Clip, removedWordIndices: number[], format: ClipExportFormat, outputFormat: string) {
  const mime = format === 'json' ? 'application/json' : format === 'vtt' ? 'text/vtt' : 'text/plain'
  const blob = new Blob([exportClip(clip, removedWordIndices, format, outputFormat)], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const basename = clip.title.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '').slice(0, 100) || 'omegaclip'
  link.download = `${basename}.${format}`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
