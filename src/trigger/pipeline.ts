/**
 * Task-Definitionen der Verarbeitungspipeline.
 *
 * Phase 1 legt Signaturen und Payload-Typen fest, damit UI und Datenmodell
 * dagegen entwickelt werden. Phase 2 füllt die Implementierungen; der Aufbau
 * der Kette ändert sich dabei nicht.
 *
 * Siehe README.md in diesem Verzeichnis für Ablauf, Idempotenz und Retries.
 */

export interface IngestPayload {
  projectId: string
  userId: string
}

export interface TranscribePayload {
  projectId: string
  userId: string
}

export interface AnalyzePayload {
  projectId: string
  userId: string
  maxClips?: number
}

export interface ReframePayload {
  clipId: string
  projectId: string
  userId: string
}

export interface RenderPayload {
  clipId: string
  userId: string
}

export interface SchedulePayload {
  projectId: string
  userId: string
}

export interface PublishPayload {
  postingScheduleId: string
}

/**
 * Deterministische Idempotenzschlüssel.
 *
 * Bewusst ohne Zeitstempel: Ein zweiter Auslöser für denselben Schritt desselben
 * Objekts MUSS denselben Schlüssel erzeugen, sonst läuft der Schritt doppelt.
 */
export const idempotencyKey = {
  ingest: (projectId: string) => `project:${projectId}:ingest`,
  transcribe: (projectId: string) => `project:${projectId}:transcribe`,
  analyze: (projectId: string) => `project:${projectId}:analyze`,
  reframe: (clipId: string) => `clip:${clipId}:reframe`,
  render: (clipId: string) => `clip:${clipId}:render`,
  schedule: (projectId: string) => `project:${projectId}:schedule`,
  publish: (clipId: string, accountId: string) => `post:${clipId}:${accountId}`,
} as const

/**
 * Wie oft der Publishing-Cron nach fälligen Einträgen sucht.
 *
 * Fünf Minuten sind der Kompromiss: genau genug für eine Veröffentlichungs-
 * planung, die in Stunden denkt, und selten genug, um die Datenbank nicht mit
 * Leerläufen zu belasten.
 */
export const PUBLISH_CRON = '*/5 * * * *'

/** Token-Refresh. TikTok-Access-Tokens laufen nach 24 Stunden ab. */
export const TOKEN_REFRESH_CRON = '0 3 * * *'
