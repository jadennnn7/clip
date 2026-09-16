import type { CaptionStyle, Clip, CropKeyframe, TranscriptWord } from './database'

/** Feste Bildrate der Pipeline. Timeline, Remotion und Trim rechnen alle damit. */
export const FPS = 30

/** Ausgabeformat: 9:16 vertikal. */
export const COMPOSITION_WIDTH = 1080
export const COMPOSITION_HEIGHT = 1920

/**
 * Props der Remotion-Composition.
 *
 * Exakt dieses Objekt geht sowohl an den `<Player>` im Browser als auch an
 * `renderMediaOnLambda()`. Dadurch ist die Vorschau garantiert identisch zum
 * gerenderten Ergebnis — es gibt keinen zweiten Rendering-Pfad, der abweichen
 * könnte.
 */
// Absichtlich ein Type-Alias statt eines Interfaces: Remotions `<Composition>`
// verlangt `Props extends Record<string, unknown>`, und Interfaces haben in
// TypeScript keine implizite Index-Signatur — ein Interface wäre hier nicht
// zuweisbar.
export type ClipCompositionProps = {
  videoSrc: string
  /** Startzeit im QUELLVIDEO in Sekunden. */
  startSeconds: number
  endSeconds: number
  /** Timestamps relativ zum Clip-Start (0 = erster Frame des Clips). */
  words: TranscriptWord[]
  captionStyle: CaptionStyle
  cropKeyframes: CropKeyframe[]
  /** Seitenverhältnis der Quelle, für die Berechnung des Ausschnitts. */
  sourceWidth: number
  sourceHeight: number
}

/** Ein Wort, das aus dem Clip herausgeschnitten wurde (Backspace im Transkript). */
export type WordCutSet = Set<number>

/** Die undo-fähige Teilmenge des Editor-States. */
export interface EditorHistoryState {
  clips: Clip[]
  activeClipId: string | null
  /** Indizes der entfernten Wörter, pro Clip-ID. */
  removedWords: Record<string, number[]>
}

export interface WaveformData {
  /** Normalisierte Peaks, 0..1. Serverseitig beim Ingest berechnet. */
  peaks: number[]
  /** Länge des Quellvideos in Sekunden. */
  duration: number
}

/** Gruppe gleichzeitig sichtbarer Wörter (eine "Untertitel-Zeile"). */
export interface CaptionChunk {
  words: TranscriptWord[]
  start: number
  end: number
}
