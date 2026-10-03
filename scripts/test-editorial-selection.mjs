import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Run with `node scripts/test-editorial-selection.mjs`, including Node 22 before
// native TypeScript loading became the default. No server, API key or new loader.
const source = await readFile(new URL('../src/services/ai/editorial.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
})
const { prepareCandidates, selectReviewedCandidates, editorialScore } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)

function transcript() {
  const texts = [
    'Ein voller Kalender macht dich nicht produktiv.',
    'Ich verschob jede neue Aufgabe sofort in die nächste Woche.',
    'So verbrachte ich jeden Montag zwei Stunden mit Sortieren.',
    'Seit ich nur drei Aufgaben plane, beende ich jede davon.',
    'Der Rest bleibt auf einer Liste, bis wieder Platz entsteht.',
    'Weniger Aufgaben bedeuten für mich mehr fertige Arbeit.',
  ]
  const words = []
  const sentences = texts.map((text, index) => {
    const tokens = text.split(' ')
    const from = words.length
    const start = index * 8
    const end = start + 7
    tokens.forEach((word, offset) => words.push({
      word,
      start: start + offset * 7 / tokens.length,
      end: start + (offset + 1) * 7 / tokens.length,
    }))
    return { from, to: words.length - 1, start, end, text, complete: true }
  })
  return {
    words, sentences, punctuated: true, cased: true,
    topicStarts: new Set([0]), topicStrength: new Map(), chapterStarts: new Set(),
    chapters: [], chapterOf: sentences.map(() => -1), terms: sentences.map(() => []),
  }
}

function proposal(first_sentence = 0, last_sentence = 5) {
  return {
    first_sentence, last_sentence, title: 'Warum mein voller Kalender nicht half',
    description: 'Eine abgeschlossene Erfahrung mit einer konkreten Änderung.',
    hashtags: ['#Arbeit'], angle: 'Weniger planen, mehr abschließen',
  }
}

const stories = {
  calendar: {
    opening: 'Drei Aufgaben verändern deinen Arbeitstag.',
    middle: 'Ich schrieb zunächst zwanzig Vorhaben auf und erledigte keines davon.',
    closing: 'Am Freitag waren alle drei Aufgaben erledigt.',
  },
  pricing: {
    opening: 'Unser teuerstes Angebot verkaufte sich zuerst.',
    middle: 'Die Kunden bezahlten für die garantierte Antwort innerhalb einer Stunde.',
    closing: 'Deshalb verkauften wir schnelle Hilfe statt zusätzlicher Funktionen.',
  },
  sleep: {
    opening: 'Mein Handy schlief eine Woche in der Küche.',
    middle: 'Vorher blätterte ich nach jedem Aufwachen durch neue Nachrichten.',
    closing: 'Ohne Bildschirm schlief ich nach wenigen Minuten wieder ein.',
  },
}

function candidate(id = 'clip-1', story = 'calendar', start = 0, overrides = {}) {
  const passage = stories[story]
  return {
    ...proposal(), id, title: story, start_seconds: start, end_seconds: start + 30,
    hook_text: passage.opening, opening: passage.opening, closing: passage.closing,
    text: `${passage.opening} ${passage.middle} ${passage.closing}`,
    ...overrides,
  }
}

function review(clip, overrides = {}) {
  return {
    candidate_id: clip.id, decision: 'accept', standalone: true, payoff_complete: true,
    opener_is_hook: true, misleading: false, promotional: false, story_key: clip.title,
    hook: { score: 88, reason: 'Der Einstieg benennt sofort einen konkreten Gegensatz.', evidence: clip.opening },
    flow: { score: 88, reason: 'Die erzählte Veränderung wird im Schluss aufgelöst.', evidence: clip.closing },
    value: { score: 88, reason: 'Das Ergebnis ist konkret und innerhalb des Clips nachvollziehbar.', evidence: clip.closing },
    strengths: ['Konkrete Erfahrung mit Ergebnis'], weaknesses: ['Noch keine externe Resonanz gemessen'],
    ...overrides,
  }
}

