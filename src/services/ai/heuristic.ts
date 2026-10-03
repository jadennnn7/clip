import 'server-only'

import type { ProjectSettings } from '@/types/workspace'
import type { ClipSegment } from './analyze'
import {
  FILLERS,
  STOPWORDS,
  firstContentWord,
  isPromotional,
  normalizeToken,
  pauseAfter,
  type TranscriptStructure,
} from './structure'

/**
 * Regelbasierte Clip-Auswahl — der Weg ohne `GEMINI_API_KEY`.
 *
 * Ohne semantische Prüfung können Satzgrenzen und Schlüsselwörter weder
 * einen vollständigen Gedanken noch einen guten Payoff belegen. Deshalb
 * liefert dieser Weg nur vorsichtige Vorschläge unter 60 Punkten. Klare
 * Ausschlussgründe werden gefiltert; die gewünschte Anzahl ist keine Quote.
 * Die Begründung nennt die fehlende redaktionelle Prüfung ausdrücklich.
 */

export interface LengthRange {
  min: number
  max: number
  target: number
}

export const CLIP_LENGTH_RANGES: Record<ProjectSettings['clipLength'], LengthRange> = {
  auto: { min: 20, max: 60, target: 35 },
  short: { min: 15, max: 30, target: 22 },
  medium: { min: 30, max: 60, target: 45 },
  long: { min: 60, max: 90, target: 75 },
}

/** Rund ein Clip pro zwei Minuten Quelle, ohne feste Obergrenze. */
export function clipCountFor(durationSeconds: number): number {
  return Number.isFinite(durationSeconds) ? Math.max(1, Math.floor(durationSeconds / 120)) : 1
}

// --- Wortlisten (Deutsch und Englisch, kleingeschrieben) -------------------

const QUESTION_WORDS = new Set([
  'warum', 'wieso', 'weshalb', 'wie', 'was', 'wer', 'wem', 'wen', 'wann', 'wo', 'welche', 'welcher', 'welches',
  'why', 'how', 'what', 'who', 'when', 'where', 'which',
])
/**
 * Hilfsverben am Satzanfang sind nur mit folgendem Pronomen eine Frage
 * („do you know" ja, „does not know" nein) — ohne Satzzeichen lässt sich das
 * sonst nicht ablesen.
 */
const QUESTION_AUXILIARIES = new Set([
  'hast', 'habt', 'hat', 'bist', 'seid', 'ist', 'kannst', 'kennst', 'weißt', 'glaubst', 'willst', 'würdest', 'sollte',
  'have', 'has', 'did', 'do', 'does', 'are', 'is', 'can', 'could', 'would', 'should', 'will', 'were',
])
const PRONOUNS = new Set(['du', 'ihr', 'sie', 'wir', 'ich', 'er', 'es', 'man', 'you', 'we', 'i', 'they', 'he', 'she', 'it', 'anyone', 'anybody'])
const NUMBER_WORDS = /^(zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|zwanzig|hundert|tausend|million|millionen|milliarde|milliarden|prozent|two|three|four|five|six|seven|eight|nine|ten|twenty|hundred|thousand|million|millions|billion|percent)$/
const ADDRESS = new Set(['du', 'dich', 'dir', 'dein', 'deine', 'deinen', 'ihr', 'euch', 'you', "you're", 'your', 'yourself'])
const STRONG = new Set([
  'nie', 'niemals', 'immer', 'niemand', 'jeder', 'jede', 'alle', 'keiner', 'fehler', 'geheimnis', 'wahrheit', 'problem',
  'wichtigste', 'größte', 'schlimmste', 'beste', 'eigentlich', 'tatsächlich', 'falsch', 'hör', 'stopp',
  'never', 'always', 'nobody', 'everyone', 'everybody', 'mistake', 'secret', 'truth', 'problem', 'most', 'biggest',
  'worst', 'best', 'actually', 'stop', 'wrong', 'nothing', 'everything',
])
const EMPHASIS = new Set([
  'unglaublich', 'verrückt', 'krass', 'wahnsinn', 'wahnsinnig', 'liebe', 'hasse', 'angst', 'geld', 'schock', 'katastrophe',
  'genial', 'brutal', 'absolut', 'komplett', 'extrem', 'sofort', 'plötzlich',
  'incredible', 'crazy', 'insane', 'love', 'hate', 'fear', 'money', 'shocking', 'disaster', 'amazing',
  'absolutely', 'completely', 'extremely', 'immediately', 'suddenly', 'huge', 'massive',
])
/** Einstiege, die an einen vorigen Satz anschließen — ohne ihn fehlt der Bezug. */
const CONNECTIVE_STARTS = new Set([
  'und', 'aber', 'weil', 'denn', 'oder', 'sondern', 'dass', 'deshalb', 'deswegen', 'zu', 'zum', 'zur', 'ob', 'als', 'dadurch', 'daher',
  'and', 'but', 'because', 'or', 'which', 'that', 'of', 'to', 'than', 'whether', 'therefore', 'plus',
])
/** Einstiege, die auf etwas Vorheriges zeigen („Das ist der Grund …", „It was …"). */
const REFERRING_STARTS = new Set([
  'das', 'dies', 'diese', 'dieser', 'dieses', 'er', 'es', 'dann', 'da', 'dort', 'damit', 'dafür', 'dazu', 'davon', 'darum', 'dem', 'den', 'denen',
  'it', 'this', 'that', 'they', 'he', 'she', 'these', 'those', 'then', 'there', 'which',
])

