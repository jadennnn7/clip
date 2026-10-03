import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/services/ai/editorial.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
})
const { editorialScore, selectReviewedCandidates } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)

const criteria = (hook, flow = hook, value = hook) => ({ hook: { score: hook }, flow: { score: flow }, value: { score: value } })

test('the entire scale is reachable without increasing an evenly rated clip', () => {
  for (let score = 0; score <= 100; score++) {
    assert.equal(editorialScore(criteria(score)), score, `balanced ${score}/100`)
  }
})

test('exceptional evidence can produce 99 without requiring three perfect marks', () => {
  assert.equal(editorialScore(criteria(99, 98, 99)), 99)
  assert.equal(editorialScore(criteria(100, 99, 98)), 99)
  assert.equal(editorialScore(criteria(100)), 100)
  assert.equal(editorialScore(criteria(92)), 92, 'strong clips receive no artificial 99 bonus')
})

test('weaknesses limit the result even beside two perfect criteria', () => {
  assert.ok(editorialScore(criteria(100, 100, 40)) <= 52)
  assert.ok(editorialScore(criteria(100, 80, 100)) < 90)
  assert.equal(editorialScore(criteria(92, 88, 90)), 90)
})

test('invalid criterion values cannot leak fractional, non-finite or out-of-range scores', () => {
  for (const invalid of [NaN, Infinity, -Infinity, -1, 101, 99.5, '99', null, undefined]) {
    for (const key of ['hook', 'flow', 'value']) {
      const review = criteria(99)
      review[key].score = invalid
      assert.equal(editorialScore(review), 0, `${key}: ${invalid}`)
    }
  }
})

test('a supported 99 survives selection and keeps all criterion scores and evidence', () => {
  const candidate = {
    id: 'clip-1', first_sentence: 0, last_sentence: 2, title: 'Warum der erste Versuch scheiterte',
    description: 'Ein konkreter Fehler mit nachvollziehbarer Lösung.', hashtags: ['#Lernen'],
    angle: 'Fehler verstehen', start_seconds: 0, end_seconds: 30,
    hook_text: 'Der erste Versuch scheiterte am falschen Maßstab.',
    opening: 'Der erste Versuch scheiterte am falschen Maßstab.',
    closing: 'Nach der Korrektur passte das Teil millimetergenau.',
    text: 'Der erste Versuch scheiterte am falschen Maßstab. Ich hatte Zentimeter mit Millimetern verwechselt. Nach der Korrektur passte das Teil millimetergenau.',
  }
  const review = {
    candidate_id: candidate.id, decision: 'accept', standalone: true, payoff_complete: true,
    opener_is_hook: true, misleading: false, promotional: false, story_key: 'Falscher Maßstab',
    hook: { score: 99, reason: 'Konkreter Konflikt direkt im Einstieg.', evidence: 'Der erste Versuch scheiterte' },
    flow: { score: 98, reason: 'Der gezeigte Fehler wird innerhalb des Ausschnitts aufgelöst.', evidence: candidate.closing },
    value: { score: 99, reason: 'Eine nachvollziehbare Ursache samt Korrektur.', evidence: 'Zentimeter mit Millimetern verwechselt' },
    strengths: ['Konkreter Fehler mit belegter Auflösung'], weaknesses: [],
  }
  const [selected] = selectReviewedCandidates([candidate], [review], 1)
  assert.equal(selected.virality_score, 99)
  for (const key of ['hook', 'flow', 'value']) assert.deepEqual(selected.editorial[key], review[key])
  assert.deepEqual(selectReviewedCandidates([candidate], [{ ...review, payoff_complete: false }], 1), [])
})
