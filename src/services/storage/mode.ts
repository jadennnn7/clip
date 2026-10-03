import 'server-only'

import { headBucket, isR2Configured, probeBucketWrite, r2BucketName } from '@/lib/storage/r2'
import { UserFacingError } from '@/services/video/source'

/**
 * Lokal oder Cloud?
 *
 * Lokal (Standard): Pipeline und Render laufen im Node-Prozess des
 * Next-Servers, Dateien liegen unter `.omegaclip-data/`. Braucht ffmpeg und
 * yt-dlp auf dem Rechner — auf Vercel gibt es beides nicht, und eine
 * Serverless-Function würde nach wenigen Minuten ohnehin abgebrochen.
 *
 * Cloud (`TRIGGER_SECRET_KEY` gesetzt): Dieselben Schritte laufen als
 * Trigger.dev-Tasks (`src/trigger/`), Videos und Renders liegen in R2. Der
 * Next-Server stößt nur an, fragt ab und signiert Download-URLs — das passt
 * in jedes Serverless-Zeitlimit.
 */
export function isCloudMode(): boolean {
  return Boolean(process.env.TRIGGER_SECRET_KEY)
}

export function assertCloudStorage(): void {
  if (!isR2Configured()) {
    throw new UserFacingError('Für den Cloud-Modus fehlt R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) — die Videos brauchen einen Ablageort.')
  }
}

/**
 * Prüft R2 vor der teuren Arbeit. Ohne den Check lud die Pipeline erst
 * herunter, transkribierte und analysierte, scheiterte dann am ersten Upload
 * mit „write EPROTO …“ — und wiederholte beim zweiten Versuch alles.
 */
export async function assertR2Reachable(): Promise<void> {
  assertCloudStorage()
  try {
    await headBucket()
  } catch (error) {
    throw new UserFacingError(describeR2Failure(error))
  }
  try {
    await probeBucketWrite()
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode
    throw new UserFacingError(status === 401 || status === 403
      ? `Der R2-Token darf im Bucket „${r2BucketName()}“ nur lesen. Bitte unter R2 → „API-Token verwalten“ einen Token mit „Objekt lesen und schreiben“ anlegen und R2_ACCESS_KEY_ID und R2_SECRET_ACCESS_KEY ersetzen.`
      : describeR2Failure(error))
  }
}

function describeR2Failure(error: unknown): string {
  const failure = error as { code?: string; name?: string; message?: string; $metadata?: { httpStatusCode?: number } } | null
  const status = failure?.$metadata?.httpStatusCode
  // Cloudflare bricht den TLS-Handshake für Account-IDs ab, die es nicht kennt.
  if (failure?.code === 'EPROTO' || /handshake failure/i.test(failure?.message ?? '')) {
    return 'Cloudflare R2 lehnt die Verbindung ab. Meist stimmt R2_ACCOUNT_ID nicht (Cloudflare-Dashboard → R2 → „Account ID“), oder R2 ist im Konto noch nicht aktiviert.'
  }
  if (failure?.code === 'ENOTFOUND') return 'Die R2-Adresse existiert nicht. Bitte R2_ACCOUNT_ID bzw. R2_ENDPOINT prüfen.'
  if (status === 404) return `Den R2-Bucket „${r2BucketName()}“ gibt es nicht. Bitte ihn anlegen oder R2_BUCKET anpassen.`
  if (status === 401 || status === 403) return 'R2 hat die Zugangsdaten abgelehnt. Bitte R2_ACCESS_KEY_ID und R2_SECRET_ACCESS_KEY prüfen; der Token braucht Lese- und Schreibrechte auf den Bucket.'
  return 'Cloudflare R2 ist gerade nicht erreichbar. Bitte später erneut versuchen.'
}

/** IDs von Trigger.dev-Runs — die lokalen Jobs sind UUIDs. */
export function isRunId(value: string): boolean {
  return /^run_[a-z0-9]+$/.test(value)
}
