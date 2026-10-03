import type { CaptionStyle, TranscriptWord } from '@/types/database'
import { COMPOSITION_WIDTH, type CaptionChunk } from '../../src/types/editor'

/**
 * Wie Wörter zu Untertiteln werden.
 *
 * Früher entschied allein die Wortzahl: immer drei Wörter, egal wo. Heraus
 * kamen Zeilen wie „That's crazy. It" — ein Satzende mitten im Untertitel,
 * der nächste Satz schon angerissen. So sehen Untertitel auf TikTok oder
 * Reels nie aus. Dort folgt jeder Untertitel dem Sprechrhythmus: Er endet am
 * Satzende, an einer Pause oder einem Komma, nie nach „the" oder „und", und
 * ein einzelnes Wort bleibt nicht allein übrig.
 *
 * Genau das rechnet `chunkWords` aus: Zwischen den harten Grenzen
 * (Sprecherwechsel, lange Pause) sucht eine kleine dynamische Optimierung die
 * Aufteilung mit den natürlichsten Umbrüchen. „Wörter pro Zeile" ist dabei
 * die Obergrenze, keine Vorgabe.
 */

/** Seitlicher Rand der Untertitel im 1080er-Bild — Layout und Umbruch rechnen damit. */
export const CAPTION_SIDE_PADDING = 72

/** Ab dieser Pause beginnt immer ein neuer Untertitel. */
const HARD_PAUSE = 0.7
/** Eine Pause dieser Länge soll möglichst nicht mitten in einem Untertitel liegen. */
const SOFT_PAUSE = 0.35
/** Bis zu dieser Lücke bleibt ein Untertitel stehen, bis der nächste kommt — sonst flackert er. */
const HOLD_GAP = 0.7
/** Nach dem letzten Wort bleibt ein Untertitel so lange stehen, wenn danach Stille folgt. */
const LINGER = 0.3

const TRAILING_CLOSERS = `["'»«“”‘’)\\]]*`
const SENTENCE_END = new RegExp(`[.!?…]${TRAILING_CLOSERS}$`)
const CLAUSE_END = new RegExp(`(?:[,;:]|--|[–—])${TRAILING_CLOSERS}$`)
const TRAILING_MARKS = new RegExp(`(?:[.,;:…]|-{2,}|[–—])+(${TRAILING_CLOSERS})$`)
/** „z.B.", „U.S.", „Dr." — Punkte, die keinen Satz beenden. */
const ABBREVIATION = /^(?:\p{L}\.){2,}$|^(?:mr|mrs|ms|dr|prof|st|vs|etc|ca|bzw|usw|nr|inkl|evtl|ggf|vgl)\.$/iu

/**
 * Wörter, nach denen ein Untertitel nicht enden soll: Artikel, Präpositionen,
 * Konjunktionen, Pronomen am Satzanfang. „Ich war in der | Stadt" liest sich
 * holprig, „Ich war | in der Stadt" nicht.
 */
const CLINGING = new Set([
  // Englisch
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'into', 'about', 'and', 'or', 'but', 'so', 'if', 'as',
  'that', 'this', 'these', 'those', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'i', "i'm", "i've", "i'll", 'you', "you're",
  'we', "we're", 'they', "they're", 'he', 'she', 'is', 'are', 'was', 'were', 'be', 'been', 'not', "don't", "can't", 'very', 'just', 'really',
  'how', 'what', 'why', 'when', 'where', 'who', 'because', 'than', 'then', 'like',
  // Deutsch
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines', 'und', 'oder', 'aber', 'zu', 'zum', 'zur',
  'im', 'in', 'am', 'an', 'auf', 'aus', 'mit', 'von', 'vom', 'für', 'bei', 'beim', 'nach', 'über', 'unter', 'vor', 'ich', 'du', 'wir', 'ihr',
  'er', 'es', 'ist', 'sind', 'war', 'bin', 'hat', 'habe', 'dass', 'wenn', 'weil', 'als', 'wie', 'nicht', 'kein', 'keine', 'mein', 'meine',
  'dein', 'deine', 'sein', 'seine', 'unser', 'unsere', 'sehr', 'noch', 'schon', 'ganz', 'was', 'warum', 'wo', 'wer', 'dann', 'denn',
])

