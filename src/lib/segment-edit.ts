import type { ClipSegment, TranscriptWord } from '@/types/database'
import { MIN_SEGMENT_SECONDS, normalizeSegments, outputToSource, snapToFrame, sourceToOutput } from '@/lib/clip-export'

/**
 * Schnittoperationen auf den Abschnitten eines Clips.
 *
 * Alles hier ist rein: Abschnitte rein, Abschnitte raus, in Sekunden ab
 * Clip-Start. Was das für Clip-Fenster, Wörter und Kamerafahrt heißt,
 * entscheidet der Store — er legt den Clip neu an, wenn der erste oder
 * letzte Abschnitt wegfällt.
 */

const EPSILON = 1e-6

/** Teilt den Abschnitt, in dem `time` liegt. Zu kurze Reste verhindern den Schnitt. */
export function splitSegmentsAt(segments: ClipSegment[], time: number): ClipSegment[] {
  const at = snapToFrame(time)
  const index = segments.findIndex((segment) => at > segment.start && at < segment.end)
  if (index < 0) return segments
  const segment = segments[index]
  if (at - segment.start < MIN_SEGMENT_SECONDS || segment.end - at < MIN_SEGMENT_SECONDS) return segments
  return [...segments.slice(0, index), { start: segment.start, end: at }, { start: at, end: segment.end }, ...segments.slice(index + 1)]
}

/**
 * Nimmt einen Quellbereich heraus — auch quer über mehrere Abschnitte.
 *
 * Gerundet wird nach außen: Ein Wort von 1,36 s bis 1,92 s verliert sonst
 * durch das Einrasten auf 1,3667 s einen Splitter am Anfang, der als
 * Zucken im Bild und als Wortfetzen im Untertitel stehen bliebe.
 */
export function cutSegmentRange(segments: ClipSegment[], from: number, to: number): ClipSegment[] {
  const start = Math.floor(Math.min(from, to) * 30 + 1e-6) / 30
  const end = Math.ceil(Math.max(from, to) * 30 - 1e-6) / 30
  if (end - start < 1 / 30 - EPSILON) return segments
  const result: ClipSegment[] = []
  for (const segment of segments) {
    if (segment.end <= start + EPSILON || segment.start >= end - EPSILON) {
      result.push(segment)
      continue
    }
    if (segment.start < start - EPSILON) result.push({ start: segment.start, end: start })
    if (segment.end > end + EPSILON) result.push({ start: end, end: segment.end })
  }
  return result.filter((segment) => segment.end - segment.start > EPSILON)
}

/**
 * Holt einen herausgeschnittenen Bereich zurück. Abschnitte, die ihn
 * berühren, verschmelzen mit ihm — sonst bliebe an jeder Stelle, die man
 * zurückholt, eine Schnittkante ohne Lücke stehen.
 */
export function restoreSegmentRange(segments: ClipSegment[], from: number, to: number, duration: number): ClipSegment[] {
  const merged = {
    start: Math.max(0, Math.floor(Math.min(from, to) * 30 + 1e-6) / 30),
    end: Math.min(snapToFrame(duration), Math.ceil(Math.max(from, to) * 30 - 1e-6) / 30),
  }
  const others: ClipSegment[] = []
  for (const segment of segments) {
    if (segment.end >= merged.start - EPSILON && segment.start <= merged.end + EPSILON) {
      merged.start = Math.min(merged.start, segment.start)
      merged.end = Math.max(merged.end, segment.end)
    } else {
      others.push(segment)
    }
  }
  return normalizeSegments([...others, merged], duration)
}

export function removeSegment(segments: ClipSegment[], index: number): ClipSegment[] {
  if (segments.length <= 1 || index < 0 || index >= segments.length) return segments
  return segments.filter((_, candidate) => candidate !== index)
}

/**
 * Verschiebt eine Kante eines inneren Abschnitts. Sie bleibt zwischen den
 * Nachbarn — Material doppelt zu zeigen, kann dieses Modell nicht.
 */
export function setSegmentEdge(segments: ClipSegment[], index: number, edge: 'start' | 'end', time: number, duration: number): ClipSegment[] {
  const segment = segments[index]
  if (!segment) return segments
  const previousEnd = segments[index - 1]?.end ?? 0
  const nextStart = segments[index + 1]?.start ?? duration
  const at = snapToFrame(time)
  const next = edge === 'start'
    ? { start: Math.min(Math.max(at, previousEnd), segment.end - MIN_SEGMENT_SECONDS), end: segment.end }
    : { start: segment.start, end: Math.max(Math.min(at, nextStart), segment.start + MIN_SEGMENT_SECONDS) }
  return segments.map((candidate, position) => (position === index ? next : candidate))
}

// --- Automatische Schnitte aus dem Transkript --------------------------------

/** Luft, die an einem entfernten Bereich stehen bleibt — sonst klingt der Schnitt abgehackt. */
const BREATH_SECONDS = 0.12

