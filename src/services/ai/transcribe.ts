import 'server-only'

import { DeepgramClient } from '@deepgram/sdk'
import type { TranscriptWord } from '@/types/database'

/**
 * Deepgram Nova-3 statt Whisper.
 *
 * Whisper liefert nur Timestamps auf Äußerungsebene, oft mehrere Sekunden
 * daneben. Für Untertitel, die das gerade gesprochene Wort hervorheben, ist das
 * unbrauchbar — man bräuchte zusätzlich WhisperX zur Forced Alignment.
 * Nova-3 liefert Wort-Timestamps und Diarization in einem Aufruf, bei
 * ~0,26 $ pro Stunde Audio.
 */
const MODEL = 'nova-3'

export interface TranscriptionResult {
  words: TranscriptWord[]
  fullText: string
  language: string
  /** Startzeiten der Äußerungen — Rasterpunkte für die Clip-Grenzen. */
  utteranceBoundaries: number[]
}

let client: DeepgramClient | null = null
function getClient() {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY ist nicht gesetzt.')
  // SDK v5: Konstruktor statt createClient(), Ressourcen unter listen.v1.media.
  client ??= new DeepgramClient({ apiKey })
  return client
}

/**
 * Transkribiert eine Audiodatei anhand einer URL.
 *
 * Es wird bewusst die URL übergeben statt der Bytes: Deepgram lädt die Datei
 * selbst, dadurch muss der Worker keine hundert Megabyte durch den eigenen
 * Prozess schleusen. Die URL ist eine presigned R2-URL mit kurzer Laufzeit.
 */
export async function transcribeFromUrl(
  audioUrl: string,
  language = 'de',
): Promise<TranscriptionResult> {
  const response = await getClient().listen.v1.media.transcribeUrl({
    url: audioUrl,
    model: MODEL,
    language,
    punctuate: true,
    // Beides ist für die Pipeline zwingend: `diarize` trennt Sprecher (Basis
    // für die Sprechererkennung beim Reframing), `utterances` liefert die
    // Satzgrenzen, an denen Clips geschnitten werden dürfen.
    diarize: true,
    utterances: true,
    smart_format: true,
  })

  // Die Antwort ist eine Union: Ohne `callback` kommt das Transkript direkt,
  // mit `callback` nur eine request_id. Hier wird synchron gearbeitet, also
  // ist die zweite Variante ein Konfigurationsfehler und kein Sonderfall.
  if (!('results' in response)) {
    throw new Error('Deepgram hat asynchron geantwortet — Callback-Modus ist hier nicht vorgesehen.')
  }

  const alternative = response.results?.channels?.[0]?.alternatives?.[0]
  if (!alternative) throw new Error('Deepgram hat kein Transkript zurückgegeben.')

  // Ausgelesen wird aus `utterances`, nicht aus `alternatives[0].words`:
  // Nur dort liefert Deepgram `punctuated_word`, und nur dort stehen die
  // Satzgrenzen, an denen Clips geschnitten werden dürfen (siehe
  // `utteranceBoundaries` unten). Ohne Satzzeichen würden die Untertitel als
  // durchgehende Kleinbuchstaben-Wurst erscheinen.
  const utterances = response.results?.utterances ?? []

  const words: TranscriptWord[] = utterances
    .flatMap((utterance) => utterance.words ?? [])
    .filter((word) => typeof word.start === 'number' && typeof word.end === 'number')
    .map((word) => ({
      word: word.punctuated_word ?? word.word ?? '',
      start: word.start as number,
      end: word.end as number,
      confidence: word.confidence,
      speaker: word.speaker,
    }))

  return {
    words,
    fullText: alternative.transcript ?? '',
    language,
    // Satzgrenzen als Sekundenwerte — die Clip-Grenzen werden darauf gerastet,
    // damit kein Clip mitten im Satz beginnt oder endet.
    utteranceBoundaries: utterances
      .map((utterance) => utterance.start)
      .filter((start): start is number => typeof start === 'number'),
  }
}

/** Rastet einen Zeitpunkt auf die nächstgelegene Satzgrenze. */
export function snapToUtterance(seconds: number, boundaries: number[]): number {
  if (boundaries.length === 0) return seconds
  return boundaries.reduce((closest, boundary) =>
    Math.abs(boundary - seconds) < Math.abs(closest - seconds) ? boundary : closest,
  )
}

/** Schneidet das Wort-Array auf einen Clip zu und normalisiert die Zeiten auf 0. */
export function sliceWordsForClip(
  words: TranscriptWord[],
  startSeconds: number,
  endSeconds: number,
): TranscriptWord[] {
  return words
    .filter((word) => word.start >= startSeconds && word.end <= endSeconds)
    .map((word) => ({
      ...word,
      start: Number((word.start - startSeconds).toFixed(3)),
      end: Number((word.end - startSeconds).toFixed(3)),
    }))
}