function scoredReview(clip, score, overrides = {}) {
  const result = review(clip)
  return {
    ...result,
    hook: { ...result.hook, score }, flow: { ...result.flow, score }, value: { ...result.value, score },
    ...overrides,
  }
}

test('candidate preparation rejects invalid sentence IDs rather than snapping them to real content', () => {
  const invalid = [[-1, 1], [0.5, 2], [0, 1.5], [3, 2], [0, 99], [99, 99], [NaN, 2], [0, Infinity]]
  for (const [first, last] of invalid) {
    assert.deepEqual(prepareCandidates([proposal(first, last)], transcript(), 47, { min: 1, max: 60 }), [], `${first}:${last}`)
  }
})

test('candidate preparation rejects short, long and out-of-source ranges without silently trimming', () => {
  const structure = transcript()
  assert.deepEqual(prepareCandidates([proposal(0, 0)], structure, 47, { min: 15, max: 60 }), [])
  assert.deepEqual(prepareCandidates([proposal()], structure, 47, { min: 15, max: 30 }), [])
  assert.deepEqual(prepareCandidates([proposal()], structure, 40, { min: 15, max: 60 }), [])
  assert.equal(structure.sentences.at(-1).end, 47, 'source boundaries remain untouched')

  structure.sentences[0].start = -1
  assert.deepEqual(prepareCandidates([proposal()], structure, 47, { min: 15, max: 60 }), [])
  structure.sentences[0].start = NaN
  assert.deepEqual(prepareCandidates([proposal()], structure, 47, { min: 15, max: 60 }), [])
})

test('chapter crossings are rejected but a clip may start at a chapter boundary', () => {
  const structure = transcript()
  structure.chapterStarts.add(3)
  const result = prepareCandidates([proposal(1, 4), proposal(0, 2), proposal(3, 5)], structure, 47, { min: 15, max: 60 })
  assert.deepEqual(result.map(({ first_sentence, last_sentence }) => [first_sentence, last_sentence]), [[0, 2], [3, 5]])
})

test('the final source sentence is usable, while an unfinished final thought is rejected', () => {
  const structure = transcript()
  const [result] = prepareCandidates([proposal(4, 5)], structure, 47, { min: 15, max: 60 })
  assert.equal(result.start_seconds, 32)
  assert.equal(result.end_seconds, 47)
  assert.ok(result.text.endsWith(structure.sentences[5].text))
  structure.sentences[5].complete = false
  assert.deepEqual(prepareCandidates([proposal(4, 5)], structure, 47, { min: 15, max: 60 }), [])
})

test('preparation preserves the exact selected passage and reviews only its audible first three seconds as the hook', () => {
  const structure = transcript()
  const [result] = prepareCandidates([proposal(), proposal()], structure, 47, { min: 15, max: 60 })
  assert.equal(result.start_seconds, 0)
  assert.equal(result.end_seconds, 47)
  assert.equal(result.opening, 'Ein voller Kalender')
  assert.equal(result.hook_text, structure.sentences[0].text)
  assert.equal(result.text, structure.sentences.map(({ text }) => text).join(' '))
  assert.equal(result.closing, `${structure.sentences[4].text} ${structure.sentences[5].text}`)
  assert.equal(prepareCandidates([proposal(), proposal()], structure, 47, { min: 15, max: 60 }).length, 1)
})

test('a strong, fully evidenced review yields a calibrated assessment and no invented trend score', () => {
  const clip = candidate()
  const assessment = scoredReview(clip, 92)
  const [selected] = selectReviewedCandidates([clip], [assessment], 5)
  assert.equal(selected.virality_score, 92)
  assert.equal(selected.start_seconds, clip.start_seconds)
  assert.equal(selected.end_seconds, clip.end_seconds)
  assert.equal(selected.hook_text, clip.hook_text)
  assert.equal(selected.editorial.method, 'ai')
  assert.deepEqual(selected.editorial.hook, assessment.hook)
  assert.deepEqual(selected.editorial.flow, assessment.flow)
  assert.deepEqual(selected.editorial.value, assessment.value)
  assert.equal(selected.editorial.trend.score, null)
  assert.ok(selected.editorial.trend.reason.length > 0)
})

