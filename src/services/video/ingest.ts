import 'server-only'

import type { ProjectSource } from '@/types/database'

/**
 * Holt das Quellvideo und legt es in R2 ab.
 *
 * Reihenfolge der Quellen ist bewusst: Upload zuerst, YouTube optional.
 *
 * Das Herunterladen fremder YouTube-Videos verstößt gegen deren
 * Nutzungsbedingungen. Die Plattform verlangt deshalb eine ausdrückliche
 * Rechtebestätigung des Nutzers, die in `projects.rights_confirmed`
 * protokolliert wird — ein Check-Constraint im Schema erzwingt sie für
 * source_type = 'youtube'.
 */

export interface IngestRequest {
  projectId: string
  userId: string
  sourceType: ProjectSource
  /** Bei 'upload' bereits der R2-Key, sonst die externe URL. */
  source: string
  rightsConfirmed: boolean
}

export interface IngestResult {
  sourceKey: string
  proxyKey: string
  audioKey: string
  waveformKey: string
  durationSeconds: number
  width: number
  height: number
  fps: number
}

export async function ingestProject(request: IngestRequest): Promise<IngestResult> {
  if (request.sourceType === 'youtube' && !request.rightsConfirmed) {
    throw new Error(
      'Für YouTube-Quellen muss die Rechtebestätigung vorliegen, bevor das Video geladen wird.',
    )
  }

  // Phase 2 — Ablauf:
  //   1. Quelle beschaffen
  //      - 'upload': liegt bereits in R2 (Direktupload per presigned URL)
  //      - 'drive':  über die Drive-API mit dem OAuth-Token des Nutzers
  //      - 'youtube': Download der Quelle, nach Rechtebestätigung
  //   2. probe()        → Dauer, Auflösung, FPS; früh abbrechen bei defekten Dateien
  //   3. extractAudio() → 16 kHz Mono WAV
  //   4. createProxy()  → 720p für den Editor
  //   5. computeWaveform() → peaks.json
  //   6. alles nach R2, Keys ins Projekt schreiben
  throw new Error('ingestProject: noch nicht implementiert (Phase 2)')
}