/** Sprechpausen ab `minimumGap` Sekunden, als Quellbereiche. */
export function findPauses(words: TranscriptWord[], duration: number, minimumGap: number): Array<[number, number]> {
  const spoken = words
    .filter((word) => word.word.trim() && word.end > 0 && word.start < duration)
    .map((word) => ({ start: Math.max(0, word.start), end: Math.min(duration, word.end) }))
    .sort((a, b) => a.start - b.start)
  if (spoken.length === 0) return []

  const ranges: Array<[number, number]> = []
  const push = (from: number, to: number) => {
    if (to - from >= MIN_SEGMENT_SECONDS) ranges.push([from, to])
  }
  if (spoken[0].start >= minimumGap) push(0, spoken[0].start - BREATH_SECONDS)
  let lastEnd = spoken[0].end
  for (const word of spoken.slice(1)) {
    if (word.start - lastEnd >= minimumGap) push(lastEnd + BREATH_SECONDS, word.start - BREATH_SECONDS)
    lastEnd = Math.max(lastEnd, word.end)
  }
  if (duration - lastEnd >= minimumGap) push(lastEnd + BREATH_SECONDS, duration)
  return ranges
}

const FILLERS = new Set(['äh', 'ähm', 'öh', 'öhm', 'hm', 'hmm', 'mhm', 'ehm', 'uh', 'uhm', 'um', 'umm', 'erm', 'er', 'ah'])

export function isFillerWord(word: string): boolean {
  return FILLERS.has(word.toLowerCase().replace(/[^\p{L}]/gu, ''))
}

/** Füllwörter als Quellbereiche, samt Indizes für die Rückmeldung. */
export function findFillers(words: TranscriptWord[], duration: number): Array<{ index: number; range: [number, number] }> {
  return words.flatMap((word, index) =>
    isFillerWord(word.word) && word.end > 0 && word.start < duration
      ? [{ index, range: [Math.max(0, word.start), Math.min(duration, word.end)] as [number, number] }]
      : [],
  )
}

// --- Overlays an das Material binden ----------------------------------------

/** Wie `outputToSource`, aber eine Zeit genau auf einer Schnittkante gehört zum Abschnitt davor. */
function outputToSourceEnd(segments: ClipSegment[], time: number): number {
  let output = 0
  for (const segment of segments) {
    const length = segment.end - segment.start
    if (time <= output + length + EPSILON) return segment.start + Math.max(0, time - output)
    output += length
  }
  return segments[segments.length - 1]?.end ?? 0
}

interface Placement {
  /** Clip-Start im Quellvideo, Sekunden. */
  start: number
  segments: ClipSegment[]
}

/**
 * Hält Overlays an ihrem Material fest, wenn sich die Schnitte ändern.
 *
 * Wird ein Abschnitt entfernt, rückt alles dahinter nach — auch der Titel,
 * der auf eine bestimmte Pointe zeigt. Ein Overlay, das ganz im entfernten
 * Bereich lag, bleibt mit seiner Länge an der Schnittstelle stehen, statt
 * zu verschwinden: Löschen soll nur das Bild betreffen, nicht die Arbeit
 * an den Overlays.
 */
export function remapOverlayTimes<T extends { start: number; end: number }>(items: T[], before: Placement, after: Placement): T[] {
  const shift = before.start - after.start
  return items.map((item) => {
    const start = sourceToOutput(after.segments, outputToSource(before.segments, item.start) + shift)
    const mappedEnd = sourceToOutput(after.segments, outputToSourceEnd(before.segments, item.end) + shift)
    const end = mappedEnd - start >= 0.1 ? mappedEnd : start + (item.end - item.start)
    if (Math.abs(start - item.start) < EPSILON && Math.abs(end - item.end) < EPSILON) return item
    return { ...item, start: snapToFrame(start), end: snapToFrame(end) }
  })
}

/**
 * Was vor der Änderung bis zum Clip-Ende lief — der Fortschrittsbalken, ein
 * Hook-Titel über den ganzen Clip —, läuft auch danach bis zum Ende. Sonst
 * hörte der Titel nach einem verlängerten Trim mitten im Clip auf.
 *
 * `before` und `after` sind dieselben Elemente in derselben Reihenfolge,
 * vor und nach dem Umrechnen der Zeiten.
 */
export function keepOverlaysToEnd<T extends { start: number; end: number }>(before: T[], after: T[], beforeDuration: number, afterDuration: number): T[] {
  const end = snapToFrame(afterDuration)
  if (Math.abs(snapToFrame(beforeDuration) - end) < EPSILON) return after
  return after.map((item, index) => {
    const original = before[index]
    if (!original || original.end < snapToFrame(beforeDuration) - 0.5 / 30) return item
    if (end - item.start < 1 / 30 || Math.abs(item.end - end) < EPSILON) return item
    return { ...item, end }
  })
}

/** Dieselbe Umrechnung für einen einzelnen Zeitpunkt, etwa den Playhead. */
export function remapOutputTime(time: number, before: Placement, after: Placement): number {
  return sourceToOutput(after.segments, outputToSource(before.segments, time) + before.start - after.start)
}
