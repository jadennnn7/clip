import 'server-only'

import { readFile } from 'node:fs/promises'
import type { TranscriptWord } from '@/types/database'

/**
 * Wandelt YouTube-Untertitel (json3) in Wörter mit Zeitstempeln.
 *
 * Die automatische Spracherkennung von YouTube liefert pro Wort einen
 * Versatz (`tOffsetMs`) — genau genug für Untertitel, die das gerade
 * gesprochene Wort hervorheben. Damit funktioniert der Schnitt auch ohne
 * eigenen Transkriptionsdienst.
 *
 * Manuell hochgeladene Untertitel haben nur Zeiten pro Zeile, dafür aber
 * Satzzeichen und richtige Schreibung. Gibt es beide, übernimmt
 * `alignReference` den Text der manuellen Spur auf die Wortzeiten der
 * automatischen — ohne Satzzeichen weiß die Clip-Auswahl nicht, wo ein Satz
 * endet, und schneidet mitten in Gedanken.
 */

interface Json3Segment {
  utf8?: string
  tOffsetMs?: number
}

interface Json3Event {
  tStartMs?: number
  dDurationMs?: number
  segs?: Json3Segment[]
}

/** Geräuschmarker wie „[Musik]" gehören nicht in gesprochene Untertitel. */
const NOISE_MARKER = /^\[[^\]]*\]$|^\([^)]*\)$|^♪+$/

/** `>>` markiert in YouTube-Untertiteln einen Sprecherwechsel. */
const SPEAKER_MARKER = /^(>>|&gt;&gt;|-)$/

/** Ein Wort dauert selten länger — ohne Grenze reichte es bei einer Pause bis zur nächsten Zeile. */
const MAX_WORD_SECONDS = 1.2

async function readEvents(path: string): Promise<Json3Event[]> {
  const data = JSON.parse(await readFile(path, 'utf8')) as { events?: Json3Event[] }
  return data.events ?? []
}

export async function readCaptionWords(path: string): Promise<TranscriptWord[]> {
  return parseJson3(await readEvents(path))
}

export function parseJson3(events: Json3Event[]): TranscriptWord[] {
  const timed: Array<{ word: string; start: number; eventEnd: number }> = []
  const appendSpan = (words: string[], start: number, end: number, eventEnd: number) => {
    const weights = words.map((word) => word.length + 1)
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    let cursor = start
    for (let i = 0; i < words.length; i++) {
      timed.push({ word: words[i], start: cursor, eventEnd })
      cursor += (Math.max(0, end - start) * weights[i]) / total
    }
  }

  for (const event of events) {
    if (!event.segs || typeof event.tStartMs !== 'number') continue
    const eventStart = event.tStartMs / 1000
    const eventEnd = (event.tStartMs + (event.dDurationMs ?? 0)) / 1000
    const wordLevel = event.segs.some((segment) => typeof segment.tOffsetMs === 'number')

    if (wordLevel) {
      // Ein Segment kann eine ganze Wortgruppe enthalten. Sein Offset gilt
      // für deren Anfang, nicht für jedes Wort. Gleiche Offsets gemeinsam
      // verteilen, damit kein Wortstapel an einem einzigen Zeitpunkt entsteht.
      const spans: Array<{ start: number; words: string[] }> = []
      for (const segment of event.segs) {
        const start = eventStart + (segment.tOffsetMs ?? 0) / 1000
        const existing = spans.find((span) => span.start === start)
        if (existing) existing.words.push(...splitWords(segment.utf8))
        else spans.push({ start, words: splitWords(segment.utf8) })
      }
      spans.sort((a, b) => a.start - b.start)
      for (let i = 0; i < spans.length; i++) {
        appendSpan(spans[i].words, spans[i].start, Math.min(spans[i + 1]?.start ?? eventEnd, eventEnd), eventEnd)
      }
      continue
    }

    // Zeile ohne Wortzeiten: nach Zeichenzahl verteilen.
    const words = splitWords(event.segs.map((segment) => segment.utf8 ?? '').join(' '))
    appendSpan(words, eventStart, eventEnd, eventEnd)
  }

  timed.sort((a, b) => a.start - b.start)

  // Sprecherwechsel werden nicht zu Wörtern, sondern zur Sprechernummer der
  // folgenden Wörter — wie die Diarization von Deepgram.
  let speaker = 0
  let sawMarker = false
  const spoken: Array<{ word: string; start: number; eventEnd: number; speaker?: number }> = []
  for (const entry of timed) {
    if (SPEAKER_MARKER.test(entry.word)) {
      speaker = speaker === 0 ? 1 : 0
      sawMarker = true
      continue
    }
    spoken.push({ ...entry, speaker })
  }

  const result: TranscriptWord[] = []
  for (let i = 0; i < spoken.length; i++) {
    const current = spoken[i]
    const next = spoken[i + 1]
    const start = Math.max(current.start, result.at(-1)?.start ?? 0)
    const limit = Math.min(next ? next.start : current.eventEnd, current.eventEnd, start + MAX_WORD_SECONDS)
    const end = Math.max(start + 0.08, limit)
    result.push({
      word: current.word,
      start: round(start),
      end: round(end),
      ...(sawMarker ? { speaker: current.speaker } : {}),
    })
  }
  return result
}