test('a hook quote from later in the passage cannot justify a weak opening', () => {
  const [clip] = prepareCandidates([proposal()], transcript(), 47, { min: 15, max: 60 })
  const assessment = scoredReview(clip, 99)
  assessment.hook.evidence = 'Seit ich nur drei Aufgaben plane'
  assert.ok(clip.text.includes(assessment.hook.evidence))
  assert.deepEqual(selectReviewedCandidates([clip], [assessment], 5), [])
})

test('flow evidence must demonstrate the selected ending, not an earlier completed sentence', () => {
  const [clip] = prepareCandidates([proposal()], transcript(), 47, { min: 15, max: 60 })
  const assessment = scoredReview(clip, 99)
  assessment.flow.evidence = 'Ich verschob jede neue Aufgabe sofort in die nächste Woche.'
  assert.ok(clip.text.includes(assessment.flow.evidence))
  assert.deepEqual(selectReviewedCandidates([clip], [assessment], 5), [])
})

test('invented, empty and partial-word evidence cannot pass a high-scoring review', () => {
  const clip = candidate()
  for (const [criterion, evidence] of [
    ['hook', 'Drei Aufgaben machen dich garantiert reich'],
    ['flow', ''],
    ['value', 'Eine Million neue Kunden im ersten Monat'],
    ['hook', 'Aufgaben verändern deinen Arbeit'],
  ]) {
    const assessment = scoredReview(clip, 99)
    assessment[criterion].evidence = evidence
    assert.deepEqual(selectReviewedCandidates([clip], [assessment], 5), [], `${criterion}: ${evidence}`)
  }
})

test('literal evidence tolerates typography and capitalization differences', () => {
  const clip = candidate()
  const assessment = review(clip)
  assessment.hook.evidence = 'DREI — Aufgaben verändern deinen Arbeitstag!'
  assert.equal(selectReviewedCandidates([clip], [assessment], 5).length, 1)
})

test('unusable hook, flow or value cannot be compensated by otherwise perfect scores', () => {
  const clip = candidate()
  for (const [criterion, score] of [['hook', 54], ['flow', 54], ['value', 49]]) {
    const assessment = scoredReview(clip, 100)
    assessment[criterion].score = score
    assert.deepEqual(selectReviewedCandidates([clip], [assessment], 5), [], criterion)
  }
  const assessment = scoredReview(clip, 100)
  assessment.value.score = 40
  assert.ok(editorialScore(assessment) < 75, 'a severe weakness limits the overall grade')
})

test('usable clips below 75 remain editable and keep their honest scores', () => {
  const clip = candidate()
  for (const score of [60, 65, 74]) {
    const [selected] = selectReviewedCandidates([clip], [scoredReview(clip, score)], 5)
    assert.equal(selected.virality_score, score)
    assert.equal(selected.editorial.value.score, score)
  }
  assert.deepEqual(selectReviewedCandidates([clip], [scoredReview(clip, 59)], 5), [])
})

test('brief literal reactions are valid evidence in entertainment clips', () => {
  const clip = candidate('clip-1', 'calendar', 0, {
    opening: 'No!', closing: 'I won!', text: 'No! You got the winning case. I won!',
  })
  const assessment = review(clip)
  assert.equal(selectReviewedCandidates([clip], [assessment], 5).length, 1)
  assessment.hook.evidence = 'Go!'
  assert.deepEqual(selectReviewedCandidates([clip], [assessment], 5), [])
})

test('exceptional overall ratings require strength in all three editorial criteria', () => {
  const assessment = scoredReview(candidate(), 100)
  assessment.value.score = 80
  assert.ok(editorialScore(assessment) < 90)
})

test('non-finite and out-of-range model scores do not produce accepted clips', () => {
  const clip = candidate()
  for (const score of [NaN, Infinity, -1, 101]) {
    const assessment = review(clip)
    assessment.hook.score = score
    assert.equal(editorialScore(assessment), 0)
    assert.deepEqual(selectReviewedCandidates([clip], [assessment], 5), [])
  }
})

