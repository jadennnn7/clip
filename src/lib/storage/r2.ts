import { createReadStream } from 'node:fs'
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
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

export function isR2Configured(): boolean {
  return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY)
}

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

export function r2BucketName(): string {
  return bucket()
}

/** Eine Anfrage: Zugangsdaten gültig, Bucket vorhanden, Endpunkt erreichbar. */
export async function headBucket(): Promise<void> {
  await getR2Client().send(new HeadBucketCommand({ Bucket: bucket() }))
}

/**
 * Prüft, ob der Token schreiben darf — `headBucket` reicht dafür nicht, ein
 * Nur-Lese-Token besteht ihn. Schreibt immer dieselbe 2-Byte-Datei.
 */
export async function probeBucketWrite(): Promise<void> {
  await getR2Client().send(new PutObjectCommand({
    Bucket: bucket(), Key: 'healthcheck/write-test.txt', Body: 'ok', ContentType: 'text/plain',
  }))
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

/**
 * Keys der Link-Pipeline und der Renders im Cloud-Modus.
 *
 * Ohne Supabase-Auth gibt es noch keine `user_id` — Projekte leben im lokalen
 * Workspace des Browsers. Die Keys hängen deshalb an Job-, Projekt- und
 * Render-IDs; sobald Accounts dazukommen, wandert der `user_id`-Präfix davor.
 */
export const workspaceKeys = {
  /** Alles eines Pipeline-Jobs liegt unter diesem Präfix. */
  job: (jobId: string) => `pipeline/${jobId}/`,
  proxy: (jobId: string) => `pipeline/${jobId}/proxy.mp4`,
  thumbnail: (jobId: string, index: number) => `pipeline/${jobId}/thumbs/${index}.jpg`,
  upload: (projectId: string) => `uploads/${projectId}/source`,
  render: (renderId: string) => `renders/${renderId}/clip.mp4`,
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

/** Presigned Download-URL, die der Browser als Datei speichert statt abzuspielen. */
export async function getAttachmentUrl(key: string, filename: string, expiresIn = 3600): Promise<string> {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    }),
    { expiresIn },
  )
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getR2Client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }))
    return true
  } catch {
    return false
  }
}

/**
 * Lädt eine lokale Datei hoch — als Multipart, weil ein Proxy einer
 * einstündigen Quelle schnell ein Gigabyte groß ist.
 */
export async function uploadFile(key: string, file: string, contentType: string): Promise<void> {
  await new Upload({
    client: getR2Client(),
    params: { Bucket: bucket(), Key: key, Body: createReadStream(file), ContentType: contentType },
    partSize: 16 * 1024 * 1024,
    queueSize: 4,
  }).done()
}

/** Löscht alle Objekte unter einem Präfix (bis zu 1.000 pro Durchgang). */
export async function deletePrefix(prefix: string): Promise<void> {
  const client = getR2Client()
  let token: string | undefined
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }))
    const keys = (page.Contents ?? []).flatMap((object) => (object.Key ? [{ Key: object.Key }] : []))
    if (keys.length > 0) {
      // DeleteObjects meldet einzelne Fehlschläge in der Antwort, nicht als Ausnahme.
      const result = await client.send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys } }))
      if (result.Errors?.length) throw new Error(`${result.Errors.length} Dateien unter ${prefix} konnten nicht gelöscht werden.`)
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
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