// --- Bewertung -------------------------------------------------------------

interface Signals {
  question: boolean
  number: boolean
  address: boolean
  strong: number
  connectiveStart: string | null
  referringStart: string | null
  /** Beginnt klein, obwohl das Transkript Sätze groß beginnt — also mitten im Satz. */
  midSentenceStart: boolean
  /** Beginnt am Anfang eines Kapitels oder Themas — und wie sicher diese Grenze ist. */
  startsTopic: boolean
  topicStrength: 'chapter' | 'enumeration' | 'transition' | 'lexical' | 'opening' | null
  startsChapter: boolean
  chapterTitle: string | null
  /** Endet dort, wo das nächste Thema beginnt — der Gedanke ist zu Ende erzählt. */
  endsTopic: boolean
  /** Themenwechsel mitten im Clip. */
  topicBreaks: number
  complete: boolean
  endsWithQuestion: boolean
  promotional: boolean
  wordsPerSecond: number
  fillerRatio: number
  pauseRatio: number
  emphasis: number
  cohesion: number
  topicHits: number
  lengthFit: number
}

interface Candidate {
  first: number
  last: number
  startWord: number
  score: number
  signals: Signals
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function measure(
  structure: TranscriptStructure,
  first: number,
  last: number,
  startWord: number,
  range: LengthRange,
  topicTerms: string[],
): Signals {
  const { words, sentences, topicStarts, chapterStarts, chapters, chapterOf, terms } = structure
  const endWord = sentences[last].to
  const tokens: string[] = []
  for (let i = startWord; i <= endWord; i++) tokens.push(normalizeToken(words[i].word))
  const length = sentences[last].end - words[startWord].start

  // Ein späteres Schlüsselwort rettet keinen schwachen Einstieg. Auch ein
  // langer erster Satz zählt nur mit dem, was in den ersten drei Sekunden fällt.
  const hookEnd = words[startWord].start + 3
  const hookTokens: string[] = []
  let hookHasQuestionMark = false
  for (let i = startWord; i <= endWord && words[i].start < hookEnd; i++) {
    hookTokens.push(tokens[i - startWord])
    if (words[i].word.includes('?')) hookHasQuestionMark = true
  }

  let pauses = 0
  for (let i = startWord; i < endWord; i++) {
    const pause = pauseAfter(words[i], words[i + 1])
    if (pause >= 0.45) pauses += pause
  }

  // Kohärenz: Wie viele Inhaltswörter kommen im Clip mehrfach vor? Ein Clip
  // über ein Thema wiederholt seine Schlüsselwörter, ein zusammengewürfelter nicht.
  const clipTerms = terms.slice(first, last + 1).flat()
  const counts = new Map<string, number>()
  for (const term of clipTerms) counts.set(term, (counts.get(term) ?? 0) + 1)
  const repeated = clipTerms.filter((term) => (counts.get(term) ?? 0) > 1).length

  let topicBreaks = 0
  for (let i = first + 1; i <= last; i++) if (topicStarts.has(i)) topicBreaks++

  const text = tokens.join(' ')
  const clipText = sentences.slice(first, last + 1).map((sentence) => sentence.text).join(' ')
  const lastText = sentences[last].text.trim()
  const lastTokens = lastText.split(/\s+/).map(normalizeToken)
  const chapter = chapterOf[first] >= 0 ? chapters[chapterOf[first]] : null

  return {
    question: hookHasQuestionMark || QUESTION_WORDS.has(hookTokens[0] ?? '') ||
      (QUESTION_AUXILIARIES.has(hookTokens[0] ?? '') && PRONOUNS.has(hookTokens[1] ?? '')),
    number: hookTokens.some((token) => /\d/.test(token) || NUMBER_WORDS.test(token)),
    address: hookTokens.some((token) => ADDRESS.has(token)),
    strong: hookTokens.filter((token) => STRONG.has(token)).length,
    connectiveStart: CONNECTIVE_STARTS.has(tokens[0] ?? '') ? tokens[0] : null,
    referringStart: REFERRING_STARTS.has(tokens[0] ?? '') ? tokens[0] : null,
    midSentenceStart: structure.cased && /^\p{Ll}/u.test(words[startWord].word) && tokens[0] !== 'i',
    startsTopic: topicStarts.has(first),
    topicStrength: first === 0 ? 'opening' : structure.topicStrength.get(first) ?? null,
    startsChapter: first === 0 ? chapters.length > 0 : chapterStarts.has(first),
    chapterTitle: chapter?.title || null,
    endsTopic: last === sentences.length - 1 || topicStarts.has(last + 1),
    topicBreaks,
    complete: sentences[last].complete,
    endsWithQuestion: /\?["'»”)]*$/.test(lastText) || (!structure.punctuated && (
      QUESTION_WORDS.has(lastTokens[0] ?? '') ||
      (QUESTION_AUXILIARIES.has(lastTokens[0] ?? '') && PRONOUNS.has(lastTokens[1] ?? ''))
    )),
    // Werbung zieht sich meist über einen ganzen Abschnitt; auch ein Clip aus
    // dessen Mitte, ohne das Wort „Sponsor", ist Werbung.
    promotional: isPromotional(clipText) || segmentIsPromotional(structure, first),
    wordsPerSecond: tokens.length / Math.max(1, length),
    fillerRatio: tokens.filter((token) => FILLERS.has(token)).length / Math.max(1, tokens.length),
    pauseRatio: pauses / Math.max(1, length),
    emphasis: tokens.filter((token) => EMPHASIS.has(token)).length / Math.max(1, tokens.length),
    cohesion: clipTerms.length > 0 ? repeated / clipTerms.length : 0,
    topicHits: topicTerms.filter((term) => text.includes(term)).length,
    lengthFit: 1 - Math.min(1, Math.abs(length - range.target) / Math.max(1, range.max - range.min)),
  }
}

