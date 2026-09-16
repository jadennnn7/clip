import 'server-only'

export interface ProbeResult {
  durationSeconds: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
}

/**
 * FFmpeg-Operationen des Ingest-Schritts.
 *
 * Diese laufen auf dem Trigger.dev-Worker, nicht in einer Serverless-Function:
 * das Transkodieren eines einstündigen Videos überschreitet jedes
 * Serverless-Zeitlimit deutlich.
 */

/** Liest Metadaten aus, bevor irgendetwas anderes passiert. */
export async function probe(_inputPath: string): Promise<ProbeResult> {
  // Phase 2: ffprobe -v quiet -print_format json -show_streams -show_format
  throw new Error('probe: noch nicht implementiert (Phase 2)')
}

/**
 * Extrahiert die Audiospur als 16 kHz Mono WAV für Deepgram.
 *
 * 16 kHz Mono ist das, womit Spracherkennungsmodelle arbeiten — höher
 * aufgelöstes Audio hochzuladen kostet Zeit und ändert das Ergebnis nicht.
 */
export async function extractAudio(_inputPath: string, _outputPath: string): Promise<void> {
  // Phase 2: ffmpeg -i in -vn -ac 1 -ar 16000 -c:a pcm_s16le out.wav
  throw new Error('extractAudio: noch nicht implementiert (Phase 2)')
}

/**
 * Erzeugt das 720p-Proxy für den Editor.
 *
 * Der Editor spielt niemals die Originaldatei ab. Ein 4K-Source wäre im
 * Browser-Scrubbing unbenutzbar und würde bei jedem Öffnen des Editors
 * Gigabyte an Transfer auslösen.
 */
export async function createProxy(_inputPath: string, _outputPath: string): Promise<void> {
  // Phase 2: ffmpeg -i in -vf scale=-2:720 -c:v libx264 -preset veryfast
  //          -crf 26 -movflags +faststart out.mp4
  // `+faststart` ist wichtig: ohne den Moov-Atom am Dateianfang muss der
  // Browser die gesamte Datei laden, bevor er abspielen kann.
  throw new Error('createProxy: noch nicht implementiert (Phase 2)')
}

/**
 * Szenenwechsel erkennen.
 *
 * Die Kamerafahrt beim Reframing darf über einen Schnitt hinweg nicht
 * interpolieren — sonst gleitet der Ausschnitt sanft von einer Einstellung in
 * die nächste, was sichtbar falsch aussieht. An Szenengrenzen wird der
 * Keyframe deshalb hart gesetzt.
 */
export async function detectScenes(_inputPath: string): Promise<number[]> {
  // Phase 2: ffmpeg -i in -filter:v "select='gt(scene,0.4)',showinfo" -f null -
  throw new Error('detectScenes: noch nicht implementiert (Phase 2)')
}
