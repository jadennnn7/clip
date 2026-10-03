import 'server-only'

import type { TranscriptWord } from '@/types/database'
import type { Chapter } from '@/services/video/source'

/**
 * Die Gliederung eines Transkripts: Sätze und Themen.
 *
 * Ein Clip ergibt nur Sinn, wenn er einen ganzen Gedanken enthält — er
 * beginnt am Anfang eines Satzes, idealerweise am Anfang eines Themas, und
 * endet am Ende eines Satzes, bevor das nächste Thema beginnt. Beide
 * Auswahlwege (KI und regelbasiert) schneiden deshalb nur noch entlang
 * dieser Gliederung.
 *
 * Themengrenzen kommen aus drei Quellen, nach Verlässlichkeit:
 *   1. YouTube-Kapitel — vom Creator gesetzt, harte Grenzen.
 *   2. Aufzählungen im Gesprochenen („Weg 3", „Tipp Nummer 5", „Second,").
 *   3. Wortschatzwechsel (TextTiling nach Hearst): Wo sich die Inhaltswörter
 *      zweier benachbarter Passagen kaum noch überschneiden, wechselt das Thema.
 */

export interface Sentence {
  /** Wortindizes, beide inklusive. */
  from: number
  to: number
  start: number
  end: number
  text: string
  /** Endet an einem Satzzeichen — oder, ohne Satzzeichen, an einer deutlichen Pause. */
  complete: boolean
  /** Technische Teilung eines unvollständigen Satzes; hier darf kein Clip beginnen. */
  startsMidSentence?: boolean
}

export interface TranscriptStructure {
  words: TranscriptWord[]
  sentences: Sentence[]
  /** Hat das Transkript echte Satzzeichen? Dann zählen nur sie als Satzende. */
  punctuated: boolean
  /** Beginnen Sätze groß? Dann verrät ein kleiner Anfang einen Einstieg mitten im Satz. */
  cased: boolean
  /** Satzindizes, an denen ein neues Thema beginnt (immer inklusive 0). */
  topicStarts: Set<number>
  /**
   * Wie sicher die Themengrenze ist: Kapitel und angesagte Aufzählungen
   * („Weg 3") sind verlässlich, ein Wortschatzwechsel ist nur ein Indiz.
   */
  topicStrength: Map<number, 'chapter' | 'enumeration' | 'transition' | 'lexical'>
  /** Satzindizes, an denen ein Kapitel beginnt — Clips laufen nie darüber. */
  chapterStarts: Set<number>
  chapters: Chapter[]
  /** Kapitelindex je Satz, `-1` ohne Kapitel. */
  chapterOf: number[]
  /** Normalisierte Inhaltswörter je Satz (für Kohärenz und Themenwechsel). */
  terms: string[][]
}

// --- Wortlisten ------------------------------------------------------------

export const FILLERS = new Set(['äh', 'ähm', 'öh', 'öhm', 'hm', 'hmm', 'uh', 'um', 'uhm', 'erm', 'mhm', 'eh'])

/** Einstiegswörter, die nur mit Komma dahinter reine Überleitung sind („Okay, …", „Also, …"). */
const SOFT_OPENERS = new Set(['okay', 'ok', 'also', 'so', 'naja', 'ja', 'gut', 'well', 'alright', 'right', 'yeah', 'yes', 'now', 'jetzt', 'anyway', 'anyways', 'jedenfalls'])