/** Enthält der Themenabschnitt, in dem ein Satz liegt, Werbung? */
function segmentIsPromotional(structure: TranscriptStructure, sentence: number): boolean {
  const { sentences, topicStarts } = structure
  let from = sentence
  while (from > 0 && !topicStarts.has(from)) from--
  let to = sentence
  while (to + 1 < sentences.length && !topicStarts.has(to + 1)) to++
  for (let i = from; i <= to; i++) if (isPromotional(sentences[i].text)) return true
  return false
}

/** Wie viel ein Clip-Anfang an einer Themengrenze wert ist — nach Verlässlichkeit der Grenze. */
const TOPIC_START_BONUS = { chapter: 0.24, enumeration: 0.22, transition: 0.16, lexical: 0.1, opening: 0.08 } as const

function scoreSignals(signals: Signals): number {
  const hook = clamp01(
    (signals.question ? 0.4 : 0) +
      (signals.number ? 0.2 : 0) +
      (signals.address ? 0.15 : 0) +
      Math.min(0.3, signals.strong * 0.1) +
      0.15,
  )
  const pace = clamp01((signals.wordsPerSecond - 1.6) / 1.4)
  const emphasis = clamp01(signals.emphasis * 25)
  const filler = clamp01(signals.fillerRatio * 8)
  const pause = clamp01(signals.pauseRatio * 3)

  const raw =
    // Form: ein ganzer Gedanke. Das wiegt schwerer als jeder Hook — ein
    // starker Einstieg in einen abgebrochenen Gedanken ist trotzdem unbrauchbar.
    (signals.topicStrength ? TOPIC_START_BONUS[signals.topicStrength] : 0) +
    (signals.endsTopic ? 0.1 : 0) +
    (signals.complete ? 0.1 : -0.15) -
    signals.topicBreaks * 0.18 -
    (signals.connectiveStart ? 0.28 : 0) -
    (signals.referringStart ? 0.12 : 0) -
    (signals.midSentenceStart ? 0.22 : 0) -
    (signals.endsWithQuestion ? 0.15 : 0) -
    (signals.promotional ? 0.6 : 0) +
    0.1 * clamp01(signals.cohesion * 2) +
    // Handwerk: Einstieg, Tempo, Sprache.
    0.24 * hook +
    0.12 * pace +
    0.07 * emphasis +
    0.06 * signals.lengthFit -
    0.16 * filler -
    0.12 * pause

  // Dieser Wert sortiert ungeprüfte Vorschläge. Formale Indizien können
  // keinen redaktionell bestätigten, starken Clip ergeben.
  return Math.round(Math.min(59, Math.max(0, 20 + raw * 40)))
}

