import 'server-only'

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { CropKeyframe, TranscriptWord } from '@/types/database'
import { FPS } from '@/types/editor'
import { AbortError, FFMPEG, ProcessError } from '@/services/pipeline/process'

/**
 * 16:9 → 9:16 Reframing mit aktiver Sprechererkennung.
 *
 * Die Computer Vision läuft hier im Worker und erzeugt NUR ein Keyframe-Array.
 * Remotion interpoliert es später (siehe `remotion/reframe.ts`). Diese Trennung
 * hat drei Gründe:
 *   - Der Render bleibt deterministisch und schnell — kein CV im Renderpfad.
 *   - Die Kameraposition ist im Editor manuell korrigierbar, weil sie Daten
 *     sind und kein eingebrannter Effekt.
 *   - Ein erneuter Render nach einer Styling-Änderung muss die Analyse nicht
 *     wiederholen.
 *
 * Verfahren:
 *   1. Ein ffmpeg-Durchlauf liefert Einzelbilder (5 pro Sekunde) und die
 *      Szenenwechsel des Clips.
 *   2. Gesichter samt Lippenpunkten erkennen (face-api, TinyFaceDetector auf
 *      WebAssembly — ohne native Abhängigkeiten, lokal wie im Worker).
 *   3. Gesichter über die Bilder hinweg zu Spuren verbinden.
 *   4. Aktiver Sprecher = die Spur, deren Mundöffnung sich am stärksten
 *      bewegt. Gewechselt wird erst, wenn ein anderer Sprecher eine Weile klar
 *      dominiert — sonst springt die Kamera bei jedem Räuspern. Liegt eine
 *      Diarization vor (Deepgram), darf der Wechsel an deren Sprecherwechseln
 *      schneller passieren.
 *   5. „Kameramann"-Logik: Innerhalb einer Totzone bleibt die Kamera stehen,
 *      größere Bewegungen werden zu einem kurzen Schwenk, Sprecherwechsel und
 *      Szenengrenzen zu einem harten Schnitt.
 */

export interface ReframeOptions {
  videoPath: string
  /** Clip-Grenzen im Quellvideo. */
  startSeconds: number
  endSeconds: number
  sourceWidth: number
  sourceHeight: number
  /** Wörter des Clips, relativ zum Clip-Start — für die Sprecherwechsel der Diarization. */
  words: TranscriptWord[]
  signal?: AbortSignal
}

/** Abtastrate der Analyse. Mundbewegung braucht mehr als 2 Bilder pro Sekunde, mehr als 5 bringt kaum etwas. */
const SAMPLE_FPS = 5
const SAMPLE_WIDTH = 416
/** Schwelle des ffmpeg-Szenenfilters (0..1). */
const SCENE_THRESHOLD = 0.3
/** So weit darf das Gesicht von der Bildmitte abweichen, bevor die Kamera nachzieht (Anteil der Quellbreite). */
const DEAD_ZONE = 0.05
/** Dauer eines Nachführ-Schwenks. */
const PAN_FRAMES = Math.round(0.5 * FPS)
/**
 * So weit schaut die Kamera voraus (in Abtastbildern). Die Analyse kennt den
 * ganzen Clip: Der Schwenk beginnt, bevor das Gesicht den Bildrand erreicht,
 * statt ihm hinterherzulaufen.
 */
const LOOKAHEAD_SAMPLES = 2
/** So lange muss ein anderer Sprecher dominieren, bevor geschnitten wird. */
const SWITCH_HOLD_SECONDS = 1.2
const SWITCH_HOLD_AT_DIARIZATION_SECONDS = 0.4

/**
 * Rückfallposition, wenn die Erkennung nichts findet.
 *
 * Ein statischer, leicht nach oben versetzter Mittelausschnitt. Die Mitte ist
 * bei Talking-Head-Material fast immer brauchbar, und Gesichter sitzen in der
 * oberen Bildhälfte — ein exakt mittiger Crop schneidet regelmäßig die Stirn ab.
 */
export function fallbackKeyframes(): CropKeyframe[] {
  return [{ frame: 0, x: 0.5, y: 0.42, scale: 1 }]
}

// --- Gesichtserkennung ------------------------------------------------------

type FaceApi = typeof import('@vladmandic/face-api/dist/face-api.node-wasm.js')

let faceApi: Promise<FaceApi> | null = null