function splitWords(text: string | undefined): string[] {
  if (!text) return []
  return text
    .replace(/&nbsp;|\u00a0/g, ' ')
    // Unsichtbare Zeichen (Zero-Width-Space u. ä.) stehen in manchen
    // Untertiteln zwischen Wörtern und landeten sonst im Clip-Text.
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, ' ')
    .replace(/&gt;&gt;/g, ' >> ')
    .replace(/>>/g, ' >> ')
    .replace(/\[[^\]]*\]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word && !NOISE_MARKER.test(word))
}

// --- Abgleich mit manuellen Untertiteln -------------------------------------

interface Cue {
  start: number
  end: number
  words: string[]
}

export async function readCaptionCues(path: string): Promise<Cue[]> {
  const cues: Cue[] = []
  for (const event of await readEvents(path)) {
    if (!event.segs || typeof event.tStartMs !== 'number') continue
    const words = splitWords(event.segs.map((segment) => segment.utf8 ?? '').join(' ')).filter((word) => !SPEAKER_MARKER.test(word))
    if (words.length === 0) continue
    cues.push({ start: event.tStartMs / 1000, end: (event.tStartMs + (event.dDurationMs ?? 0)) / 1000, words })
  }
  return cues.sort((a, b) => a.start - b.start)
}

/** Vergleichsform eines Worts: klein, ohne Satzzeichen, einheitliche Apostrophe. */
function normalize(word: string): string {
  return word.toLocaleLowerCase().replace(/[’`´]/g, "'").replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')
}

/**
 * Überträgt Satzzeichen und Schreibung der manuellen Untertitel auf die
 * Wörter der automatischen Erkennung — deren Zeiten bleiben unverändert.
 *
 * Zeile für Zeile statt über das ganze Transkript: Beide Spuren laufen
 * zeitlich parallel, also genügt pro Untertitelzeile ein kleiner Abgleich mit
 * den Wörtern desselben Zeitfensters. Ein globaler Abgleich wäre bei einer
 * Stunde Video eine Tabelle mit 60 Millionen Zellen.
 */
export function alignReference(words: TranscriptWord[], cues: Cue[]): { words: TranscriptWord[]; matched: number } {
  const result = words.map((word) => ({ ...word }))
  const normalized = words.map((word) => normalize(word.word))
  let cursor = 0
  let matched = 0

  for (const cue of cues) {
    while (cursor < words.length && words[cursor].start < cue.start - 2) cursor++
    let windowEnd = cursor
    while (windowEnd < words.length && words[windowEnd].start < cue.end + 1.5 && windowEnd - cursor < cue.words.length * 2 + 12) windowEnd++
    if (windowEnd <= cursor) continue

    const reference = cue.words.map(normalize)
    const pairs = alignSequences(normalized.slice(cursor, windowEnd), reference)
    // Nur Wörter, die in beiden Spuren vorkommen, übernehmen ihre Schreibung
    // samt Satzzeichen. Ein Satzende ohne Gegenstück wird bewusst nicht
    // verschoben: Auf das falsche Wort gesetzt („in the. city.") erzeugt es
    // eine Satzgrenze mitten im Satz — schlimmer als eine fehlende.
    let lastMatched = -1
    for (const [asrIndex, refIndex] of pairs) {
      const index = cursor + asrIndex
      result[index].word = cue.words[refIndex]
      lastMatched = index
      matched++
    }
    if (lastMatched >= 0) cursor = lastMatched + 1
  }
  return { words: result, matched }
}

/** Längste gemeinsame Teilfolge zweier kurzer Wortlisten, als Indexpaare. */
function alignSequences(a: string[], b: string[]): Array<[number, number]> {
  const rows = a.length + 1
  const columns = b.length + 1
  const table = new Uint16Array(rows * columns)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * columns + j] = a[i] && a[i] === b[j]
        ? table[(i + 1) * columns + j + 1] + 1
        : Math.max(table[(i + 1) * columns + j], table[i * columns + j + 1])
    }
  }
  const pairs: Array<[number, number]> = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] && a[i] === b[j]) { pairs.push([i, j]); i++; j++ }
    else if (table[(i + 1) * columns + j] >= table[i * columns + j + 1]) i++
    else j++
  }
  return pairs
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}
