import { task } from '@trigger.dev/sdk'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { downloadVideo, fetchSourceInfo } from '@/services/video/source'

export interface YoutubeAccessCheckOutput {
  ok: boolean
  step: 'metadata' | 'download' | 'done'
  title: string | null
  bytes: number | null
  error: string | null
  proxy: boolean
  cookies: boolean
}

/**
 * Kommt der Worker an YouTube vorbei? Einmal nach dem Deploy und nach jeder
 * Änderung an YTDLP_PROXY / YTDLP_COOKIES_BASE64 auslösen.
 *
 * Lokal lässt sich das nicht prüfen: Die Bot-Sperre trifft Rechenzentrums-IPs,
 * nicht den eigenen Anschluss. Getestet werden Metadaten UND Download — die
 * Video-Adressen verweigert YouTube teils auch dann, wenn die Metadaten
 * durchgehen. Standard ist das 19-Sekunden-Video „Me at the zoo“: klein und
 * seit 2005 online.
 */
export const youtubeAccessCheck = task({
  id: 'youtube-access-check',
  maxDuration: 5 * 60,
  retry: { maxAttempts: 1 },
  run: async (payload: { url?: string }, { signal }): Promise<YoutubeAccessCheckOutput> => {
    const url = payload.url ?? 'https://www.youtube.com/watch?v=jNQXAC9IVRw'
    const directory = await mkdtemp(path.join(os.tmpdir(), 'omegaclip-check-'))
    const result: YoutubeAccessCheckOutput = {
      ok: false,
      step: 'metadata',
      title: null,
      bytes: null,
      error: null,
      proxy: Boolean(process.env.YTDLP_PROXY),
      cookies: Boolean(process.env.YTDLP_COOKIES_BASE64?.trim()),
    }
    try {
      const infoPath = path.join(directory, 'info.json')
      result.title = (await fetchSourceInfo(url, infoPath, null, signal)).title
      result.step = 'download'
      result.bytes = (await stat(await downloadVideo(infoPath, directory, { signal }))).size
      result.step = 'done'
      result.ok = true
    } catch (error) {
      // Der genaue yt-dlp-Fehler und der Einrichtungshinweis stehen im Log des Runs.
      result.error = error instanceof Error ? error.message : String(error)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
    return result
  },
})