/** Lädt Backend und Modelle einmal pro Prozess (rund 200 ms). */
function loadFaceApi(): Promise<FaceApi> {
  faceApi ??= (async () => {
    const handlersBefore = {
      uncaughtException: new Set(process.listeners('uncaughtException')),
      unhandledRejection: new Set(process.listeners('unhandledRejection')),
    }
    const loaded = (await import('@vladmandic/face-api/dist/face-api.node-wasm.js')) as FaceApi & { default?: FaceApi }
    const api = loaded.default ?? loaded
    // Die Typen von face-api bilden nur einen Ausschnitt von tfjs ab; die
    // Backend-Auswahl gehört nicht dazu, existiert zur Laufzeit aber.
    const tf = api.tf as unknown as { setBackend(name: string): Promise<boolean>; ready(): Promise<void> }
    await tf.setBackend('wasm')
    await tf.ready()
    // Das WebAssembly-Modul (emscripten) hängt beim Laden globale Handler an
    // `uncaughtException` und `unhandledRejection`, die jeden Fehler erneut
    // werfen. Für ein eigenständiges Skript gedacht — im Next-Server würde
    // damit jeder beliebige Fehler irgendwo den ganzen Prozess beenden.
    for (const listener of process.listeners('uncaughtException')) {
      if (!handlersBefore.uncaughtException.has(listener)) process.removeListener('uncaughtException', listener)
    }
    for (const listener of process.listeners('unhandledRejection')) {
      if (!handlersBefore.unhandledRejection.has(listener)) process.removeListener('unhandledRejection', listener)
    }
    // Die Gewichte liegen im npm-Paket selbst — kein Download zur Laufzeit.
    const packageJson = createRequire(path.join(process.cwd(), 'package.json')).resolve('@vladmandic/face-api/package.json')
    const modelDirectory = path.join(path.dirname(packageJson), 'model')
    await api.nets.tinyFaceDetector.loadFromDisk(modelDirectory)
    await api.nets.faceLandmark68TinyNet.loadFromDisk(modelDirectory)
    return api
  })()
  faceApi.catch(() => { faceApi = null })
  return faceApi
}

interface Face {
  /** Mittelpunkt und Größe, normalisiert auf 0..1 der Quelle. */
  x: number
  y: number
  width: number
  height: number
  /** Mundöffnung: Lippenabstand innen geteilt durch Mundbreite. */
  mouth: number
}

