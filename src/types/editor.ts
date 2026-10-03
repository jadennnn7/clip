import type { CaptionStyle, Clip, ClipSegment, CropKeyframe, Overlay, TranscriptWord, VideoSettings } from './database'

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
  /**
   * Untertitelwörter auf der AUSGABE-Zeitachse (nach allen Schnitten,
   * 0 = erster Frame des fertigen Clips). Die Umrechnung macht der Editor.
   */
  words: TranscriptWord[]
  captionStyle: CaptionStyle
  cropKeyframes: CropKeyframe[]
  /** Seitenverhältnis der Quelle, für die Berechnung des Ausschnitts. */
  sourceWidth: number
  sourceHeight: number
  /**
   * Behaltene Abschnitte, Sekunden ab Clip-Start. Fehlt bei Renders, die vor
   * dem Schnitt-Editor gestartet wurden — dann läuft der Clip am Stück.
   */
  segments?: ClipSegment[] | null
  overlays?: Overlay[]
  video?: VideoSettings | null
  /**
   * Clyp-Wasserzeichen im Gratis-Tarif. Beim Export entscheidet der Server
   * (`needsWatermark`), nie der Browser.
   */
  watermark?: boolean
  /**
   * Mit Wasserzeichen hängt ein schwarzer Abspann „Made with Clyp" am Clip
   * (`OUTRO_SECONDS`). `false` nur im Editor: Dessen Timeline endet am Clip.
   */
  outro?: boolean
}

/** Im Untertitel ausgeblendete Wörter; verändert weder Audio noch Videoschnitt. */
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
