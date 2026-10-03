import 'server-only'

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

/**
 * Liefert eine lokale Datei mit Range-Unterstützung aus.
 *
 * Range-Requests sind für Video Pflicht: Ohne sie kann der Browser nicht an
 * eine Stelle springen, ohne vorher alles davor zu laden — Scrubbing in einem
 * einstündigen Video wäre unbenutzbar.
 */
export async function serveFile(
  request: Request,
  file: string,
  options: { contentType: string; downloadName?: string; cacheControl?: string },
): Promise<Response> {
  const size = await stat(file).then((info) => info.size, () => null)
  if (size === null) return new Response('Nicht gefunden', { status: 404 })

  const headers = new Headers({
    'Content-Type': options.contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': options.cacheControl ?? 'private, max-age=86400',
  })
  if (options.downloadName) headers.set('Content-Disposition', contentDisposition(options.downloadName))

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  if (!range || (!range[1] && !range[2])) {
    headers.set('Content-Length', String(size))
    return new Response(request.method === 'HEAD' ? null : fileStream(file), { headers })
  }

  let start = range[1] ? Number(range[1]) : size - Number(range[2])
  let end = range[1] && range[2] ? Number(range[2]) : size - 1
  start = Math.max(0, start)
  end = Math.min(end, size - 1)
  if (!Number.isFinite(start) || start > end) {
    headers.set('Content-Range', `bytes */${size}`)
    return new Response(null, { status: 416, headers })
  }

  headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
  headers.set('Content-Length', String(end - start + 1))
  return new Response(request.method === 'HEAD' ? null : fileStream(file, start, end), { status: 206, headers })
}

/** Dateiname für den Download — ASCII-Fallback plus RFC 5987 für Umlaute. */
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/**
 * Datei als Web-Stream, der Abbrüche verträgt.
 *
 * Nicht `Readable.toWeb()`: Bricht der Browser einen Range-Request ab — beim
 * Springen im Video ständig —, schreibt dessen Adapter weiter in den schon
 * geschlossenen Controller und wirft eine Exception, die niemand fängt.
 * Hier wird der Dateistream bei Abbruch zerstört, und Schreiben in einen
 * geschlossenen Controller ist abgefangen.
 */
function fileStream(file: string, start?: number, end?: number): ReadableStream<Uint8Array> {
  const stream = createReadStream(file, start === undefined ? undefined : { start, end })
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on('data', (chunk) => {
        try {
          controller.enqueue(new Uint8Array(chunk as Buffer))
          // Gegendruck: nicht schneller lesen, als der Client abnimmt.
          if ((controller.desiredSize ?? 1) <= 0) stream.pause()
        } catch {
          stream.destroy()
        }
      })
      stream.on('end', () => { try { controller.close() } catch { /* schon geschlossen */ } })
      stream.on('error', (error) => { try { controller.error(error) } catch { /* schon geschlossen */ } })
    },
    pull() {
      stream.resume()
    },
    cancel() {
      stream.destroy()
    },
  }, { highWaterMark: 4 })
}
