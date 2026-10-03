import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

// Use the installed TypeScript compiler; server-only is a Next.js boundary
// marker, which has no runtime purpose in these isolated server-unit tests.
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

const { findClipSegments, clipCountFor } = loadServerModule('heuristic')

function fixture({ opening = 'Drei Stunden Arbeitszeit verlierst du täglich', ending = 'Eine feste Fokuszeit schützt die Arbeitszeit.', duration = 22, complete = true, punctuated = true, tokens } = {}) {
  const textTokens = tokens ?? [...opening.split(' '), ...Array(50).fill('Arbeitszeit'), ...ending.split(' ')]
  const words = textTokens.map((word, index) => ({
    word,
    start: duration * index / textTokens.length,
    end: duration * (index + 1) / textTokens.length,
  }))
  return {
    words,
    sentences: [{ from: 0, to: words.length - 1, start: 0, end: duration, text: textTokens.join(' '), complete }],
    punctuated,
    cased: true,
    topicStarts: new Set([0]),
    topicStrength: new Map(),
    chapterStarts: new Set(),
    chapters: [],
    chapterOf: [-1],
    terms: [textTokens.map((token) => token.toLowerCase())],
  }
}

function select(structure = fixture(), options = {}) {
  return findClipSegments({ structure, durationSeconds: 120, maxClips: 5,
    range: { min: 15, max: 30, target: 22 }, topic: '', language: 'de', ...options })
}

test('even keyword-rich fallback suggestions stay provisional and below 60', () => {
  const clips = select(fixture({ opening: 'Warum verlierst du jeden Tag drei Stunden durch diesen Fehler' }))
  assert.equal(clips.length, 1)
  assert.ok(clips[0].virality_score < 60)
  assert.match(clips[0].score_reasoning, /Ungeprüfter.*max\. 59\/100/)
  assert.match(clips[0].score_reasoning, /redaktionell geprüft/)
})

test('minimum and maximum are inclusive; an undersized or oversized source is not forced into a clip', () => {
  for (const duration of [15, 30]) assert.equal(select(fixture({ duration })).length, 1)
  for (const duration of [14.99, 30.01, 120]) assert.equal(select(fixture({ duration })).length, 0)
})

test('source bounds cannot truncate a complete thought or bypass the minimum', () => {
  assert.equal(select(fixture(), { durationSeconds: 20 }).length, 0)
  assert.equal(select(fixture({ duration: 12 }), { durationSeconds: 12 }).length, 0)
})

test('a hook word at or after three seconds cannot rescue a weak opening', () => {
  const tokens = ['Produktivität', ...Array(58).fill('Arbeitszeit'), 'Fokuszeit.']
  tokens[9] = 'drei' // 60 words across 20s: exactly 3 seconds.
  assert.equal(select(fixture({ duration: 20, tokens })).length, 0)
  tokens[9] = 'Arbeitszeit'
  tokens[8] = 'drei'
  assert.equal(select(fixture({ duration: 20, tokens })).length, 1)
})

test('weak material is not rescued by matching the requested topic', () => {
  const weak = fixture({ opening: 'Du lernst heute etwas über Arbeitszeit' })
  assert.equal(select(weak).length, 0)
  assert.equal(select(weak, { topic: 'Arbeitszeit Fokuszeit Produktivität' }).length, 0)
  const good = fixture()
  assert.equal(select(good)[0].virality_score, select(good, { topic: 'Arbeitszeit Fokuszeit' })[0].virality_score)
})

test('promotional, context-dependent and unresolved question endings are rejected', () => {
  const bad = [
    fixture({ ending: 'Abonniere den Kanal für weitere Tipps.' }),
    fixture({ opening: 'Und drei Stunden Arbeitszeit verlierst du täglich' }),
    fixture({ opening: 'Das sind drei Stunden Arbeitszeit täglich' }),
    fixture({ ending: 'Warum verlierst du trotzdem drei Stunden?' }),
    fixture({ complete: false }),
  ]
  for (const structure of bad) assert.equal(select(structure).length, 0)
})

test('unpunctuated questions and invalid limits do not create fallback clips', () => {
  assert.equal(select(fixture({ opening: 'Warum verlierst du drei Stunden', ending: 'Arbeitszeit', punctuated: false })).length, 0)
  for (const options of [
    { maxClips: 0 }, { maxClips: NaN }, { durationSeconds: Infinity },
    { range: { min: 30, max: 15, target: 22 } },
    { range: { min: 15, max: 30, target: NaN } },
  ]) assert.equal(select(fixture(), options).length, 0)
})

test('clip targets grow beyond eight with source duration', () => {
  assert.equal(clipCountFor(30), 1)
  assert.equal(clipCountFor(960), 8)
  assert.equal(clipCountFor(1800), 15)
  assert.equal(clipCountFor(3600), 30)
  assert.equal(clipCountFor(7200), 60)
  assert.equal(clipCountFor(Infinity), 1)
})