interface Sample {
  time: number
  faces: Face[]
  /** Bilddetail je Spalte (Kantenstärke) — für Szenen ohne Gesicht. */
  detail: Float32Array
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Ein ffmpeg-Prozess, zwei Ausgaben: Rohbilder für die Erkennung auf stdout,
 * Szenenwechsel über `showinfo` auf stderr. Das Video wird so nur einmal
 * dekodiert.
 */
async function analyzeFrames(options: ReframeOptions, api: FaceApi): Promise<{ samples: Sample[]; scenes: number[] }> {
  const { videoPath, startSeconds, endSeconds, sourceWidth, sourceHeight, signal } = options
  const width = SAMPLE_WIDTH
  const height = Math.max(2, Math.round((SAMPLE_WIDTH * sourceHeight) / sourceWidth / 2) * 2)
  const frameBytes = width * height * 3

  const child = spawn(FFMPEG, [
    '-nostats', '-hide_banner', '-v', 'info',
    '-ss', startSeconds.toFixed(3), '-t', (endSeconds - startSeconds).toFixed(3), '-i', videoPath,
    '-filter_complex',
    // `eq(n,0)`: Das erste Bild geht immer durch. Ohne Szenenwechsel bekäme
    // der zweite Ausgang sonst kein einziges Bild, und ffmpeg bricht am Ende
    // mit Fehler ab — bei Ein-Kamera-Aufnahmen also fast immer. Zeitpunkte
    // nahe 0 filtert der Aufrufer ohnehin heraus.
    `[0:v]scale=${width}:${height},split=2[a][b];[a]fps=${SAMPLE_FPS},format=rgb24[frames];[b]select='eq(n\\,0)+gt(scene\\,${SCENE_THRESHOLD})',showinfo[scenes]`,
    '-map', '[frames]', '-f', 'rawvideo', 'pipe:1',
    '-map', '[scenes]', '-f', 'null', '-',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })

  const onAbort = () => child.kill('SIGTERM')
  signal?.addEventListener('abort', onAbort, { once: true })

  const scenes: number[] = []
  let stderrTail = ''
  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8')
    stderrTail = (stderrTail + text).slice(-4000)
    for (const match of text.matchAll(/Parsed_showinfo.*?pts_time:\s*([\d.]+)/g)) scenes.push(Number(match[1]))
  })
  const exited = new Promise<number | null>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', resolve)
  })

  const detectorOptions = new api.TinyFaceDetectorOptions({ inputSize: SAMPLE_WIDTH, scoreThreshold: 0.45 })
  const samples: Sample[] = []
  let pending: Buffer = Buffer.alloc(0)

  try {
    // `for await` pausiert den Stream, solange ein Bild ausgewertet wird —
    // ffmpeg dekodiert also nie weit voraus, der Speicher bleibt klein.
    for await (const chunk of child.stdout as AsyncIterable<Buffer>) {
      pending = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk
      while (pending.length >= frameBytes) {
        const frame = new Uint8Array(pending.subarray(0, frameBytes))
        pending = pending.subarray(frameBytes)
        const tensor = api.tf.tensor3d(frame, [height, width, 3], 'int32')
        try {
          const detections = await api.detectAllFaces(tensor, detectorOptions).withFaceLandmarks(true)
          samples.push({
            time: samples.length / SAMPLE_FPS,
            detail: columnDetail(frame, width, height),
            faces: detections.flatMap(({ detection, landmarks }) => {
              const box = detection.box
              // Kleine Gesichter im Hintergrund (Publikum, Bilder an der Wand) sind nie der Sprecher.
              if (box.width / width < 0.04) return []
              const p = landmarks.positions
              const mouthWidth = distance(p[60], p[64]) || 1
              const mouth = (distance(p[61], p[67]) + distance(p[62], p[66]) + distance(p[63], p[65])) / (3 * mouthWidth)
              return [{
                x: (box.x + box.width / 2) / width,
                y: (box.y + box.height / 2) / height,
                width: box.width / width,
                height: box.height / height,
                mouth,
              }]
            }),
          })
        } finally {
          tensor.dispose()
        }
      }
    }
    const code = await exited
    if (signal?.aborted) throw new AbortError()
    if (code !== 0) throw new ProcessError('ffmpeg', code, stderrTail)
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }

  return { samples, scenes: scenes.filter((time) => time > 0.2 && time < endSeconds - startSeconds - 0.2) }
}

/**
 * Wie viel Bildinhalt in jeder Spalte steckt: Summe der Helligkeitssprünge
 * zu den Nachbarpixeln. Eine weiße Folienfläche ergibt null, Schrift und
 * Zeichnungen viel. Jede zweite Zeile genügt dafür.
 */
function columnDetail(rgb: Uint8Array, width: number, height: number): Float32Array {
  const detail = new Float32Array(width)
  const luma = (x: number, y: number) => {
    const i = (y * width + x) * 3
    return rgb[i] * 0.299 + rgb[i + 1] * 0.587 + rgb[i + 2] * 0.114
  }
  for (let y = 0; y < height - 2; y += 2) {
    for (let x = 0; x < width - 1; x++) {
      const here = luma(x, y)
      detail[x] += Math.abs(luma(x + 1, y) - here) + Math.abs(luma(x, y + 2) - here)
    }
  }
  return detail
}

/**
 * Ausschnitt für eine Szene ohne Gesicht (Folie, Präsentation, B-Roll).
 *
 * Die Bildmitte ist dort oft leer — eine Zeichnung steht links, die Mitte ist
 * weiße Fläche. Gewählt wird deshalb das Fenster mit dem meisten Bildinhalt.
 * Die Mitte bleibt, solange kein anderes Fenster deutlich mehr zeigt: Bei
 * gleichmäßigem Bild soll die Kamera nicht grundlos zur Seite wandern.
 */
function salientCenter(samples: Sample[], from: number, to: number, visible: number): number {
  const width = samples[from]?.detail.length ?? 0
  if (width === 0 || visible >= 1) return 0.5
  const total = new Float32Array(width)
  for (let index = from; index < to; index++) {
    const detail = samples[index].detail
    for (let x = 0; x < width; x++) total[x] += detail[x]
  }

  const window = Math.max(1, Math.round(visible * width))
  let sum = 0
  for (let x = 0; x < window; x++) sum += total[x]
  let best = sum
  let bestStart = 0
  for (let start = 1; start + window <= width; start++) {
    sum += total[start + window - 1] - total[start - 1]
    if (sum > best) { best = sum; bestStart = start }
  }

  const centerStart = Math.round((width - window) / 2)
  let center = 0
  for (let x = centerStart; x < centerStart + window; x++) center += total[x]
  if (best <= 0 || best < center * 1.25) return 0.5
  return (bestStart + window / 2) / width
}