test('explicit editorial vetoes reject a clip even when every score is 99', () => {
  const clip = candidate()
  for (const veto of [
    { decision: 'reject' }, { standalone: false }, { payoff_complete: false },
    { opener_is_hook: false }, { misleading: true }, { promotional: true }, { story_key: '   ' },
  ]) {
    assert.deepEqual(selectReviewedCandidates([clip], [scoredReview(clip, 99, veto)], 5), [], JSON.stringify(veto))
  }
})

test('overlapping candidates retain the strongest story even when it occurs later in the source', () => {
  const early = candidate('clip-1', 'calendar', 0)
  const stronger = candidate('clip-2', 'pricing', 20)
  const reviews = [scoredReview(early, 80), scoredReview(stronger, 96)]
  for (const candidates of [[early, stronger], [stronger, early]]) {
    const selected = selectReviewedCandidates(candidates, reviews, 5)
    assert.deepEqual(selected.map(({ title }) => title), ['pricing'])
    assert.equal(selected[0].start_seconds, 20)
  }
})

test('adjacent, non-overlapping distinct stories can both be selected', () => {
  const first = candidate('clip-1', 'calendar', 0)
  const second = candidate('clip-2', 'pricing', 30)
  assert.equal(selectReviewedCandidates([first, second], [review(first), review(second)], 5).length, 2)
})

test('semantic duplicates keep the stronger candidate even with different words and timestamps', () => {
  const first = candidate('clip-1', 'calendar', 0)
  const second = candidate('clip-2', 'pricing', 60)
  const selected = selectReviewedCandidates([first, second], [
    scoredReview(first, 80, { story_key: 'Fokus statt Funktionsmenge' }),
    scoredReview(second, 95, { story_key: 'FOKUS — statt Funktionsmenge!' }),
  ], 5)
  assert.deepEqual(selected.map(({ title }) => title), ['pricing'])
})

test('near-identical passages are deduplicated even when the reviewer invents different story keys', () => {
  const first = candidate('clip-1', 'calendar', 0)
  const second = candidate('clip-2', 'calendar', 60, { title: 'Andere Überschrift' })
  second.text = `${second.text} Diese Änderung behalte ich bei.`
  const selected = selectReviewedCandidates([first, second], [
    scoredReview(first, 80, { story_key: 'Drei Aufgaben' }),
    scoredReview(second, 95, { story_key: 'Produktivität am Freitag' }),
  ], 5)
  assert.equal(selected.length, 1)
  assert.equal(selected[0].start_seconds, 60)
})

test('maxClips is a ceiling on quality-ranked results, including a zero ceiling', () => {
  const candidates = [candidate('clip-1', 'calendar', 0), candidate('clip-2', 'pricing', 60), candidate('clip-3', 'sleep', 120)]
  const reviews = candidates.map((clip, index) => scoredReview(clip, [80, 96, 90][index]))
  assert.deepEqual(selectReviewedCandidates(candidates, reviews, 2).map(({ title }) => title), ['pricing', 'sleep'])
  assert.deepEqual(selectReviewedCandidates(candidates, reviews, 0), [])
})

test('missing, duplicate and foreign review IDs fail instead of silently accepting a partial review', () => {
  const first = candidate('clip-1', 'calendar', 0)
  const second = candidate('clip-2', 'pricing', 60)
  for (const reviews of [
    [], [review(first)], [review(first), review(first)],
    [review(first), review(second, { candidate_id: 'unknown-clip' })],
    [review(first), review(second), review(first)],
  ]) {
    assert.throws(() => selectReviewedCandidates([first, second], reviews, 5), /nicht alle Kandidaten eindeutig bewertet/)
  }
})

test('zero accepted stories stays zero rather than filling the quota with weak fallback clips', () => {
  const first = candidate('clip-1', 'calendar', 0)
  const second = candidate('clip-2', 'pricing', 60)
  assert.deepEqual(selectReviewedCandidates([first, second], [
    scoredReview(first, 99, { decision: 'reject' }),
    scoredReview(second, 99, { payoff_complete: false }),
  ], 5), [])
  assert.deepEqual(selectReviewedCandidates([], [], 5), [])
})
