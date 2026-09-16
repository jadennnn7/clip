import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Cloudflare R2 — S3-kompatibel, aber ohne Egress-Kosten.
 *
 * Bei einer Video-Plattform dominiert die Auslieferung die Rechnung: Supabase
 * Storage verlangt ~$0.09/GB Egress, R2 null. Bei 1 TB Traffic im Monat sind
 * das ~$90 gegen ~$15 reine Speicherkosten.
 *
 * Supabase bleibt für Postgres/Auth/Metadaten zuständig, R2 hält die Dateien.
 */

let client: S3Client | null = null

export function getR2Client(): S3Client {
  if (client) return client

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 ist nicht konfiguriert (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).')
  }

  client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })

  return client
}

function bucket() {
  return process.env.R2_BUCKET ?? 'omegaclip'
}

/**
 * Key-Konventionen. Der `user_id`-Präfix hält die Objekte eines Tenants
 * beieinander — das macht Löschung bei Account-Kündigung zu einem Prefix-Delete.
 */
export const r2Keys = {
  source: (userId: string, projectId: string, ext = 'mp4') =>
    `sources/${userId}/${projectId}/source.${ext}`,

  /** 16 kHz Mono WAV für Deepgram — kleiner Upload, schnellere Transkription. */
  audio: (userId: string, projectId: string) =>
    `audio/${userId}/${projectId}/audio.wav`,

  /** Vorberechnete Wellenform-Peaks. Siehe services/video/waveform.ts. */
  waveform: (userId: string, projectId: string) =>
    `waveforms/${userId}/${projectId}/peaks.json`,

  /** 720p-Proxy. Der Editor spielt NIE die Originaldatei ab. */
  proxy: (userId: string, projectId: string) =>
    `proxies/${userId}/${projectId}/proxy.mp4`,

  render: (userId: string, clipId: string) =>
    `renders/${userId}/${clipId}/clip.mp4`,

  thumbnail: (userId: string, clipId: string) =>
    `thumbnails/${userId}/${clipId}/thumb.jpg`,
} as const

/** Presigned URL zum Lesen. Default 1 Stunde. */
export async function getDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn },
  )
}

/** Presigned URL für Direkt-Uploads aus dem Browser (umgeht den Next.js-Server). */
export async function getUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600,
): Promise<string> {
  return getSignedUrl(
    getR2Client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn },
  )
}

export async function deleteObject(key: string): Promise<void> {
  await getR2Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
}

/**
 * Öffentliche URL über die Custom-Domain des Buckets.
 *
 * Wird für Instagram gebraucht: Meta lädt das Video selbst herunter
 * (`POST /{ig-user-id}/media` mit `video_url`) und kann eine presigned URL mit
 * AWS-Signatur-Parametern nicht zuverlässig verarbeiten. Der Pfad enthält
 * UUIDs und ist damit nicht erratbar; für echten Zugriffsschutz gehört vor den
 * Bucket zusätzlich ein Cloudflare Access Rule oder ein Worker-Token-Check.
 */
export function getPublicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_BASE_URL
  if (!base) {
    throw new Error(
      'R2_PUBLIC_BASE_URL ist nicht gesetzt — ohne öffentliche URL kann Instagram das Video nicht abholen.',
    )
  }
  return `${base.replace(/\/$/, '')}/${key}`
}