function isEligible(signals: Signals): boolean {
  if (!signals.complete || signals.endsWithQuestion || signals.promotional) return false
  if (signals.connectiveStart || signals.referringStart || signals.midSentenceStart) return false
  if (signals.topicBreaks > 0) return false
  // Direkte Ansprache allein ist kein Hook. Mindestens ein stärkeres Indiz
  // muss bereits im tatsächlichen Einstieg vorkommen.
  return signals.question || signals.number || signals.strong > 0
}

function explain(signals: Signals, hasTopic: boolean): string {
  const positives: string[] = []
  if (signals.startsChapter && signals.chapterTitle) positives.push(`beginnt mit dem Kapitel „${signals.chapterTitle}"`)
  else if (signals.startsTopic) positives.push('beginnt am Anfang eines Themas')
  if (signals.endsTopic && signals.topicBreaks === 0) positives.push('endet an einer erkannten Themengrenze')
  if (signals.question) positives.push('Einstieg mit einer Frage')
  if (signals.number) positives.push('konkrete Zahl im Einstieg')
  if (signals.address) positives.push('spricht die Zuschauer direkt an')
  if (signals.wordsPerSecond >= 2.4) positives.push(`zügiges Tempo (${signals.wordsPerSecond.toFixed(1).replace('.', ',')} Wörter/s)`)
  if (signals.emphasis > 0.015) positives.push('emotional aufgeladene Sprache')
  if (hasTopic && signals.topicHits > 0) positives.push('passt zum angegebenen Thema')

  const negatives: string[] = []
  if (signals.midSentenceStart) negatives.push('beginnt vermutlich mitten im Satz')
  else if (signals.connectiveStart) negatives.push(`beginnt mit „${signals.connectiveStart}" und braucht vermutlich Kontext`)
  else if (signals.referringStart) negatives.push(`„${signals.referringStart}" im ersten Satz verweist vermutlich auf Vorheriges`)
  if (signals.topicBreaks > 0) negatives.push('wechselt mittendrin das Thema')
  if (!signals.complete) negatives.push('endet nicht an einem Satzende')
  if (signals.endsWithQuestion) negatives.push('endet mit einer offenen Frage')
  if (signals.fillerRatio > 0.03) negatives.push('viele Füllwörter')
  if (signals.pauseRatio > 0.12) negatives.push('längere Sprechpausen')

  const parts = [`Ungeprüfter, regelbasierter Vorschlag (max. 59/100): ${positives.slice(0, 3).join(', ') || 'zusammenhängende Passage'}. Hook, Payoff und Teilenswert müssen redaktionell geprüft werden.`]
  if (negatives.length > 0) parts.push(`Abzug: ${negatives.slice(0, 2).join(', ')}.`)
  return parts.join(' ')
}