export const STOPWORDS = new Set([
  // Deutsch
  'aber', 'alle', 'allem', 'allen', 'aller', 'alles', 'also', 'andere', 'anderen', 'bisschen', 'damit', 'dann', 'darauf', 'darum', 'dass',
  'dein', 'deine', 'denen', 'denn', 'derer', 'diese', 'diesem', 'diesen', 'dieser', 'dieses', 'doch', 'dort', 'durch', 'eigentlich',
  'einem', 'einen', 'einer', 'eines', 'einfach', 'etwas', 'euch', 'gerade', 'gesagt', 'gibt', 'haben', 'habe', 'hatte', 'hatten',
  'heute', 'hier', 'ihnen', 'ihre', 'ihren', 'immer', 'irgendwie', 'jetzt', 'kann', 'kannst', 'keine', 'können', 'könnte',
  'machen', 'macht', 'mache', 'meine', 'meinen', 'mich', 'mehr', 'muss', 'müssen', 'nach', 'natürlich', 'nicht', 'noch', 'oder',
  'schon', 'sehr', 'sein', 'seine', 'sich', 'sind', 'sondern', 'unsere', 'viel', 'viele', 'vielleicht', 'wann', 'warum', 'weil',
  'welche', 'wenn', 'werden', 'wieder', 'will', 'wird', 'wirklich', 'wollen', 'wurde', 'würde', 'zwischen', 'genau', 'okay',
  'halt', 'quasi', 'sozusagen', 'eben', 'ganz', 'weiß', 'glaube', 'denke', 'sagen', 'sagt', 'sage', 'dabei', 'dafür', 'davon',
  'irgendwas', 'irgendwann', 'nämlich', 'jemand', 'niemand', 'ungefähr', 'manchmal', 'gemacht', 'gesehen', 'gehabt', 'geworden',
  'kommen', 'kommt', 'gehen', 'geht', 'sehen', 'sieht', 'leute', 'sachen', 'sache', 'dinge', 'ding', 'erste', 'ersten', 'zweite',
  'besser', 'richtig', 'willst', 'denkst', 'musst', 'wirst', 'machst', 'siehst', 'glaubst', 'sollst', 'brauchst', 'möchtest',
  'solltest', 'könntest', 'würdest', 'hättest', 'wäre', 'wären', 'hätte', 'hätten', 'sollte', 'sollten', 'müsste', 'sowas',
  'deswegen', 'deshalb', 'trotzdem', 'außerdem', 'darüber', 'drauf', 'dran', 'drin', 'einmal', 'mal', 'klar', 'wirklich',
  // Englisch
  'about', 'after', 'again', 'always', 'because', 'been', 'before', 'being', 'could', 'didn', 'doesn', 'doing', 'every',
  'going', 'gonna', 'have', 'having', 'here', 'into', 'just', 'kind', 'know', 'like', 'little', 'look', 'make', 'many', 'maybe',
  'more', 'most', 'much', 'never', 'only', 'other', 'really', 'right', 'said', 'same', 'should', 'some', 'something', 'still',
  'such', 'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they', 'thing', 'things', 'think', 'this', 'those',
  'through', 'very', 'wanna', 'want', 'well', 'were', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'yeah', 'your',
  'actually', 'basically', 'literally', 'people', "that's", "there's", "you're", "don't", "can't", "i'm", "i've", "it's",
  'sometimes', 'makes', 'making', 'made', 'sense', 'wants', 'wanted', 'pretty', 'different', 'kinds', 'first', 'second',
  'happen', 'happens', 'happened', 'great', 'thought', 'thinking', 'around', 'another', 'anything', 'everything', 'nothing',
  'someone', 'somebody', 'everyone', 'whole', 'years', 'gets', 'getting', 'goes', 'comes', 'coming', 'called', 'means',
  'start', 'started', 'today', 'time', 'times', 'point', 'number', 'better', 'enough', 'though', 'along', 'least', 'probably',
  'usually', 'guess', 'okay', 'gotta', "we're", "they're", "didn't", "doesn't", "isn't", "wasn't", "won't", "let's",
])

/** Abkürzungen, deren Punkt kein Satzende ist. */
const ABBREVIATIONS = new Set(['z.b.', 'bzw.', 'usw.', 'etc.', 'ca.', 'dr.', 'mr.', 'mrs.', 'ms.', 'prof.', 'vs.', 'nr.', 'd.h.', 'u.a.', 'e.g.', 'i.e.', 'st.', 'jr.', 'inc.', 'bzgl.', 'evtl.', 'ggf.', 'max.', 'min.'])

