import 'server-only'

import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { serveFile } from '@/lib/server/serve-file'
import { deleteObject, getDownloadUrl, getUploadUrl, objectExists, workspaceKeys } from '@/lib/storage/r2'
import { isUuid, localDirectory } from '@/services/storage/local'
import { assertCloudStorage, isCloudMode } from '@/services/storage/mode'

/**
 * Hochgeladene Videos für den Render.
 *
 * Lokale Projekte halten ihr Video in der IndexedDB des Browsers — Chrome im
 * Renderer kommt da nicht heran. Vor dem ersten Render lädt der Browser die
 * Datei deshalb einmal hoch: lokal an den Next-Server, in der Cloud direkt
 * nach R2 (per presigned URL, an Vercel vorbei — dort sind Request-Bodies auf
 * wenige Megabyte begrenzt).
 */

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024

const sourceFile = (projectId: string) => path.join(localDirectory('uploads', projectId), 'source')
const typeFile = (projectId: string) => path.join(localDirectory('uploads', projectId), 'content-type')

export async function prepareUpload(projectId: string, contentType: string): Promise<{ uploadUrl: string; uploaded: boolean }> {
  if (!isUuid(projectId)) throw new Error('Ungültige Projekt-ID')
  if (isCloudMode()) {
    assertCloudStorage()
    const key = workspaceKeys.upload(projectId)
    return { uploadUrl: await getUploadUrl(key, contentType), uploaded: await objectExists(key) }
  }
  const uploaded = await stat(sourceFile(projectId)).then(() => true, () => false)
  return { uploadUrl: `/api/uploads/${projectId}`, uploaded }
}

/** Nur lokal: nimmt den Body entgegen und schreibt ihn gestreamt auf die Platte. */
export async function receiveLocalUpload(projectId: string, request: Request): Promise<void> {
  if (!isUuid(projectId) || !request.body) throw new Error('Kein Upload')
  await mkdir(localDirectory('uploads', projectId), { recursive: true })
  const partial = `${sourceFile(projectId)}.partial`
  let received = 0
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length
      callback(received > MAX_UPLOAD_BYTES ? new Error('Die Datei ist größer als 2 GB.') : null, chunk)
    },
  })
  try {
    await pipeline(Readable.fromWeb(request.body as unknown as WebReadableStream<Uint8Array>), limit, createWriteStream(partial))
    await rename(partial, sourceFile(projectId))
    await writeFile(typeFile(projectId), request.headers.get('content-type') || 'video/mp4')
  } catch (error) {
    await rm(partial, { force: true })
    throw error
  }
}

export async function uploadResponse(request: Request, projectId: string): Promise<Response> {
  if (!isUuid(projectId)) return new Response('Nicht gefunden', { status: 404 })
  if (isCloudMode()) return Response.redirect(await getDownloadUrl(workspaceKeys.upload(projectId)), 302)
  const contentType = await readFile(typeFile(projectId), 'utf8').catch(() => 'video/mp4')
  return serveFile(request, sourceFile(projectId), { contentType })
}

/** Adresse, unter der der Renderer das hochgeladene Video abholt. */
export async function uploadForRender(projectId: string, origin: string): Promise<string | null> {
  if (!isUuid(projectId)) return null
  return isCloudMode() ? getDownloadUrl(workspaceKeys.upload(projectId), 6 * 3600) : `${origin}/api/uploads/${projectId}`
}

export async function deleteUpload(projectId: string): Promise<void> {
  if (!isUuid(projectId)) return
  if (isCloudMode()) await deleteObject(workspaceKeys.upload(projectId))
  await rm(localDirectory('uploads', projectId), { recursive: true, force: true })
}
