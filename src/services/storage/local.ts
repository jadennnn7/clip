import 'server-only'

import path from 'node:path'

/**
 * Lokale Ablage für Downloads, Uploads, Renders und Job-Zustand.
 *
 * Nur im lokalen Modus (ohne Trigger.dev). In der Cloud liegen dieselben
 * Dateien in R2, siehe `services/storage/mode.ts`.
 */
// `turbopackIgnore`: Ohne den Hinweis kann Turbopack den Pfad nicht eingrenzen
// und legt das ganze Projekt samt public/ in jede Server-Funktion — auf Vercel
// reißt das die Größengrenze. In der Cloud wird die Ablage nie benutzt.
export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.OMEGACLIP_DATA_DIR || path.join(process.cwd(), '.omegaclip-data'))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function isUuid(value: string): boolean {
  return UUID.test(value)
}

/** Verzeichnis unterhalb der Ablage. Die ID wird geprüft, damit kein `../` den Pfad verlässt. */
export function localDirectory(kind: 'jobs' | 'renders' | 'uploads', id: string): string {
  if (!isUuid(id)) throw new Error('Ungültige ID')
  return path.join(/*turbopackIgnore: true*/ DATA_DIR, kind, id)
}
