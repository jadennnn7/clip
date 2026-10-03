import type { EditorialAssessment, EditorialCriterion } from '@/types/editorial'
import type { TranscriptStructure } from './structure'

export interface EditorialCandidate {
  first_sentence: number
  last_sentence: number
  /** Ganze Sätze in Quellreihenfolge; Lücken werden tatsächlich herausgeschnitten. */
  sentence_ranges?: Array<{ first_sentence: number; last_sentence: number }>
  title: string
  /** Schlagzeile oben im Clip. Fehlt bei älteren Antworten. */
  hook_title?: string
  description: string
  hashtags: string[]
  angle: string
}

export interface PreparedCandidate extends EditorialCandidate {
  id: string
  start_seconds: number
  end_seconds: number
  hook_text: string
  opening: string
  closing: string
  text: string
  boundary_context?: { before: string; after: string }
  duration_seconds?: number
  segments?: Array<{ start: number; end: number }>
  sections?: string[]
  removed_context?: string[]
}

export interface CandidateReview {
  candidate_id: string
  decision: 'accept' | 'reject'
  standalone: boolean
  payoff_complete: boolean
  opener_is_hook: boolean
  misleading: boolean
  promotional: boolean
  /** Gleicher Kern-Gedanke = gleicher Schlüssel, auch bei anderen Formulierungen. */
  story_key: string
  hook: EditorialCriterion
  flow: EditorialCriterion
  value: EditorialCriterion
  strengths: string[]
  weaknesses: string[]
}

export interface SelectedClip {
  start_seconds: number
  end_seconds: number
  /** Behaltene Bereiche relativ zum Quellfenster, wie beim manuellen Schnitt. */
  segments?: Array<{ start: number; end: number }>
  title: string
  /** Schlagzeile oben im Clip; fehlt bei der regelbasierten Auswahl. */
  hook_title?: string | null
  description: string
  hashtags: string[]
  hook_text: string
  virality_score: number
  score_reasoning: string
  editorial?: EditorialAssessment | null
}

const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export function candidateKey(candidate: EditorialCandidate): string {
  return (candidate.sentence_ranges ?? [candidate])
    .map((range) => `${range.first_sentence}:${range.last_sentence}`).join('|')
}

