import 'server-only'

import { access, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import type { CropKeyframe, TranscriptWord } from '@/types/database'
import type { PipelineJob, PipelineResult, PipelineSegment } from '@/types/pipeline'
import { FPS } from '@/types/editor'
import { analyzeTranscript, describeAiFailure, hasAiProvider, type ClipSegment } from '@/services/ai/analyze'
import { alignReference, readCaptionCues, readCaptionWords } from '@/services/ai/captions'
import { analyzeStructure } from '@/services/ai/structure'
import { CLIP_LENGTH_RANGES, clipCountFor, findClipSegments } from '@/services/ai/heuristic'
import { sliceWordsForClip, transcribeFile } from '@/services/ai/transcribe'
import { createProxy, extractAudio, extractPortraitFrame, probe } from '@/services/video/ffmpeg'
import { computeCropKeyframes, fallbackKeyframes } from '@/services/video/reframe'
import { downloadCaptions, downloadVideo, fetchSourceInfo, findReferenceTrack, readChapters, UserFacingError } from '@/services/video/source'
import { computeWaveform } from '@/services/video/waveform'
import { assertCreditsAvailable, chargeSourceCredits } from '@/services/billing/credits'

/**
 * Link → fertige Clips, als eine Folge von Schritten.
 *
 * Dieselben Schritte wie die Trigger.dev-Kette in `src/trigger/README.md`
 * (ingest → transcribe → analyze → reframe), nur im Node-Prozess des
 * Next-Servers und mit dem lokalen Dateisystem statt R2. Wer die Pipeline
 * später auf Worker verlegt, ruft dieselben Service-Funktionen auf.
 *
 * Jeder Schritt prüft, ob sein Ergebnis schon auf der Platte liegt. Ein nach
 * einem Server-Neustart wieder aufgenommener Job lädt dadurch nicht erneut
 * herunter.
 */

export interface RunContext {
  directory: string
  signal: AbortSignal
  /** Cloud workers charge after the media upload has succeeded. */
  deferBilling?: boolean
  report: (patch: Partial<Pick<PipelineJob, 'status' | 'progress' | 'message' | 'title' | 'thumbnailUrl' | 'durationSeconds'>>) => void
}

const exists = (file: string) => access(file).then(() => true, () => false)

export async function runPipeline(job: PipelineJob, { directory, signal, report, deferBilling = false }: RunContext): Promise<PipelineResult> {
  const infoPath = path.join(directory, 'info.json')
  const proxyPath = path.join(directory, 'proxy.mp4')
  const preferredLanguage = job.settings.language === 'auto' ? null : job.settings.language
  const notices: string[] = []

  // --- 1. Herunterladen ----------------------------------------------------
  report({ status: 'downloading', progress: 0, message: 'Video wird geladen' })
  let caption = job.caption
  let sourceSeconds = job.durationSeconds
  if (!(await exists(infoPath))) {
    // Auf dem Worker (Cloud-Modus) prüft erst dieser Schritt den Link — der
    // Next-Server hat dort kein yt-dlp.
    const info = await fetchSourceInfo(job.url, infoPath, preferredLanguage, signal)
    caption = info.caption
    sourceSeconds = info.durationSeconds
    report({ title: info.title, thumbnailUrl: info.thumbnailUrl, durationSeconds: info.durationSeconds })
  }
  // Abgerechnet wird die Länge des Ausgangsvideos. Reicht das Guthaben
  // nicht, soll weder heruntergeladen noch transkribiert werden.
  if (job.userId) await assertCreditsAvailable(job.userId, sourceSeconds)

  // Untertitel werden immer mitgenommen, auch wenn Deepgram konfiguriert ist:
  // Fällt Deepgram aus, sind sie der Rückfall.
  const captionsPath = caption ? await downloadCaptions(infoPath, directory, caption, signal) : null

  if (!(await exists(proxyPath))) {
    const sourcePath = await downloadVideo(infoPath, directory, {
      signal,
      onProgress: (progress) => report({ progress }),
    })
    report({ progress: null, message: 'Video wird für den Editor vorbereitet' })
    const source = await probe(sourcePath, signal)
    const temporary = path.join(directory, 'proxy.partial.mp4')
    await createProxy(sourcePath, temporary, source, { signal, onProgress: (progress) => report({ progress }) })
    await rename(temporary, proxyPath)
    await rm(sourcePath, { force: true })
  }

  const media = await probe(proxyPath, signal)
  if (!media.hasAudio) throw new UserFacingError('Das Video hat keine Tonspur. Ohne Sprache gibt es nichts zu schneiden.')
  // Erst jetzt steht die Länge sicher fest (Google Drive nennt sie vorher nicht).
  if (job.userId) await assertCreditsAvailable(job.userId, media.durationSeconds)

  // --- 2. Transkribieren -----------------------------------------------------
  report({ status: 'transcribing', progress: null, message: 'Sprache wird erkannt' })
  let words: TranscriptWord[] | null = null
  let transcriptSource: PipelineResult['transcriptSource'] = 'youtube-captions'
  let language: string | null = caption ? caption.key.split('-')[0] : job.sourceLanguage

  if (process.env.DEEPGRAM_API_KEY) {
    const audioPath = path.join(directory, 'audio.m4a')
    try {
      await extractAudio(proxyPath, audioPath, signal)
      const transcript = await transcribeFile(audioPath, preferredLanguage ?? job.sourceLanguage?.split('-')[0] ?? null, signal)
      words = transcript.words
      language = transcript.language
      transcriptSource = 'deepgram'
    } catch (error) {
      if (signal.aborted) throw error
      console.error('[pipeline] Deepgram fehlgeschlagen', error)
      notices.push('Die Deepgram-Transkription ist fehlgeschlagen, verwendet wurden die YouTube-Untertitel.')
    } finally {
      await rm(audioPath, { force: true })
    }
  }

  if (!words && captionsPath) {
    words = await readCaptionWords(captionsPath)
    // YouTubes Spracherkennung schreibt oft ohne Satzzeichen. Gibt es dazu
    // manuelle Untertitel, liefern die Satzzeichen und Schreibung — ohne sie
    // weiß die Auswahl nicht, wo ein Satz endet.
    const reference = caption ? await findReferenceTrack(infoPath, caption) : null
    const referencePath = reference ? await downloadCaptions(infoPath, directory, reference, signal, 'reference') : null
    if (referencePath) {
      const aligned = alignReference(words, await readCaptionCues(referencePath))
      // Nur übernehmen, wenn die Spuren wirklich zusammenpassen — eine
      // Übersetzung oder eine andere Schnittfassung würde sonst Unsinn einsetzen.
      if (aligned.matched >= words.length * 0.5) words = aligned.words
    }
  }

  if (!words) {
    throw new UserFacingError(
      process.env.DEEPGRAM_API_KEY
        ? 'Das Video konnte nicht transkribiert werden. Bitte später erneut versuchen.'
        : 'Für dieses Video gibt es keine Untertitel. Für die eigene Transkription trage DEEPGRAM_API_KEY in .env.local ein.',
    )
  }
  if (words.length < 15) throw new UserFacingError('Im Video wurde kaum Sprache erkannt.')

  const { peaks } = await computeWaveform(proxyPath, media.durationSeconds)

  // Sätze und Themen: Beide Auswahlwege schneiden nur noch entlang dieser Gliederung.
  const structure = analyzeStructure(words, await readChapters(infoPath))

  // --- 3. Analysieren ------------------------------------------------------
  const useAi = hasAiProvider()
  report({ status: 'analyzing', message: useAi ? 'Redaktionelle Kandidaten werden gesucht' : 'Ungeprüfte Schnittvorschläge werden gesucht' })

  const range = CLIP_LENGTH_RANGES[job.settings.clipLength] ?? CLIP_LENGTH_RANGES.auto
  const maxClips = clipCountFor(media.durationSeconds)
  let segments: ClipSegment[] = []
  let analysis: PipelineResult['analysis'] = 'heuristic'

  if (useAi) {
    try {
      segments = await analyzeTranscript({
        structure,
        durationSeconds: media.durationSeconds,
        maxClips,
        lengthRange: range,
        topic: job.settings.topic,
        signal,
        onPhase: (phase) => report({ message: phase === 'review'
          ? 'Hook, Spannungsbogen und Mehrwert werden geprüft'
          : 'Redaktionelle Kandidaten werden gesucht' }),
      })
      analysis = 'ai'
    } catch (error) {
      if (signal.aborted) throw error
      console.error('[pipeline] KI-Analyse fehlgeschlagen', error)
      notices.push(`Die redaktionelle KI-Prüfung ist fehlgeschlagen: ${describeAiFailure(error)} Die Schnittvorschläge sind regelbasiert und inhaltlich ungeprüft; ihre Scores sind keine Viralitätsbewertung.`)
    }
  }

  // Eine erfolgreich leere KI-Auswahl ist ein Qualitätsurteil. Sie darf nicht
  // mit schwächeren Ersatzclips aufgefüllt werden.
  if (analysis !== 'ai') {
    if (!useAi) notices.push('Ohne KI-Prüfung entstehen nur regelbasierte, inhaltlich ungeprüfte Schnittvorschläge. Ihre Scores sind keine Viralitätsbewertung.')
    segments = findClipSegments({
      structure,
      durationSeconds: media.durationSeconds,
      maxClips,
      range,
      topic: job.settings.topic,
      language,
    })
    analysis = 'heuristic'
  }
  if (segments.length === 0) throw new UserFacingError(analysis === 'ai'
    ? 'Keine Passage erfüllt die redaktionellen Kriterien für Hook, vollständigen Spannungsbogen und Mehrwert innerhalb der gewählten Cliplänge. Probiere eine andere Cliplänge oder ein anderes Video.'
    : 'Im Video wurde innerhalb der gewählten Cliplänge kein geeigneter Schnittvorschlag gefunden. Die inhaltliche KI-Prüfung ist nicht verfügbar.')

  // --- 4. Zuschnitt --------------------------------------------------------
  // Pro Clip Gesichter verfolgen und den aktiven Sprecher bestimmen. Scheitert
  // das bei einem Clip, bekommt er den Mittelausschnitt — ein fehlender
  // Kameraschwenk ist kein Grund, die fertigen Clips wegzuwerfen.
  report({ status: 'reframing', progress: 0, message: 'Sprecher werden erkannt' })
  const result: PipelineSegment[] = []
  let reframeFailures = 0
  for (const [index, segment] of segments.entries()) {
    // Beide Auswahlwege liefern bereits geprüfte Satz-/Wortgrenzen.
    // Erneutes Rasten oder Padding verändert Inhalt und erlaubte Dauer.
    const bounds = { start: segment.start_seconds, end: segment.end_seconds }
    const clipWords = sliceWordsForClip(words, bounds.start, bounds.end)
    let cropKeyframes = fallbackKeyframes()
    try {
      cropKeyframes = await computeCropKeyframes({
        videoPath: proxyPath,
        startSeconds: bounds.start,
        endSeconds: bounds.end,
        sourceWidth: media.width,
        sourceHeight: media.height,
        words: clipWords,
        signal,
      })
    } catch (error) {
      if (signal.aborted) throw error
      console.error('[pipeline] Sprechererkennung fehlgeschlagen', error)
      reframeFailures++
    }
    // Das Vorschaubild zeigt den Clip kurz nach dem Einstieg — der erste
    // Frame ist oft noch ein Schnitt oder ein halber Blinzler.
    const thumbnailIndex = result.length
    const thumbnailTime = Math.min(0.8, (bounds.end - bounds.start) / 4)
    const thumbnailWindow = Math.min(3, (bounds.end - bounds.start) / 2)
    const focus = keyframeAt(cropKeyframes, Math.round((thumbnailTime + thumbnailWindow / 2) * FPS))
    const thumbnailUrl = await extractPortraitFrame(proxyPath, thumbnailPath(directory, thumbnailIndex), {
      time: bounds.start + thumbnailTime,
      window: thumbnailWindow,
      centerX: focus.x,
      centerY: focus.y,
      sourceWidth: media.width,
      sourceHeight: media.height,
    }, signal).then(
      () => `/api/pipeline/${job.id}/thumbnails/${thumbnailIndex}`,
      (error) => {
        if (signal.aborted) throw error
        console.error('[pipeline] Vorschaubild fehlgeschlagen', error)
        return null
      },
    )

    result.push({
      ...segment,
      start_seconds: bounds.start,
      end_seconds: bounds.end,
      words: clipWords,
      crop_keyframes: cropKeyframes,
      thumbnail_url: thumbnailUrl,
    })
    report({ progress: (index + 1) / segments.length })
  }
  if (reframeFailures > 0) {
    notices.push(`Bei ${reframeFailures === 1 ? 'einem Clip' : `${reframeFailures} Clips`} ist die Sprechererkennung fehlgeschlagen, dort sitzt der Ausschnitt mittig.`)
  }

  // Erst nach fertigen Clips abrechnen, nach Länge des Ausgangsvideos.
  // Wiederaufnahme desselben Jobs belastet dank der Job-Referenz in der
  // Datenbank kein zweites Mal.
  signal.throwIfAborted()
  if (job.userId && !deferBilling) await chargeSourceCredits(job.userId, job.id, media.durationSeconds)

  return {
    durationSeconds: media.durationSeconds,
    width: media.width,
    height: media.height,
    fps: media.fps,
    language,
    transcriptSource,
    analysis,
    notice: notices.join(' ') || null,
    peaks: peaks.map((peak) => Math.round(peak * 1000) / 1000),
    segments: result,
  }
}

/** Ablageort der Vorschaubilder im Arbeitsverzeichnis eines Jobs. */
export function thumbnailPath(directory: string, index: number): string {
  return path.join(directory, 'thumbs', `${index}.jpg`)
}

/** Die Kameraposition, die zu einem Frame gilt — der letzte Keyframe davor. */
function keyframeAt(keyframes: CropKeyframe[], frame: number): CropKeyframe {
  let current = keyframes[0] ?? { frame: 0, x: 0.5, y: 0.42, scale: 1 }
  for (const keyframe of keyframes) if (keyframe.frame <= frame) current = keyframe
  return current
}
