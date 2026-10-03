import 'server-only'

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { FFMPEG, runProcess } from '@/services/pipeline/process'
import { FPS, type ClipCompositionProps } from '@/types/editor'
import type { OutputFormat } from '@/types/workspace'

/**
 * MP4-Render mit Remotion — lokal im Node-Prozess oder auf dem Trigger-Worker.
 *
 * Gerendert wird dieselbe `ClipComposition`, die der Player im Editor als
 * Vorschau zeigt. Es gibt keinen zweiten Renderpfad, der abweichen könnte:
 * Untertitel-Styling, Wortauswahl und Kamerafahrt sind in Vorschau und Datei
 * identisch.
 */

export const OUTPUT_DIMENSIONS: Record<OutputFormat, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
}

/** Alles, was ins Remotion-Bundle eingeht. Ändert sich davon etwas, wird neu gebündelt. */
const BUNDLE_INPUTS = ['remotion', 'src/types', 'src/lib/mock-data.ts']

const exists = (file: string) => access(file).then(() => true, () => false)

async function hashInputs(root: string): Promise<string> {
  const hash = createHash('sha256')
  const visit = async (relative: string) => {
    const absolute = path.join(root, relative)
    const entries = await readdir(absolute, { withFileTypes: true }).catch(() => null)
    if (!entries) {
      hash.update(relative).update(await readFile(absolute).catch(() => Buffer.alloc(0)))
      return
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) await visit(path.join(relative, entry.name))
  }
  for (const input of BUNDLE_INPUTS) await visit(input)
  return hash.digest('hex').slice(0, 16)
}

let current: { hash: string; serveUrl: Promise<string> } | null = null

/**
 * Bündelt `remotion/index.ts` mit webpack — einmal pro Codestand.
 *
 * Das Bündeln dauert 10–20 Sekunden. Das Ergebnis liegt deshalb unter einem
 * Hash der Quellen im Cache-Verzeichnis und wird wiederverwendet, auch über
 * Neustarts hinweg.
 */
export async function getServeUrl(cacheDirectory: string): Promise<string> {
  const root = process.cwd()
  const hash = await hashInputs(root)
  if (current?.hash === hash) return current.serveUrl

  const outDir = path.join(cacheDirectory, `remotion-bundle-${hash}`)
  const serveUrl = (async () => {
    if (await exists(path.join(outDir, 'index.html'))) return outDir
    // Bundles älterer Codestände werden nie wieder gebraucht (je ~35 MB).
    for (const entry of await readdir(cacheDirectory).catch(() => [] as string[])) {
      if (entry.startsWith('remotion-bundle-') && entry !== path.basename(outDir)) {
        await rm(path.join(cacheDirectory, entry), { recursive: true, force: true })
      }
    }
    const { bundle } = await import('@remotion/bundler')
    return bundle({
      entryPoint: path.join(root, 'remotion/index.ts'),
      outDir,
      // Die Composition importiert Typen und Presets über den Alias der App.
      webpackOverride: (config) => ({
        ...config,
        resolve: { ...config.resolve, alias: { ...(config.resolve?.alias ?? {}), '@': path.join(root, 'src') } },
      }),
    })
  })()
  current = { hash, serveUrl }
  serveUrl.catch(() => { if (current?.serveUrl === serveUrl) current = null })
  return serveUrl
}

export async function renderClipVideo({
  serveUrl,
  inputProps,
  outputFormat,
  outputPath,
  onProgress,
  signal,
}: {
  serveUrl: string
  inputProps: ClipCompositionProps
  outputFormat: OutputFormat
  outputPath: string
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}): Promise<void> {
  const { makeCancelSignal, renderMedia, selectComposition } = await import('@remotion/renderer')
  const { cancelSignal, cancel } = makeCancelSignal()
  signal?.addEventListener('abort', cancel, { once: true })
  let source: Awaited<ReturnType<typeof clipSource>> | null = null

  try {
    source = await clipSource(inputProps, signal)
    const props = source.props
    // Die Länge leitet `calculateMetadata` aus den Props ab; nur das Format
    // wird hier gesetzt, weil die Composition fest auf 9:16 registriert ist.
    const composition = await selectComposition({ serveUrl, id: 'Clip', inputProps: props })
    await renderMedia({
      serveUrl,
      composition: { ...composition, ...OUTPUT_DIMENSIONS[outputFormat] },
      inputProps: props,
      codec: 'h264',
      // Kompatibel mit jedem Player und jeder Plattform, auch Instagram.
      pixelFormat: 'yuv420p',
      outputLocation: outputPath,
      cancelSignal,
      onProgress: ({ progress }) => onProgress?.(progress),
    })
  } finally {
    signal?.removeEventListener('abort', cancel)
    await source?.close()
  }
}

/** Etwas Material über das Clip-Ende hinaus, damit der letzte Frame sicher drin ist. */
const SOURCE_TAIL_SECONDS = 1

/**
 * Nur das Stück der Quelle, das der Clip zeigt — lokal, für Remotion.
 *
 * `OffthreadVideo` lädt eine Quelle vor dem ersten Bild vollständig herunter.
 * Bei einem zweistündigen Video dauerte das länger als Remotions Zeitlimit
 * von 28 Sekunden, und der Render brach mit „delayRender() … was called but
 * not cleared" ab. ffmpeg holt per Range-Request nur den Abschnitt; ein
 * kurzer HTTP-Server auf 127.0.0.1 reicht ihn an Remotion weiter.
 *
 * Der Ausschnitt beginnt auf dem Frame, auf dem der Clip beginnt. Mit
 * `startSeconds: 0` liegt damit jeder Frame dort, wo er vorher lag —
 * Abschnitte, Wörter und Kamerafahrt zählen ohnehin ab Clip-Start.
 */
async function clipSource(
  inputProps: ClipCompositionProps,
  signal?: AbortSignal,
): Promise<{ props: ClipCompositionProps; close: () => Promise<void> }> {
  const unchanged = { props: inputProps, close: async () => {} }
  if (!/^https?:\/\//.test(inputProps.videoSrc)) return unchanged

  const directory = await mkdtemp(path.join(os.tmpdir(), 'omegaclip-source-'))
  const file = path.join(directory, 'source.mp4')
  const start = Math.round(inputProps.startSeconds * FPS) / FPS
  const length = inputProps.endSeconds - inputProps.startSeconds
  try {
    await runProcess(FFMPEG, [
      '-y', '-v', 'error', '-nostdin',
      // Vor `-i`: springt per Range-Request hin, statt alles davor zu laden.
      // Weil neu kodiert wird, sitzt der Schnitt trotzdem framegenau.
      '-ss', start.toFixed(3), '-i', inputProps.videoSrc,
      '-t', (length + SOURCE_TAIL_SECONDS).toFixed(3),
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      file,
    ], { signal })
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    if (signal?.aborted) throw error
    // Kurze Quellen rendern auch ohne Ausschnitt; lange laufen dann ins Zeitlimit.
    console.warn('[render] Ausschnitt der Quelle fehlgeschlagen, Remotion lädt die ganze Datei', error)
    return unchanged
  }

  const { size } = await stat(file)
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': size })
    if (request.method === 'HEAD') return response.end()
    createReadStream(file).pipe(response)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    props: { ...inputProps, videoSrc: `http://127.0.0.1:${port}/source.mp4`, startSeconds: 0, endSeconds: length },
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(directory, { recursive: true, force: true })
    },
  }
}