// --- Spuren und Sprecher --------------------------------------------------

interface Track {
  id: number
  points: Array<{ index: number; face: Face }>
}

/** Verbindet die Gesichter aufeinanderfolgender Bilder zu Spuren (nächster Nachbar mit Größenprüfung). */
function buildTracks(samples: Sample[], from: number, to: number): Track[] {
  const tracks: Track[] = []
  let nextId = 0
  for (let index = from; index < to; index++) {
    const open = tracks.filter((track) => index - track.points[track.points.length - 1].index <= SAMPLE_FPS)
    const taken = new Set<number>()
    const faces = [...samples[index].faces].sort((a, b) => b.width - a.width)
    for (const face of faces) {
      let best: Track | null = null
      let bestDistance = Infinity
      for (const track of open) {
        if (taken.has(track.id)) continue
        const last = track.points[track.points.length - 1].face
        const ratio = face.width / last.width
        const gap = distance(face, last)
        if (ratio > 0.6 && ratio < 1.6 && gap < 0.15 && gap < bestDistance) {
          best = track
          bestDistance = gap
        }
      }
      if (best) {
        best.points.push({ index, face })
        taken.add(best.id)
      } else {
        tracks.push({ id: nextId++, points: [{ index, face }] })
        taken.add(nextId - 1)
      }
    }
  }
  // Spuren, die kürzer als eine halbe Sekunde halten, sind Fehlerkennungen.
  return tracks.filter((track) => track.points.length >= Math.ceil(SAMPLE_FPS / 2))
}

/** Wie stark sich der Mund einer Spur um ein Bild herum bewegt (Standardabweichung der Öffnung). */
function mouthActivity(track: Track, index: number): number {
  const window = track.points.filter((point) => Math.abs(point.index - index) <= Math.round(0.7 * SAMPLE_FPS))
  if (window.length < 3) return 0
  const mean = window.reduce((sum, point) => sum + point.face.mouth, 0) / window.length
  const variance = window.reduce((sum, point) => sum + (point.face.mouth - mean) ** 2, 0) / window.length
  // Größere Gesichter leicht bevorzugen: Die Hauptperson steht meist vorn.
  return Math.sqrt(variance) * (1 + Math.min(0.5, track.points[0].face.width))
}

function positionAt(track: Track, index: number): Face | null {
  let nearest: Face | null = null
  let nearestGap = Infinity
  for (const point of track.points) {
    const gap = Math.abs(point.index - index)
    if (gap < nearestGap) { nearest = point.face; nearestGap = gap }
  }
  return nearestGap <= SAMPLE_FPS ? nearest : null
}

/** Sprecherwechsel laut Diarization, in Sekunden relativ zum Clip-Start. */
function diarizationChanges(words: TranscriptWord[]): number[] {
  const changes: number[] = []
  for (let i = 1; i < words.length; i++) {
    const previous = words[i - 1].speaker
    const current = words[i].speaker
    if (previous !== undefined && current !== undefined && previous !== current) changes.push(words[i].start)
  }
  return changes
}

// --- Kamerafahrt -----------------------------------------------------------

