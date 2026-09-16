import 'server-only'

import type { CropKeyframe, TranscriptWord } from '@/types/database'

/**
 * 16:9 → 9:16 Reframing mit aktiver Sprechererkennung.
 *
 * Die Computer Vision läuft hier im Worker und erzeugt NUR ein Keyframe-Array.
 * Remotion interpoliert es später (siehe `remotion/reframe.ts`). Diese Trennung
 * hat drei Gründe:
 *   - Der Render bleibt deterministisch und schnell — kein CV im Renderpfad.
 *   - Die Kameraposition ist im Editor manuell korrigierbar, weil sie Daten
 *     sind und kein eingebrannter Effekt.
 *   - Ein erneuter Render nach einer Styling-Änderung muss die Analyse nicht
 *     wiederholen.
 *
 * Verfahren (Phase 2):
 *   1. Frames alle ~0,5 s abtasten
 *   2. Personen erkennen (YOLO o. ä.), Gesichter zuordnen
 *   3. Aktiven Sprecher über Mundbewegung bestimmen, quergeprüft gegen die
 *      Diarization-Daten aus dem Transkript
 *   4. Position über Szenen hinweg glätten ("Kameramann"-Logik), an
 *      Szenengrenzen hart schneiden
 */
export interface ReframeOptions {
  videoPath: string
  startSeconds: number
  endSeconds: number
  fps: number
  /** Szenengrenzen aus detectScenes(), über die nicht interpoliert wird. */
  sceneBoundaries: number[]
  /** Diarization aus dem Transkript, um Sprecherwechsel vorherzusehen. */
  words: TranscriptWord[]
}

export async function computeCropKeyframes(_options: ReframeOptions): Promise<CropKeyframe[]> {
  throw new Error('computeCropKeyframes: noch nicht implementiert (Phase 2)')
}

/**
 * Rückfallposition, wenn die Erkennung nichts findet.
 *
 * Ein statischer, leicht nach oben versetzter Mittelausschnitt. Die Mitte ist
 * bei Talking-Head-Material fast immer brauchbar, und Gesichter sitzen in der
 * oberen Bildhälfte — ein exakt mittiger Crop schneidet regelmäßig die Stirn ab.
 */
export function fallbackKeyframes(): CropKeyframe[] {
  return [{ frame: 0, x: 0.5, y: 0.42, scale: 1 }]
}