// --- Metadaten -------------------------------------------------------------

function sentenceCase(text: string, language: string | null): string {
  let value = text.trim()
  // YouTube-Erkennung liefert ohne manuelle Untertitel oft durchgehend Kleinschreibung.
  if (value === value.toLocaleLowerCase() && (language ?? '').startsWith('en')) value = value.replace(/\bi\b/g, 'I')
  return value.charAt(0).toLocaleUpperCase() + value.slice(1)
}

function truncateWords(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const cut = text.slice(0, maxChars + 1)
  const boundary = cut.lastIndexOf(' ')
  return `${cut.slice(0, boundary > maxChars * 0.5 ? boundary : maxChars).replace(/[,;:–-]+$/, '')}…`
}

const isTagCandidate = (token: string) =>
  token.length >= 5 && !STOPWORDS.has(token) && !/\d/.test(token) && !token.includes("'") && !token.includes('-')

/** Singular und Plural zählen als dasselbe Schlagwort („brain"/„brains", „Idee"/„Ideen"). */
function sameTag(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return long.startsWith(short) && ['', 's', 'es', 'e', 'n', 'en', 'er'].includes(long.slice(short.length))
}

/** Das häufigste Inhaltswort des ganzen Videos — das breite Hashtag, das jeder Clip trägt. */
function mainTopic(tokens: string[]): string | null {
  const counts = new Map<string, number>()
  for (const token of tokens) if (isTagCandidate(token)) counts.set(token, (counts.get(token) ?? 0) + 1)
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return top && top[1] >= 4 ? top[0] : null
}

function hashtagsFor(tokens: string[], globalCounts: Map<string, number>, topic: string | null): string[] {
  const local = new Map<string, number>()
  for (const token of tokens) if (isTagCandidate(token)) local.set(token, (local.get(token) ?? 0) + 1)

  const picked = topic ? [topic] : []
  const ranked = [...local.entries()]
    // Mehrfach im Clip, aber selten im Rest des Videos: Das ist das Thema dieses Clips.
    .filter(([, count]) => count >= 2)
    .map(([token, count]) => ({ token, weight: (count * count) / Math.sqrt(globalCounts.get(token) ?? 1) }))
    .sort((a, b) => b.weight - a.weight)
  for (const { token } of ranked) {
    if (picked.length >= 4) break
    if (picked.some((other) => sameTag(other, token))) continue
    picked.push(token)
  }
  return picked.map((token) => `#${token.replace(/[^\p{L}\p{N}]/gu, '')}`)
}

// --- Auswahl ---------------------------------------------------------------

/** Kapitel, aus denen kein Clip entstehen soll. */
const SKIPPED_CHAPTER = /^(intro|outro|einleitung|abspann|sponsor|werbung|anzeige|ad|end ?screen)\b/i