const FINAL_PUNCTUATION = /[.!?…]["'»”)]*$/

/** Aufzählungen, die ein neues Thema eröffnen („Weg 3", „Tipp Nummer 5", „Second,"). */
const ENUMERATION = new RegExp(
  '^(?:(?:und|and|so|also|jetzt|now|okay)\\s+)?(?:' +
    '(?:weg|tipp|punkt|schritt|gewohnheit|fehler|regel|grund|methode|idee|lektion|frage|nummer|platz)\\s+(?:nummer\\s+)?(?:\\d+|eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf)' +
    '|(?:erstens|zweitens|drittens|viertens|fünftens|als erstes|als nächstes|zum schluss|zuletzt)' +
    '|(?:number|step|tip|rule|reason|lesson|mistake|habit|way)\\s+(?:number\\s+)?(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten)' +
    '|(?:firstly|secondly|thirdly|first of all|next up|finally|last but not least)' +
  ')\\b',
  'i',
)

/** Überleitungen zu einem neuen Thema („Anyway, …", „Kommen wir zu …"). */
const TRANSITION = /^(?:anyway|anyways|so anyway|moving on|let's talk about|let's move on|now let's|jedenfalls|wie auch immer|kommen wir (?:jetzt )?zu|lass(?:t)? uns (?:jetzt )?(?:über|zu)|weiter geht'?s|nächstes thema)\b/i

/** Werbung und Kanalpflege — kein Clip, den jemand teilen würde. */
const PROMOTIONAL = /\b(abonnier\w*|glocke|like[- ]?button|link (?:in der|unten in der) beschreibung|in der videobeschreibung|gesponsert|sponsor\w*|werbepartner|rabattcode|gutscheincode|mit dem code|jetzt kostenlos|subscribe\w*|hit the like|smash (?:that|the) like|link (?:in the|below in the) description|sponsored by|use code|promo code|discount code|patreon|merch|time[- ]limited|limited[- ]time|download (?:it|now|the app|for free)|in the app store)\b/i

export const normalizeToken = (word: string) =>
  word.toLocaleLowerCase().replace(/[’`´]/g, "'").replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')

/** Grobe Wortstammbildung, damit „Kunden" und „Kunde", „habits" und „habit" zusammenfallen. */
function stem(token: string): string {
  if (token.length <= 5) return token
  return token.replace(/(ungen|ung|en|er|es|em|e|n|s|ing|ed|ly)$/, '')
}

function contentTerms(words: TranscriptWord[], from: number, to: number): string[] {
  const terms: string[] = []
  for (let i = from; i <= to; i++) {
    const token = normalizeToken(words[i].word)
    if (token.length >= 4 && !STOPWORDS.has(token) && !/^\d+$/.test(token)) terms.push(stem(token))
  }
  return terms
}

export function isPromotional(text: string): boolean {
  return PROMOTIONAL.test(text)
}

// --- Pausen und Sätze ----------------------------------------------------

/**
 * Tatsächliche Pause nach einem Wort.
 *
 * YouTube-Untertitel kennen kein Wortende: Jedes Wort reicht bis zum nächsten.
 * Die Pause wird deshalb gegen eine geschätzte Sprechdauer gerechnet, nicht
 * gegen `end`.
 */
export function pauseAfter(word: TranscriptWord, next: TranscriptWord | undefined): number {
  if (!next) return Infinity
  // Deepgram liefert echte Wortenden samt Confidence. Ein lang gesprochenes
  // Wort ist keine Pause; die Zeichenzahl-Schätzung gilt nur für Untertitel,
  // deren `end` häufig bis zum nächsten Wort reicht.
  if (word.confidence !== undefined) return Math.max(0, next.start - word.end)
  const spoken = Math.min(word.end - word.start, Math.max(0.15, Math.min(0.8, 0.06 * word.word.length + 0.12)))
  return Math.max(0, next.start - (word.start + spoken))
}

/** Ab dieser Lücke gilt eine Stelle ohne Satzzeichen als Satzgrenze. */
const PAUSE_SECONDS = 0.45

/** Nach diesen Wörtern hat der Sprecher nur Luft geholt, der Gedanke geht weiter. */
const HANGING_ENDS = new Set([
  'and', 'but', 'or', 'so', 'because', 'that', 'the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'with', 'for', 'if', 'i', 'you', 'we', 'my', 'your', 'is', 'are', 'was',
  'und', 'aber', 'oder', 'weil', 'dass', 'ob', 'wenn', 'also', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem',
  'mit', 'für', 'in', 'im', 'an', 'auf', 'zu', 'von', 'ich', 'du', 'wir', 'es', 'ist', 'sind',
])

/** Wörter, mit denen nach einer Pause ein neuer Gedanke anfängt. */
const SENTENCE_OPENERS = new Set(['well', 'so', 'now', 'okay', 'ok', 'and', 'but', 'also', 'und', 'aber', 'naja', 'jetzt', 'gut', 'ja'])

function isSentenceEnd(word: TranscriptWord, next: TranscriptWord | undefined): boolean {
  if (!FINAL_PUNCTUATION.test(word.word)) return false
  const token = word.word.toLocaleLowerCase()
  if (ABBREVIATIONS.has(token)) return false
  // „Weg 3." oder „am 1. Mai": Ordnungszahlen mit Punkt. Satzende nur, wenn
  // danach groß weitergeht — im Deutschen unscharf, aber die bessere Wette.
  if (/^\d+\.$/.test(word.word) && next && next.word[0] === next.word[0]?.toLocaleLowerCase()) return false
  return true
}

/** Satzzeichen gelten, wenn im Schnitt spätestens alle 40 Wörter ein Satz endet. */
function detectPunctuation(words: TranscriptWord[]): boolean {
  let finals = 0
  for (let i = 0; i < words.length; i++) if (isSentenceEnd(words[i], words[i + 1])) finals++
  return finals > 0 && finals >= words.length / 40
}

function sameSpeaker(a: TranscriptWord, b: TranscriptWord): boolean {
  return a.speaker === undefined || b.speaker === undefined || a.speaker === b.speaker
}

function splitSentences(words: TranscriptWord[], punctuated: boolean): Sentence[] {
  const sentences: Sentence[] = []
  let from = 0
  const push = (to: number, complete: boolean, startsMidSentence = false) => {
    sentences.push({
      from,
      to,
      start: words[from].start,
      end: words[to].end,
      text: words.slice(from, to + 1).map((word) => word.word).join(' '),
      complete,
      ...(startsMidSentence ? { startsMidSentence: true } : {}),
    })
    from = to + 1
  }

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const next = words[i + 1]
    if (!next) {
      push(i, isSentenceEnd(word, next) || (!punctuated && !HANGING_ENDS.has(normalizeToken(word.word))))
      break
    }

    const pause = pauseAfter(word, next)
    const speakerChange = word.speaker !== undefined && next.speaker !== undefined && word.speaker !== next.speaker
    const length = word.end - words[from].start
    const final = isSentenceEnd(word, next)

    if (punctuated) {
      // Mit Satzzeichen zählen nur sie — ein Komma mit Pause ist kein Satzende.
      // Ausnahmen: Sprecherwechsel, lange Stille, und überlange „Sätze"
      // (Aufzählungen ohne Punkt), die an einer Pause geteilt werden.
      if (final || speakerChange || pause >= 1.5 || (length > 30 && pause >= 0.35) || length > 45) {
        // A short acknowledgement immediately before a detected speaker
        // change belongs to the incoming speaker's thought ("... den — nein,
        // das funktioniert ..."). Keep it with that thought instead of
        // attaching it to the interrupted, unusable fragment.
        const splitAt = speakerChange && !final && word.word.replace(/[^\p{L}]/gu, '').length <= 4 && i > from ? i - 1 : i
        push(splitAt, final && splitAt === i, !final && splitAt === i)
        if (splitAt < i) {
          from = i
          // The current word is the final word of the new speaker's opening
          // response; continue collecting it in the next sentence.
        }
      }
    } else if (final || pause >= PAUSE_SECONDS || speakerChange || length > 14) {
      push(i, final || ((speakerChange || pause >= PAUSE_SECONDS) && !HANGING_ENDS.has(normalizeToken(word.word))))
    }
  }

  if (punctuated) return repairPunctuated(words, sentences)

  // Ohne Satzzeichen: Ein- oder Zwei-Wort-Stücke zwischen zwei Pausen sind fast
  // immer das Ende des vorigen Satzes. Beginnt das Stück mit „well", „so" oder
  // „und", eröffnet es dagegen den nächsten Gedanken.
  const merged: Sentence[] = []
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]
    const previous = merged.at(-1)
    const next = sentences[i + 1]
    const fragment = sentence.to - sentence.from < 2
    if (fragment && next && sameSpeaker(words[sentence.to], words[next.from]) && SENTENCE_OPENERS.has(normalizeToken(words[sentence.from].word)) && next.start - sentence.end < 1.5) {
      sentences[i + 1] = { ...next, from: sentence.from, start: sentence.start, text: `${sentence.text} ${next.text}` }
    } else if (fragment && previous && sameSpeaker(words[previous.to], words[sentence.from]) && sentence.start - previous.end < 1.5) {
      merged[merged.length - 1] = { ...previous, to: sentence.to, end: sentence.end, text: `${previous.text} ${sentence.text}`, complete: sentence.complete }
    } else {
      merged.push(sentence)
    }
  }
  return merged
}

const startsLowercase = (word: string) => /^\p{Ll}/u.test(word) && word !== 'i' && !/^i'/.test(word)

/** Satzanfänge, die klein geschrieben trotzdem zum folgenden Satz gehören („and This is …"). */
const OPENING_CONNECTIVES = new Set(['and', 'but', 'so', 'or', 'because', 'then', 'und', 'aber', 'oder', 'also', 'weil', 'dann', 'denn'])
const startsUppercase = (word: string) => /^\p{Lu}/u.test(word)

/**
 * Korrigiert zwei typische Fehler punktierter Transkripte.
 *
 * 1. Ein Satzzeichen eine Stelle zu früh: „… on the schedule. sorry Now, what
 *    is going on" — die kleingeschriebenen Wörter vor dem nächsten großen
 *    Anfang gehören zum Satz davor.
 * 2. Eine Kunstpause mitten in der Frage („Now, what is going on … here?"):
 *    Die Pause hat ein Fragment abgetrennt, das den unvollständigen Satz
 *    davor beendet.
 */
function repairPunctuated(words: TranscriptWord[], sentences: Sentence[]): Sentence[] {
  const text = (from: number, to: number) => words.slice(from, to + 1).map((word) => word.word).join(' ')
  const repaired: Sentence[] = []
  for (const original of sentences) {
    let sentence = original
    // A response that contains an explicit speaker change is a valid new
    // thought even if the caption stream began with a lowercase fragment.
    if (sentence.startsMidSentence) {
      for (let index = sentence.from; index < sentence.to; index++) {
        if (!sameSpeaker(words[index], words[index + 1])) {
          sentence = { ...sentence }
          delete sentence.startsMidSentence
          break
        }
      }
    }
    const previous = repaired.at(-1)

    if (previous && sameSpeaker(words[previous.to], words[sentence.from]) && sameSpeaker(words[sentence.from], words[sentence.to])) {
      let split = sentence.from
      while (
        split <= sentence.to && split - sentence.from < 3 &&
        startsLowercase(words[split].word) && !OPENING_CONNECTIVES.has(normalizeToken(words[split].word))
      ) split++
      if (split > sentence.from && split <= sentence.to && startsUppercase(words[split].word)) {
        repaired[repaired.length - 1] = { ...previous, to: split - 1, end: words[split - 1].end, text: text(previous.from, split - 1) }
        sentence = { ...sentence, from: split, start: words[split].start, text: text(split, sentence.to) }
      }
    }

    const last = repaired.at(-1)
    if (last && !last.complete && sameSpeaker(words[last.to], words[sentence.from]) && sentence.to - sentence.from < 3) {
      repaired[repaired.length - 1] = { ...last, to: sentence.to, end: sentence.end, text: text(last.from, sentence.to), complete: sentence.complete }
      continue
    }
    repaired.push(sentence)
  }
  return repaired
}

// --- Themen ------------------------------------------------------------------

/** Mindestabstand zweier Themengrenzen aus dem Wortschatzwechsel. */
const MIN_TOPIC_SECONDS = 40
/** So viele Inhaltswörter umfasst jedes der beiden verglichenen Fenster. */
const TILING_WINDOW_TERMS = 40

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (const [term, count] of a) { normA += count * count; dot += count * (b.get(term) ?? 0) }
  for (const count of b.values()) normB += count * count
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0
}

function bag(terms: string[][], from: number, to: number, step: 1 | -1): Map<string, number> {
  const counts = new Map<string, number>()
  let total = 0
  for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
    for (const term of terms[i]) { counts.set(term, (counts.get(term) ?? 0) + 1); total++ }
    if (total >= TILING_WINDOW_TERMS) break
  }
  return counts
}

/**
 * Themenwechsel über den Wortschatz (TextTiling).
 *
 * An jeder Satzgrenze wird der Wortschatz der Passage davor mit dem der
 * Passage danach verglichen. Ein tiefes Tal in dieser Ähnlichkeit — deutlich
 * tiefer als die Umgebung links und rechts — ist ein Themenwechsel.
 */
function lexicalBoundaries(sentences: Sentence[], terms: string[][]): number[] {
  if (sentences.length < 8) return []
  const gaps: number[] = []
  for (let gap = 1; gap < sentences.length; gap++) {
    gaps.push(cosine(bag(terms, gap - 1, 0, -1), bag(terms, gap, sentences.length - 1, 1)))
  }
  const smoothed = gaps.map((_, i) => (gaps[Math.max(0, i - 1)] + gaps[i] + gaps[Math.min(gaps.length - 1, i + 1)]) / 3)

  const depth = smoothed.map((value, i) => {
    let left = value
    for (let j = i - 1; j >= 0 && smoothed[j] >= left; j--) left = smoothed[j]
    let right = value
    for (let j = i + 1; j < smoothed.length && smoothed[j] >= right; j++) right = smoothed[j]
    return left - value + (right - value)
  })
  const mean = depth.reduce((sum, value) => sum + value, 0) / depth.length
  const deviation = Math.sqrt(depth.reduce((sum, value) => sum + (value - mean) ** 2, 0) / depth.length)
  const threshold = mean + deviation * 0.5

  // Tiefste Täler zuerst, damit bei zu dichten Kandidaten der deutlichere gewinnt.
  const candidates = depth
    .map((value, i) => ({ sentence: i + 1, value }))
    .filter(({ value, sentence }, i) => value > threshold && value >= (depth[i - 1] ?? 0) && value >= (depth[i + 1] ?? 0) && sentence > 0)
    .sort((a, b) => b.value - a.value)

  const chosen: number[] = []
  for (const candidate of candidates) {
    const start = sentences[candidate.sentence].start
    if (chosen.every((other) => Math.abs(sentences[other].start - start) >= MIN_TOPIC_SECONDS)) chosen.push(candidate.sentence)
  }
  return chosen
}

/** Kapitelgrenze → Satz, der am nächsten an ihr beginnt (höchstens 6 s daneben). */
function chapterSentence(sentences: Sentence[], time: number): number | null {
  let best: number | null = null
  let bestGap = 6
  for (let i = 0; i < sentences.length; i++) {
    const gap = Math.abs(sentences[i].start - time)
    if (gap < bestGap) { best = i; bestGap = gap }
    if (sentences[i].start > time + 6) break
  }
  return best
}

export function analyzeStructure(words: TranscriptWord[], chapters: Chapter[] = []): TranscriptStructure {
  const punctuated = detectPunctuation(words)
  const sentences: Sentence[] = splitSentences(words, punctuated).map((sentence): Sentence => {
    if (!sentence.startsMidSentence) return sentence
    for (let index = sentence.from; index < sentence.to; index++) {
      if (!sameSpeaker(words[index], words[index + 1])) {
        const { startsMidSentence: _ignored, ...clean } = sentence
        return clean
      }
    }
    return sentence
  })
  for (let i = 1; i < sentences.length; i++) {
    const previous = sentences[i - 1]
    const hasSpeakerChange = [...Array(sentences[i].to - sentences[i].from)].some((_, offset) =>
      !sameSpeaker(words[sentences[i].from + offset], words[sentences[i].from + offset + 1]),
    )
    if (!previous.complete && !hasSpeakerChange && sameSpeaker(words[previous.to], words[sentences[i].from])) {
      sentences[i].startsMidSentence = true
    }
  }
  const terms = sentences.map((sentence) => contentTerms(words, sentence.from, sentence.to))

  const chapterStarts = new Set<number>()
  for (const chapter of chapters.slice(1)) {
    const index = chapterSentence(sentences, chapter.start)
    if (index !== null && index > 0) chapterStarts.add(index)
  }
  const chapterOf = sentences.map((sentence) => {
    let index = -1
    for (let i = 0; i < chapters.length; i++) if (sentence.start >= chapters[i].start - 6) index = i
    return index
  })

  const topicStrength = new Map<number, 'chapter' | 'enumeration' | 'transition' | 'lexical'>()
  for (const index of chapterStarts) topicStrength.set(index, 'chapter')
  sentences.forEach((sentence, index) => {
    if (index === 0 || topicStrength.has(index)) return
    const opening = sentence.text.replace(/^[^\p{L}\p{N}]+/u, '')
    if (ENUMERATION.test(opening)) topicStrength.set(index, 'enumeration')
    else if (TRANSITION.test(opening)) topicStrength.set(index, 'transition')
  })
  for (const boundary of lexicalBoundaries(sentences, terms)) if (!topicStrength.has(boundary)) topicStrength.set(boundary, 'lexical')
  const topicStarts = new Set<number>([0, ...topicStrength.keys()])

  const opened = sentences.filter((sentence) => /^\p{L}/u.test(words[sentence.from].word))
  const cased = punctuated && opened.length > 0 && opened.filter((sentence) => startsUppercase(words[sentence.from].word)).length >= opened.length * 0.8

  return { words, sentences, punctuated, cased, topicStarts, topicStrength, chapterStarts, chapters, chapterOf, terms }
}

/** Erstes Wort eines Satzes ohne Füllwörter und Überleitungen („Äh, also, …"). */
export function firstContentWord(structure: TranscriptStructure, sentence: Sentence): number {
  const { words } = structure
  let index = sentence.from
  while (index < sentence.to) {
    const raw = words[index].word
    const token = normalizeToken(raw)
    const softOpener = SOFT_OPENERS.has(token) && /[,;:]$/.test(raw)
    if (!FILLERS.has(token) && !softOpener) break
    index++
  }
  return index
}

/**
 * Rastet einen frei gewählten Zeitraum (etwa von der KI) auf ganze Sätze:
 * Beginn am nächstgelegenen Satzanfang, Ende am nächstgelegenen Satzende.
 * Kapitelgrenzen innerhalb des Zeitraums kürzen ihn auf das Kapitel, in dem
 * der größere Teil liegt.
 */
export function snapToSentences(structure: TranscriptStructure, start: number, end: number): { first: number; last: number } | null {
  const { sentences, chapterStarts } = structure
  if (sentences.length === 0) return null

  let first = 0
  let bestStart = Infinity
  for (let i = 0; i < sentences.length; i++) {
    const gap = Math.abs(sentences[i].start - start)
    if (gap < bestStart) { bestStart = gap; first = i }
  }
  let last = first
  let bestEnd = Infinity
  for (let i = first; i < sentences.length; i++) {
    const gap = Math.abs(sentences[i].end - end)
    if (gap < bestEnd) { bestEnd = gap; last = i }
    if (sentences[i].start > end + 10) break
  }

  const inside = [...chapterStarts].filter((index) => index > first && index <= last).sort((a, b) => a - b)
  if (inside.length > 0) {
    const bounds = [first, ...inside, last + 1]
    let bestPart = { first, last: inside[0] - 1, seconds: -1 }
    for (let i = 0; i < bounds.length - 1; i++) {
      const partFirst = bounds[i]
      const partLast = bounds[i + 1] - 1
      const seconds = sentences[partLast].end - sentences[partFirst].start
      if (seconds > bestPart.seconds) bestPart = { first: partFirst, last: partLast, seconds }
    }
    return { first: bestPart.first, last: bestPart.last }
  }
  return { first, last }
}
