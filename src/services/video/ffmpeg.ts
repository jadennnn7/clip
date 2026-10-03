import 'server-only'

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { FFMPEG, FFPROBE, runProcess } from '@/services/pipeline/process'

export interface ProbeResult {
  durationSeconds: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
  videoCodec: string | null
  audioCodec: string | null
}

/**
 * FFmpeg-Operationen des Ingest-Schritts.
 *
 * Diese laufen auf dem Trigger.dev-Worker, nicht in einer Serverless-Function:
 * das Transkodieren eines einstündigen Videos überschreitet jedes
 * Serverless-Zeitlimit deutlich. Lokal ruft sie die Pipeline in
 * `services/pipeline` direkt im Node-Prozess auf.
 */

interface FfprobeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  r_frame_rate?: string
}

/** Liest Metadaten aus, bevor irgendetwas anderes passiert. */
export async function probe(inputPath: string, signal?: AbortSignal): Promise<ProbeResult> {
  const output = await runProcess(
    FFPROBE,
    ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', inputPath],
    { captureStdout: true, signal },
  )
  const data = JSON.parse(output) as { streams?: FfprobeStream[]; format?: { duration?: string } }
  const video = data.streams?.find((stream) => stream.codec_type === 'video')
  const audio = data.streams?.find((stream) => stream.codec_type === 'audio')
  const durationSeconds = Number(data.format?.duration)

  if (!video || !video.width || !video.height) throw new Error('Die Datei enthält keine lesbare Videospur.')
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Die Videolänge konnte nicht bestimmt werden.')

  return {
    durationSeconds,
    width: video.width,
    height: video.height,
    fps: parseFrameRate(video.avg_frame_rate) ?? parseFrameRate(video.r_frame_rate) ?? 30,
    hasAudio: Boolean(audio),
    videoCodec: video.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
  }
}

function parseFrameRate(value: string | undefined): number | null {
  if (!value) return null
  const [numerator, denominator] = value.split('/').map(Number)
  const rate = denominator ? numerator / denominator : numerator
  return Number.isFinite(rate) && rate > 0 ? Math.round(rate * 100) / 100 : null
}

/**
 * Extrahiert die Audiospur als 16 kHz Mono für die Transkription.
 *
 * 16 kHz Mono ist das, womit Spracherkennungsmodelle arbeiten — höher
 * aufgelöstes Audio hochzuladen kostet Zeit und ändert das Ergebnis nicht.
 * Das Format folgt der Dateiendung: `.wav` für PCM, sonst AAC. AAC ist rund
 * zehnmal kleiner als WAV, und der Upload zu Deepgram ist der langsamste Teil
 * dieses Schritts.
 */
export async function extractAudio(inputPath: string, outputPath: string, signal?: AbortSignal): Promise<void> {
  const codec = outputPath.endsWith('.wav') ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'aac', '-b:a', '48k']
  await runProcess(FFMPEG, ['-y', '-v', 'error', '-i', inputPath, '-vn', '-ac', '1', '-ar', '16000', ...codec, outputPath], { signal })
}

/**
 * Erzeugt das 720p-Proxy für den Editor.
 *
 * Der Editor spielt niemals die Originaldatei ab. Ein 4K-Source wäre im
 * Browser-Scrubbing unbenutzbar und würde bei jedem Öffnen des Editors
 * Gigabyte an Transfer auslösen.
 *
 * Liegt die Quelle schon als H.264/AAC in höchstens 720p vor — der Normalfall,
 * weil der Download genau das anfordert —, wird nur umverpackt. Neu kodieren
 * würde bei einem einstündigen Video Minuten kosten und nichts verbessern.
 */
export async function createProxy(
  inputPath: string,
  outputPath: string,
  source: ProbeResult,
  options: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
): Promise<void> {
  const compatible =
    source.videoCodec === 'h264' &&
    (source.audioCodec === null || source.audioCodec === 'aac') &&
    source.height <= 720

  const codecArgs = compatible
    ? ['-c', 'copy']
    : ['-vf', 'scale=-2:min(720\\,ih)', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k']

  await runProcess(
    FFMPEG,
    // `+faststart` ist wichtig: ohne den Moov-Atom am Dateianfang muss der
    // Browser die gesamte Datei laden, bevor er abspielen kann.
    ['-y', '-v', 'error', '-progress', 'pipe:1', '-nostats', '-i', inputPath, ...codecArgs, '-movflags', '+faststart', outputPath],
    {
      signal: options.signal,
      onLine: (line) => {
        const match = /^out_time_us=(\d+)/.exec(line)
        if (match && options.onProgress) {
          options.onProgress(Math.min(1, Number(match[1]) / 1e6 / source.durationSeconds))
        }
      },
    },
  )
}

// Szenenwechsel erkennt `services/video/reframe.ts` im selben ffmpeg-Durchlauf
// wie die Gesichter — ein eigener Durchlauf würde jeden Clip zweimal dekodieren.

/**
 * Standbild eines Clips im Hochformat — das Vorschaubild in Bibliothek und
 * Übersicht.
 *
 * Ausgeschnitten wird genau der 9:16-Bereich, den die Kamerafahrt an dieser
 * Stelle zeigt. Ein mittiger Ausschnitt würde bei Gesprächen regelmäßig die
 * Lücke zwischen zwei Personen zeigen.
 */
export async function extractPortraitFrame(
  inputPath: string,
  outputPath: string,
  options: {
    time: number
    /** Zeitraum ab `time`, aus dem das repräsentativste Bild gewählt wird. */
    window?: number
    centerX: number
    centerY: number
    sourceWidth: number
    sourceHeight: number
    width?: number
  },
  signal?: AbortSignal,
): Promise<void> {
  const { time, window = 3, centerX, centerY, sourceWidth, sourceHeight, width = 540 } = options
  const portrait = 9 / 16
  const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2)
  const cropWidth = sourceWidth / sourceHeight > portrait ? even(sourceHeight * portrait) : even(sourceWidth)
  const cropHeight = sourceWidth / sourceHeight > portrait ? even(sourceHeight) : even(sourceWidth / portrait)
  const clamp = (value: number, max: number) => Math.round(Math.min(Math.max(value, 0), Math.max(0, max)))
  const x = clamp(centerX * sourceWidth - cropWidth / 2, sourceWidth - cropWidth)
  const y = clamp(centerY * sourceHeight - cropHeight / 2, sourceHeight - cropHeight)

  await mkdir(path.dirname(outputPath), { recursive: true })
  await runProcess(FFMPEG, [
    '-y', '-v', 'error', '-nostdin',
    '-ss', time.toFixed(3), '-t', window.toFixed(3), '-i', inputPath,
    '-frames:v', '1',
    // `thumbnail` wählt aus dem Zeitraum das Bild, das dem Durchschnitt am
    // nächsten ist — ein fester Zeitpunkt trifft sonst gern einen weißen
    // Folienübergang, einen Blitz oder einen halben Blinzler.
    '-vf', `fps=10,thumbnail=${Math.max(2, Math.round(window * 10))},crop=${cropWidth}:${cropHeight}:${x}:${y},scale=${width}:-2`,
    '-q:v', '4',
    outputPath,
  ], { signal })
}