export function findClipSegments({
  structure,
  durationSeconds,
  maxClips,
  range,
  topic,
  language,
}: {
  structure: TranscriptStructure
  durationSeconds: number
  maxClips: number
  range: LengthRange
  topic: string
  language: string | null
}): ClipSegment[] {
  const { words, sentences, chapterStarts, chapters, chapterOf, topicStarts } = structure
  if (sentences.length === 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0 ||
    !Number.isFinite(maxClips) || maxClips < 1 ||
    !Number.isFinite(range.min) || !Number.isFinite(range.max) || !Number.isFinite(range.target) ||
    range.min <= 0 || range.max < range.min) return []
  const clipLimit = Math.floor(maxClips)

  const topicTerms = topic.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length >= 4)
  const hasTopic = topicTerms.length > 0
  const tokens = words.map((word) => normalizeToken(word.word))
  const globalCounts = new Map<string, number>()
  for (const token of tokens) globalCounts.set(token, (globalCounts.get(token) ?? 0) + 1)
  const topicTag = mainTopic(tokens)

  const skippedChapter = (index: number) => {
    const chapter = chapterOf[index] >= 0 ? chapters[chapterOf[index]] : null
    return Boolean(chapter && SKIPPED_CHAPTER.test(chapter.title))
  }

  const collect = () => {
    const found: Candidate[] = []
    for (let first = 0; first < sentences.length; first++) {
      if (sentences[first].startsMidSentence) continue
      if (skippedChapter(first)) continue
      const startWord = firstContentWord(structure, sentences[first])
      if (!Number.isFinite(words[startWord].start) || words[startWord].start < 0) continue
      for (let last = first; last < sentences.length; last++) {
        // Kapitel sind harte Grenzen: Kein Clip beginnt in einem und endet im nächsten.
        if (last > first && chapterStarts.has(last)) break
        // Niemals nachträglich am Quellenende kürzen: Das würde den zuvor
        // geprüften Satz und unter Umständen die Mindestdauer zerstören.
        if (!Number.isFinite(sentences[last].end) || sentences[last].end > durationSeconds) break
        const length = sentences[last].end - words[startWord].start
        if (length > range.max) break
        if (length < range.min) continue
        if (!sentences[last].complete) continue
        const signals = measure(structure, first, last, startWord, range, topicTerms)
        if (!isEligible(signals)) continue
        const score = scoreSignals(signals)
        // Füllwörter and pauses lower the ranking, but they should not erase a
        // otherwise complete, concrete passage; the editorial reviewer is the
        // final quality gate when AI is available.
        if (score < 30) continue
        found.push({ first, last, startWord, score, signals })
      }
    }
    return found
  }

  // Keine Auffüllrunde: Leeres Ergebnis ist besser als ein ungeeigneter Clip.
  const candidates = collect()
  // Themenwünsche entscheiden nur bei gleicher Qualität. Sie erhöhen weder
  // den Score noch umgehen sie einen Ausschlussgrund.
  candidates.sort((a, b) => b.score - a.score || b.signals.topicHits - a.signals.topicHits)

  // Vielfalt vor Menge: Erst der beste Clip je Thema, dann erst ein zweiter
  // aus einem Thema, das schon vertreten ist. Sonst stammen bei einem
  // langen, starken Kapitel alle Clips aus denselben fünf Minuten.
  const sortedStarts = [...topicStarts].sort((a, b) => a - b)
  const topicOf = (sentence: number) => {
    let topicIndex = 0
    for (const start of sortedStarts) if (start <= sentence) topicIndex = start
    return topicIndex
  }
  const picked: Candidate[] = []
  const overlaps = (candidate: Candidate) => picked.some((other) =>
    words[candidate.startWord].start < sentences[other.last].end + 1 && sentences[candidate.last].end > words[other.startWord].start - 1)
  const usedTopics = new Set<number>()
  for (const pass of [0, 1]) {
    for (const candidate of candidates) {
      if (picked.length >= clipLimit) break
      const topicIndex = topicOf(candidate.first)
      if (pass === 0 && usedTopics.has(topicIndex)) continue
      if (overlaps(candidate)) continue
      picked.push(candidate)
      usedTopics.add(topicIndex)
    }
  }

  return picked.map(({ first, last, startWord, score, signals }) => {
    const opening = words.slice(startWord, sentences[first].to + 1).map((word) => word.word).join(' ')
    let hook = opening
    if (hook.split(' ').length < 5 && first < last) hook = `${hook} ${sentences[first + 1].text}`
    const description = [opening, ...sentences.slice(first + 1, Math.min(last, first + 2) + 1).map((sentence) => sentence.text)].join(' ')

    return {
      // Exakt die geprüften Wortgrenzen, die Pipeline übernimmt sie unverändert.
      start_seconds: words[startWord].start,
      end_seconds: sentences[last].end,
      virality_score: score,
      title: truncateWords(sentenceCase(hook, language), 60),
      description: truncateWords(sentenceCase(description, language), 220),
      hashtags: hashtagsFor(tokens.slice(startWord, sentences[last].to + 1), globalCounts, topicTag),
      hook_text: truncateWords(sentenceCase(hook, language), 160),
      score_reasoning: explain(signals, hasTopic),
    }
  }).sort((a, b) => b.virality_score - a.virality_score)
}