/** Keine nachträgliche Verkürzung: Sonst würde ein anderer Inhalt bewertet als gerendert. */
export function prepareCandidates(
  candidates: EditorialCandidate[],
  structure: TranscriptStructure,
  duration: number,
  range: { min: number; max: number },
): PreparedCandidate[] {
  const prepared: PreparedCandidate[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const { first_sentence: first, last_sentence: last } = candidate
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < first) continue
    const start = structure.sentences[first]
    const end = structure.sentences[last]
    if (!start || !end || !end.complete || start.startsMidSentence) continue
    if ([...structure.chapterStarts].some((index) => index > first && index <= last)) continue
    const ranges = candidate.sentence_ranges ?? [{ first_sentence: first, last_sentence: last }]
    if (!ranges.length || ranges.length > 4 || ranges[0].first_sentence !== first || ranges.at(-1)!.last_sentence !== last) continue
    if (ranges.some((part, index) => !Number.isInteger(part.first_sentence) || !Number.isInteger(part.last_sentence) ||
      part.first_sentence < first || part.last_sentence > last || part.last_sentence < part.first_sentence ||
      (index > 0 && part.first_sentence <= ranges[index - 1].last_sentence + 1) ||
      !structure.sentences[part.last_sentence]?.complete)) continue
    const spans = ranges.map((part) => ({ start: structure.sentences[part.first_sentence].start, end: structure.sentences[part.last_sentence].end }))
    if (spans.some((span, index) => !Number.isFinite(span.start) || !Number.isFinite(span.end) || span.start < 0 ||
      span.end > duration || span.end <= span.start || (index > 0 && span.start <= spans[index - 1].end))) continue
    const length = spans.reduce((sum, span) => sum + span.end - span.start, 0)
    // Keine Montage weit auseinanderliegender Szenen zu einer erfundenen Geschichte.
    if (length < range.min || length > range.max || end.end - start.start > range.max * 2) continue
    const key = candidateKey(candidate)
    if (seen.has(key)) continue
    seen.add(key)
    const keptSentences = ranges.flatMap((part) => structure.sentences.slice(part.first_sentence, part.last_sentence + 1))
    const words = keptSentences.flatMap((sentence) => structure.words.slice(sentence.from, sentence.to + 1))
    let elapsed = 0
    const opening: string[] = []
    for (const span of spans) {
      opening.push(...words.filter((word) => word.start >= span.start && word.start < span.end && elapsed + word.start - span.start < 3).map((word) => word.word))
      elapsed += span.end - span.start
    }
    prepared.push({
      ...candidate,
      id: `clip-${prepared.length + 1}`,
      title: candidate.title.trim().slice(0, 60),
      hook_title: (candidate.hook_title ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
      hashtags: candidate.hashtags.map((tag) => tag.trim()).filter(Boolean).slice(0, 5),
      start_seconds: start.start,
      end_seconds: end.end,
      hook_text: start.text,
      // Nur Wörter, die innerhalb der ersten drei Sekunden hörbar beginnen.
      opening: opening.join(' '),
      closing: keptSentences.slice(-2).map((sentence) => sentence.text).join(' '),
      text: words.map((word) => word.word).join(' '),
      duration_seconds: length,
      ...(spans.length > 1 ? {
        segments: spans.map((span) => ({ start: span.start - start.start, end: span.end - start.start })),
        sections: ranges.map((part) => structure.sentences.slice(part.first_sentence, part.last_sentence + 1).map((sentence) => sentence.text).join(' ')),
        removed_context: ranges.slice(1).map((part, index) => structure.sentences.slice(ranges[index].last_sentence + 1, part.first_sentence).map((sentence) => sentence.text).join(' ')),
      } : {}),
      // Nur zur Prüfung weggeschnittener Einschränkungen. Dieser Kontext
      // darf fehlende Erklärungen innerhalb des Clips nicht ersetzen.
      boundary_context: {
        before: structure.sentences.slice(Math.max(0, first - 2), first).map((sentence) => sentence.text).join(' '),
        after: structure.sentences.slice(last + 1, last + 3).map((sentence) => sentence.text).join(' '),
      },
    })
  }
  return prepared
}

function hasEvidence(evidence: string, text: string): boolean {
  const quote = normalize(evidence)
  // Kurze Reaktionen wie „No!“ oder „Gewonnen!“ sind bei Unterhaltung gültige
  // Belege. Entscheidend ist der echte Wortlaut, nicht eine Mindestzeichenzahl.
  return quote.length > 0 && (` ${normalize(text)} `).includes(` ${quote} `)
}

export function editorialScore(review: Pick<CandidateReview, 'hook' | 'flow' | 'value'>): number {
  const scores = [review.hook.score, review.flow.score, review.value.score]
  if (scores.some((score) => !Number.isInteger(score) || score < 0 || score > 100)) return 0
  const weighted = Math.round(review.hook.score * 0.4 + review.flow.score * 0.3 + review.value.score * 0.3)
  // Ein schwaches Glied darf nicht von zwei großzügigen Einzelnoten verdeckt werden.
  // Die volle Skala bleibt erreichbar: 99/99/99 ergibt 99, 100/100/100 ergibt 100.
  // Kein Ranglisten-Bonus: Ein Clip wird nicht besser, nur weil andere schlechter sind.
  return Math.min(weighted, Math.min(...scores) + 12, scores.every((score) => score >= 85) ? 100 : 89)
}

/** Nahezu identischer Wortlaut ist auch bei unterschiedlichen story_keys ein Duplikat. */
function similarText(a: string, b: string): boolean {
  const shingles = (text: string) => {
    const words = normalize(text).split(' ')
    return new Set(words.slice(0, -2).map((_, i) => words.slice(i, i + 3).join(' ')))
  }
  const left = shingles(a)
  const right = shingles(b)
  if (!left.size || !right.size) return false
  let common = 0
  for (const phrase of left) if (right.has(phrase)) common++
  return common / Math.min(left.size, right.size) >= 0.65
}