export async function computeCropKeyframes(options: ReframeOptions): Promise<CropKeyframe[]> {
  // Hochkant- oder fast quadratische Quellen brauchen keinen seitlichen Ausschnitt.
  if (options.sourceWidth / options.sourceHeight < 0.8) return fallbackKeyframes()

  const api = await loadFaceApi()
  const { samples, scenes } = await analyzeFrames(options, api)

  const changes = diarizationChanges(options.words)
  const sceneStarts = [0, ...scenes.map((time) => Math.round(time * SAMPLE_FPS))]
    .filter((index, i, all) => index < samples.length && (i === 0 || index > all[i - 1]))

  const keyframes: CropKeyframe[] = []
  // Als Objekt statt `let`: Die Hilfsfunktionen unten setzen die Kamera, und
  // TypeScript verfolgt Zuweisungen in Closures nicht.
  const view: { camera: { x: number; y: number } | null } = { camera: null }
  const toFrame = (index: number) => Math.round((index / SAMPLE_FPS) * FPS)
  const push = (frame: number, position: { x: number; y: number }) => {
    // Ein späterer Schnitt ersetzt einen noch nicht erreichten Schwenk-Endpunkt.
    while (keyframes.length > 0 && frame <= keyframes[keyframes.length - 1].frame) keyframes.pop()
    keyframes.push({ frame, x: round(position.x), y: round(position.y), scale: 1 })
    view.camera = position
  }
  const cut = (index: number, position: { x: number; y: number }) => {
    const frame = toFrame(index)
    if (view.camera && frame > 0) push(frame - 1, view.camera)
    push(frame, position)
  }

  for (let scene = 0; scene < sceneStarts.length; scene++) {
    const from = sceneStarts[scene]
    const to = sceneStarts[scene + 1] ?? samples.length
    const tracks = buildTracks(samples, from, to)
    if (tracks.length === 0) {
      // Szene ohne Gesicht (B-Roll, Folie): dorthin, wo das Bild etwas zeigt.
      const visible = Math.min(1, (9 / 16) / (options.sourceWidth / options.sourceHeight))
      cut(from, { x: round(salientCenter(samples, from, to, visible)), y: 0.42 })
      continue
    }

    let speaker: Track | null = null
    let challenger: Track | null = null
    let challengerSince = from

    for (let index = from; index < to; index++) {
      const visible = tracks.filter((track) => positionAt(track, index))
      if (visible.length === 0) continue

      const ranked = visible
        .map((track) => ({ track, activity: mouthActivity(track, index) }))
        .sort((a, b) => b.activity - a.activity)
      const loudest = ranked[0]

      if (!speaker || !visible.includes(speaker)) {
        // Erster Sprecher der Szene oder der bisherige ist verschwunden.
        speaker = loudest.track
        challenger = null
        cut(index, focus(positionAt(speaker, index)!))
        continue
      }

      const current = ranked.find((entry) => entry.track === speaker)!.activity
      if (loudest.track !== speaker && loudest.activity > current * 1.3 + 0.01) {
        if (challenger !== loudest.track) { challenger = loudest.track; challengerSince = index }
        const time = index / SAMPLE_FPS
        const hold = changes.some((change) => Math.abs(change - time) < 0.8) ? SWITCH_HOLD_AT_DIARIZATION_SECONDS : SWITCH_HOLD_SECONDS
        if ((index - challengerSince) / SAMPLE_FPS >= hold) {
          speaker = loudest.track
          challenger = null
          // Geschnitten wird dort, wo der neue Sprecher angefangen hat.
          cut(challengerSince, focus(positionAt(speaker, challengerSince) ?? positionAt(speaker, index)!))
        }
      } else {
        challenger = null
      }

      // Nachführen innerhalb derselben Einstellung, geglättet über ±2 Bilder
      // und mit Blick auf die Position in 0,4 s.
      const smoothed = smoothPosition(speaker, Math.min(to - 1, index + LOOKAHEAD_SAMPLES)) ?? smoothPosition(speaker, index)
      if (view.camera && smoothed && Math.abs(smoothed.x - view.camera.x) > DEAD_ZONE) {
        const frame = toFrame(index)
        push(frame, view.camera)
        push(frame + PAN_FRAMES, focus(smoothed))
      }
    }
  }

  return keyframes.length > 0 ? keyframes : fallbackKeyframes()
}

function smoothPosition(track: Track, index: number): Face | null {
  const window = track.points.filter((point) => Math.abs(point.index - index) <= 2)
  if (window.length === 0) return null
  const xs = window.map((point) => point.face.x).sort((a, b) => a - b)
  const ys = window.map((point) => point.face.y).sort((a, b) => a - b)
  return { ...window[0].face, x: xs[Math.floor(xs.length / 2)], y: ys[Math.floor(ys.length / 2)] }
}

/** Das Gesicht sitzt im oberen Drittel des Ausschnitts, nicht genau in der Mitte. */
function focus(face: Face): { x: number; y: number } {
  return { x: face.x, y: Math.min(0.6, Math.max(0.3, face.y + face.height * 0.35)) }
}

const round = (value: number) => Math.round(value * 1000) / 1000