const bare = (word: string) => word.toLocaleLowerCase().replace(/[’`´]/g, "'").replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')

const endsSentence = (word: string) => SENTENCE_END.test(word) && !ABBREVIATION.test(word.trim())
const endsClause = (word: string) => CLAUSE_END.test(word)

/**
 * Das Wort, wie es im Bild steht.
 *
 * Punkt, Komma und Auslassungspunkte verschwinden, wie in den Untertiteln
 * großer Creator: In 80 px großer Schrift wirkt jeder Punkt wie ein Fleck.
 * Frage- und Ausrufezeichen tragen Ton und bleiben — aber einfach, nicht als
 * „??" oder „!!!". Mit `punctuation: true` bleibt der Text unverändert.
 */
export function captionText(word: string, style: Pick<CaptionStyle, 'punctuation'>): string {
  const text = word.trim()
  if (style.punctuation === true) return text
  return text
    .replace(/^(?:…|\.{2,}|-{2,})+/, '')
    .replace(/\?{2,}/g, '?')
    .replace(/!{2,}/g, '!')
    .replace(TRAILING_MARKS, '$1')
    .trim()
}

/**
 * Wie viele Zeichen ungefähr in eine Zeile passen. Geschätzt statt gemessen:
 * Die Aufteilung muss im Render und im Editor ohne DOM gleich ausfallen.
 */
export function captionLineChars(style: CaptionStyle): number {
  // Nur der Familienname, ohne `../fonts`: Auch der SRT-Export teilt so auf,
  // und das Dashboard soll dafür nicht alle Schrift-Metadaten laden.
  const family = style.fontFamily.split(',')[0]?.replace(/["']/g, '').trim().toLowerCase() ?? ''
  const condensed = family === 'anton' || family === 'bebas neue' || family === 'oswald'
  const capsOnly = family === 'bebas neue' || family === 'bangers'
  let width = condensed ? 0.46 : family === 'bangers' ? 0.5 : family === 'playfair display' || family === 'dm serif display' ? 0.54 : 0.58
  if (style.uppercase && !capsOnly) width *= 1.17
  const boxed = Boolean(style.background) && (style.backgroundOpacity ?? 1) > 0
  const available = COMPOSITION_WIDTH - 2 * CAPTION_SIDE_PADDING - (boxed ? style.fontSize * 0.68 : 0) - style.strokeWidth * 2
  return Math.max(6, Math.floor(available / (Math.max(8, style.fontSize) * width)))
}

interface Run {
  words: TranscriptWord[]
  texts: string[]
}

/** Harte Grenzen: Sprecherwechsel und lange Pausen. */
function splitRuns(words: TranscriptWord[], style: CaptionStyle): Run[] {
  const runs: Run[] = []
  let current: Run | null = null
  let previous: TranscriptWord | null = null
  for (const word of words) {
    const text = captionText(word.word, style)
    if (!text) continue
    const hard = !current || !previous ||
      word.start - previous.end > HARD_PAUSE ||
      (word.speaker !== undefined && previous.speaker !== undefined && word.speaker !== previous.speaker)
    if (hard || !current) {
      current = { words: [], texts: [] }
      runs.push(current)
    }
    current.words.push(word)
    current.texts.push(style.uppercase ? text.toLocaleUpperCase() : text)
    previous = word
  }
  return runs
}

/**
 * Teilt einen Lauf in Untertitel mit den geringsten Kosten.
 *
 * Kosten entstehen für jeden Untertitel (weniger, dafür vollere sind ruhiger),
 * quadratisch mit seiner Länge (ausgewogen statt 6 + 1), für Satzenden und
 * Pausen mitten im Untertitel und für Umbrüche an schlechter Stelle.
 */
function splitRun(run: Run, maxWords: number, budget: number): Array<[number, number]> {
  const { words, texts } = run
  const n = words.length
  if (n === 0) return []
  const chars = [0]
  for (let i = 0; i < n; i++) chars.push(chars[i] + texts[i].length + (i > 0 ? 1 : 0))

  const sentence = words.map((word) => endsSentence(word.word))
  const clause = words.map((word) => endsClause(word.word))
  const pauseAfter = words.map((word, i) => (i + 1 < n ? words[i + 1].start - word.end : 0))

  const partCost = (from: number, to: number): number => {
    const count = to - from
    const length = chars[to] - chars[from] - (from > 0 ? 1 : 0)
    if (count > maxWords || (count > 1 && length > budget)) return Infinity
    let cost = 0.5 + 0.045 * count * count
    for (let i = from; i < to - 1; i++) {
      if (sentence[i]) cost += 1.6
      else if (clause[i]) cost += 0.35
      if (pauseAfter[i] > SOFT_PAUSE) cost += 0.8
    }
    // Ein einzelnes Wort blitzt nur kurz auf. Als eigener Satz („Yeah.") ist
    // es in Ordnung, sonst ist es ein Rest, den man besser verteilt.
    if (count === 1 && n > 1) cost += sentence[from] ? 0.4 : 1.2
    // Kürzer als ein Drittel Sekunde liest kaum jemand mit.
    if (words[to - 1].end - words[from].start < 0.35 && n > count) cost += 0.6
    // Umbruch danach: am Satzende gratis, an Komma oder Pause billig.
    if (to < n) {
      const last = to - 1
      if (sentence[last] || pauseAfter[last] > SOFT_PAUSE) cost += 0
      else if (clause[last]) cost += 0.3
      else if (CLINGING.has(bare(words[last].word))) cost += 1.4
      else cost += 0.8
    }
    return cost
  }

  const best = new Array<number>(n + 1).fill(Infinity)
  const from = new Array<number>(n + 1).fill(0)
  best[0] = 0
  for (let to = 1; to <= n; to++) {
    for (let start = Math.max(0, to - maxWords); start < to; start++) {
      if (best[start] === Infinity) continue
      const cost = best[start] + partCost(start, to)
      if (cost < best[to]) {
        best[to] = cost
        from[to] = start
      }
    }
  }

  const parts: Array<[number, number]> = []
  for (let to = n; to > 0; to = from[to]) parts.unshift([from[to], to])
  return parts
}

/**
 * Gruppiert Wörter zu Untertiteln.
 *
 * Ein Untertitel bleibt stehen, bis der nächste beginnt, solange die Lücke
 * kurz ist — ohne das würde er in jeder Atempause verschwinden und wieder
 * auftauchen. Nach einer echten Pause verschwindet er kurz nach dem letzten
 * Wort, statt sekundenlang über Schweigen zu stehen.
 */
export function chunkWords(words: TranscriptWord[], style: CaptionStyle): CaptionChunk[] {
  const maxWords = Math.max(1, Math.round(style.wordsPerLine))
  // Höchstens zwei Zeilen; ein Einzelwort-Stil bleibt einzeilig.
  const budget = captionLineChars(style) * (maxWords <= 2 ? 1 : 2)
  const chunks: CaptionChunk[] = []

  for (const run of splitRuns(words, style)) {
    for (const [from, to] of splitRun(run, maxWords, budget)) {
      const group = run.words.slice(from, to)
      chunks.push({ words: group, start: group[0].start, end: group[group.length - 1].end })
    }
  }

  for (let i = 0; i < chunks.length; i++) {
    const next = chunks[i + 1]
    if (!next) {
      chunks[i].end += LINGER
      continue
    }
    chunks[i].end = next.start - chunks[i].end <= HOLD_GAP ? next.start : Math.min(next.start, chunks[i].end + LINGER)
  }

  return chunks
}
