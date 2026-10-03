import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const loaded = new Map()
function loadServerModule(name) {
  if (loaded.has(name)) return loaded.get(name)
  const source = readFileSync(new URL(`../src/services/ai/${name}.ts`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const compiled = { exports: {} }
  const localRequire = (dependency) => dependency === 'server-only' ? {} :
    dependency.startsWith('./') ? loadServerModule(dependency.slice(2)) : require(dependency)
  new Function('require', 'module', 'exports', outputText)(localRequire, compiled, compiled.exports)
  loaded.set(name, compiled.exports)
  return compiled.exports
}

const { analyzeStructure, pauseAfter } = loadServerModule('structure')
const { parseJson3 } = loadServerModule('captions')
const { findClipSegments } = loadServerModule('heuristic')

function transcript(text, { step = 0.35, pauseAt = -1, pause = 0, speakerAt = Infinity } = {}) {
  return text.split(' ').map((word, index) => ({
    word,
    start: index * step + (index > pauseAt ? pause : 0),
    end: index * step + (index > pauseAt ? pause : 0) + step - 0.03,
    confidence: 0.98,
    speaker: index >= speakerAt ? 1 : 0,
  }))
}

test('short punctuated sources do not cut a sentence at a breathing pause', () => {
  const words = transcript('Drei Stunden sparst du jeden Tag mit einer festen Fokuszeit ohne ständig auf neue Nachrichten zu reagieren. Blockiere dafür einen Termin im Kalender.', { pauseAt: 8, pause: 0.8 })
  const structure = analyzeStructure(words)
  assert.equal(structure.punctuated, true)
  assert.equal(structure.sentences.length, 2)
  assert.equal(structure.sentences[0].text, 'Drei Stunden sparst du jeden Tag mit einer festen Fokuszeit ohne ständig auf neue Nachrichten zu reagieren.')
  assert.ok(structure.sentences.every((sentence) => sentence.complete))
})

test('measured word duration is never mistaken for a dramatic pause', () => {
  const measured = { word: 'Ja', start: 0, end: 1.1, confidence: 0.98 }
  const next = { word: 'wirklich', start: 1.2, end: 1.6 }
  assert.ok(Math.abs(pauseAfter(measured, next) - 0.1) < 1e-6)
  const { confidence, ...caption } = measured
  assert.ok(pauseAfter(caption, next) > 0.8, 'estimated subtitle ends still expose likely pauses')
})

test('speaker interruptions are not complete endings and repairs never steal answer words', () => {
  const words = transcript('Ich zeige dir jetzt den nein Das funktioniert ganz anders. Eine feste Fokuszeit spart Zeit.', { speakerAt: 6 })
  const structure = analyzeStructure(words)
  assert.equal(structure.sentences[0].text, 'Ich zeige dir jetzt den')
  assert.equal(structure.sentences[0].complete, false)
  assert.equal(structure.sentences[1].text, 'nein Das funktioniert ganz anders.')
  assert.notEqual(structure.sentences[1].startsMidSentence, true, 'a new speaker may begin a new thought')
})

test('a forced split remains visible as a continuation rather than a usable hook', () => {
  const words = transcript(Array(100).fill('Arbeitszeit').join(' '), { step: 0.3 })
  const structure = analyzeStructure(words)
  assert.ok(structure.sentences.length > 1)
  assert.equal(structure.sentences[0].complete, false)
  assert.equal(structure.sentences[1].startsMidSentence, true)
})

test('the source ending with a dangling conjunction is not treated as a finished thought', () => {
  const structure = analyzeStructure(transcript('drei stunden sparst du jeden tag weil'))
  assert.equal(structure.sentences.at(-1).complete, false)
})

test('multiword caption segments receive ordered times within their own span', () => {
  const words = parseJson3([{ tStartMs: 1000, dDurationMs: 4000, segs: [
    { utf8: 'Nie wieder', tOffsetMs: 0 },
    { utf8: 'Zeit verschwenden.', tOffsetMs: 2000 },
  ] }])
  assert.deepEqual(words.map((word) => word.word), ['Nie', 'wieder', 'Zeit', 'verschwenden.'])
  assert.equal(words[0].start, 1)
  assert.ok(words[1].start > 1 && words[1].start < 3)
  assert.equal(words[2].start, 3)
  assert.ok(words[3].start > 3 && words[3].end <= 5)
  assert.ok(words.every((word, index) => index === 0 || word.start >= words[index - 1].end))
})

test('equal caption offsets and un-timed styling segments do not stack spoken words', () => {
  for (const segs of [
    [{ utf8: 'Nie wieder', tOffsetMs: 0 }, { utf8: 'Zeit verlieren.', tOffsetMs: 0 }],
    [{ utf8: 'Nie wieder' }, { utf8: 'Zeit verlieren.' }],
  ]) {
    const words = parseJson3([{ tStartMs: 0, dDurationMs: 4000, segs }])
    assert.equal(words.length, 4)
    assert.ok(words.every((word, index) => index === 0 || word.start > words[index - 1].start))
    assert.ok(words.at(-1).end <= 4)
  }
})

function suggestion(tokens, startsMidSentence = false) {
  const words = transcript(tokens.join(' '), { step: 22 / tokens.length })
  const structure = {
    words,
    sentences: [{ from: 0, to: words.length - 1, start: 0, end: 22, text: tokens.join(' '), complete: true, startsMidSentence }],
    punctuated: true, cased: true, topicStarts: new Set([0]), topicStrength: new Map(),
    chapterStarts: new Set(), chapters: [], chapterOf: [-1], terms: [tokens.map((word) => word.toLowerCase())],
  }
  return findClipSegments({ structure, durationSeconds: 120, maxClips: 2, range: { min: 15, max: 30, target: 22 }, topic: '', language: 'de' })
}

test('fallback rejects technical continuation starts and filler words reduce its score', () => {
  const clean = ['Drei', 'Stunden', ...Array(52).fill('Arbeitszeit'), 'Fokuszeit.']
  const hesitant = [...clean]
  for (let i = 20; i < 30; i++) hesitant[i] = 'ähm'
  assert.equal(suggestion(clean, true).length, 0)
  const good = suggestion(clean)
  const bad = suggestion(hesitant)
  assert.equal(good.length, 1)
  assert.equal(bad.length, 1)
  assert.ok(bad[0].virality_score < good[0].virality_score)
})
