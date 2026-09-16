import 'server-only'

import { spawn } from 'node:child_process'
import type { WaveformData } from '@/types/editor'

/**
 * Berechnet die Wellenform-Peaks EINMAL beim Ingest.
 *
 * Der Editor lädt das Ergebnis als `peaks.json` aus R2. Die Alternative — das
 * Audio im Browser mit der Web Audio API zu dekodieren — blockiert bei einem
 * 60-Minuten-Video den Main-Thread für mehrere Sekunden und lädt nebenbei
 * zweistellige Megabyte, nur um eine Grafik zu zeichnen.
 *
 * `sampleCount` bestimmt die horizontale Auflösung. 1.800 Werte reichen für
 * jede realistische Bildschirmbreite und ergeben eine Datei von ~20 KB.
 */
export async function computeWaveform(
  audioPath: string,
  durationSeconds: number,
  sampleCount = 1800,
): Promise<WaveformData> {
  const samples = await decodePcm(audioPath)
  const bucketSize = Math.max(1, Math.floor(samples.length / sampleCount))
  const peaks: number[] = []

  for (let i = 0; i < sampleCount; i++) {
    let max = 0
    const from = i * bucketSize
    const to = Math.min(from + bucketSize, samples.length)
    for (let j = from; j < to; j++) {
      const value = Math.abs(samples[j])
      if (value > max) max = value
    }
    // Maximum statt Durchschnitt: Der Durchschnitt glättet Betonungen weg und
    // lässt jede Wellenform gleich aussehen.
    peaks.push(max / 32768)
  }

  return { peaks, duration: durationSeconds }
}

/** Dekodiert die Audiospur zu 16-bit PCM Mono, 8 kHz — mehr braucht eine Grafik nicht. */
function decodePcm(audioPath: string): Promise<Int16Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const ffmpeg = spawn('ffmpeg', [
      '-i', audioPath,
      '-ac', '1',
      '-ar', '8000',
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      '-',
    ])

    ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    ffmpeg.on('error', reject)
    ffmpeg.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg beendet mit Code ${code}`))
      const buffer = Buffer.concat(chunks)
      resolve(
        new Int16Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.length / 2)),
      )
    })
  })
}