/** Warum ein technisch gültiger Kandidat redaktionell nicht verwendbar ist. */
export function reviewRejectionReasons(candidate: PreparedCandidate, review: CandidateReview): string[] {
  const reasons: string[] = []
  if (review.decision !== 'accept') reasons.push('Redaktionell abgelehnt')
  if (!review.standalone) reasons.push('Einordnung fehlt im Ausschnitt')
  if (!review.payoff_complete) reasons.push('Auflösung fehlt im Ausschnitt')
  if (!review.opener_is_hook) reasons.push('Einstieg hat keinen erkennbaren Reiz')
  if (review.misleading) reasons.push('Ausschnitt oder Metadaten sind irreführend')
  if (review.promotional) reasons.push('Überwiegend Werbung')
  if (!normalize(review.story_key)) reasons.push('Kernbotschaft fehlt')
  // Scores sortieren brauchbare Clips. 75 bedeutete bisher „stark“ und wurde
  // fälschlich zur technischen Mindestanforderung an jeden Schnitt.
  if (editorialScore(review) < 60 || review.hook.score < 55 || review.flow.score < 55 || review.value.score < 50) {
    reasons.push('Zu wenig redaktionelles Potenzial')
  }
  if (!hasEvidence(review.hook.evidence, candidate.opening)) reasons.push('Hook-Beleg nicht im Einstieg')
  if (!hasEvidence(review.flow.evidence, candidate.closing)) reasons.push('Flow-Beleg nicht im Ende')
  if (!hasEvidence(review.value.evidence, candidate.text)) reasons.push('Value-Beleg nicht im Ausschnitt')
  return reasons
}

/** Brauchbare, belegte Clips nach Qualität sortieren; Spitzenwerte sind keine Schnittvoraussetzung. */
export function selectReviewedCandidates(
  candidates: PreparedCandidate[],
  reviews: CandidateReview[],
  maxClips: number,
): SelectedClip[] {
  // Fehlende/doppelte/fremde IDs sind ein kaputtes Review, kein negatives Urteil.
  const ids = new Set(candidates.map((candidate) => candidate.id))
  if (reviews.length !== candidates.length || new Set(reviews.map((review) => review.candidate_id)).size !== ids.size ||
    reviews.some((review) => !ids.has(review.candidate_id))) {
    throw new Error('Die redaktionelle Prüfung hat nicht alle Kandidaten eindeutig bewertet.')
  }
  const accepted = candidates.flatMap((candidate) => {
    const review = reviews.find((item) => item.candidate_id === candidate.id)!
    const score = editorialScore(review)
    if (reviewRejectionReasons(candidate, review).length) return []
    return [{ candidate, review, score }]
  }).sort((a, b) => b.score - a.score || b.review.hook.score - a.review.hook.score || a.candidate.start_seconds - b.candidate.start_seconds)

  const selected: typeof accepted = []
  for (const entry of accepted) {
    if (selected.length >= Math.max(0, Math.floor(maxClips))) break
    if (selected.some(({ candidate, review }) =>
      (entry.candidate.start_seconds < candidate.end_seconds && entry.candidate.end_seconds > candidate.start_seconds) ||
      normalize(entry.review.story_key) === normalize(review.story_key) || similarText(entry.candidate.text, candidate.text))) continue
    selected.push(entry)
  }
  return selected.map(({ candidate, review, score }) => ({
    start_seconds: candidate.start_seconds,
    end_seconds: candidate.end_seconds,
    ...(candidate.segments ? { segments: candidate.segments } : {}),
    title: candidate.title,
    hook_title: candidate.hook_title || null,
    description: candidate.description,
    hashtags: candidate.hashtags,
    hook_text: candidate.hook_text,
    virality_score: score,
    score_reasoning: `Hook: ${review.hook.reason} Flow: ${review.flow.reason} Value: ${review.value.reason}`,
    editorial: {
      version: 1,
      method: 'ai',
      hook: review.hook,
      flow: review.flow,
      value: review.value,
      trend: { score: null, reason: 'Ohne aktuelle Plattformdaten ist kein Trend belegt. Trend fließt nicht in den Gesamtscore ein.' },
      strengths: review.strengths,
      weaknesses: review.weaknesses,
    },
  }))
}
