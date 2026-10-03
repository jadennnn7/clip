import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import ts from 'typescript'

// Test real window generation and prompt formatting without loading server-only
// or making an API request. Run with node scripts/test-discovery-windows.mjs.
async function loadModule(relativePath, dependencies = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const loaded = { exports: {} }
  const resolve = (name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected import: ${name}`)
    return dependencies[name]
  }
  compileFunction(outputText, ['require', 'module', 'exports'])(resolve, loaded, loaded.exports)
  return loaded.exports
}

const prompts = await loadModule('../src/services/ai/prompts.ts')
const { discoveryWindows } = await loadModule('../src/services/ai/discovery.ts', { './prompts': prompts })
const lengthRange = { min: 20, max: 75 }

function structure(duration = 1200, chapters = []) {
  const sentences = Array.from({ length: Math.ceil(duration / 10) }, (_, index) => ({
    from: index, to: index, start: index * 10, end: Math.min(duration, index * 10 + 9),
    text: `Geschichte Nummer ${index}.`, complete: true,
  }))
  return {
    sentences, chapters, words: [], punctuated: true, cased: true,
    topicStarts: new Set([0]), topicStrength: new Map(), chapterStarts: new Set(),
    chapterOf: sentences.map(() => -1), terms: sentences.map(() => []),
  }
}

test('long videos are searched chronologically with every sentence covered', () => {
  const source = structure()
  const windows = discoveryWindows(source, 1200, 4, lengthRange)
  assert.equal(windows.length, 4)
  assert.deepEqual(windows.map(({ firstSentence }) => firstSentence), [0, 30, 60, 90])
  for (let sentence = 0; sentence < source.sentences.length; sentence++) {
    assert.ok(windows.some(({ firstSentence, lastSentence }) => firstSentence <= sentence && sentence <= lastSentence), `Missing sentence ${sentence}`)
  }
  assert.equal(windows.at(-1).lastSentence, source.sentences.length - 1)
  assert.equal(source.sentences.length, 120, 'discovery leaves the source intact')
})

test('lookahead preserves complete clips that cross a chronological search boundary', () => {
  const source = structure()
  const windows = discoveryWindows(source, 1200, 4, lengthRange)
  assert.ok(windows[0].lastSentence > windows[1].firstSentence)
  // Each interval fitting the requested length must remain wholly visible in
  // at least one request, including starts immediately before every boundary.
  for (let first = 0; first < source.sentences.length; first++) {
    for (let last = first; last < source.sentences.length; last++) {
      const duration = source.sentences[last].end - source.sentences[first].start
      if (duration > lengthRange.max) break
      if (duration < lengthRange.min) continue
      assert.ok(windows.some((window) => window.firstSentence <= first && window.lastSentence >= last), `Clip ${first}:${last} is split`)
    }
  }
})

test('sliced prompts retain exact global sentence IDs and source timestamps', () => {
  const [first, second] = discoveryWindows(structure(), 1200, 4, lengthRange)
  assert.match(first.transcript, /\[S0 \| 0\.000–9\.000s\]/)
  assert.match(second.transcript, /^\[S30 \| 300\.000–309\.000s\]/)
  assert.match(second.transcript, /\[S67 \| 670\.000–679\.000s\]/)
  assert.doesNotMatch(second.transcript, /\[S0 \|/)
  assert.equal(second.startSeconds, 300)
  assert.equal(second.endSeconds, 679)
})

test('window counts scale with duration and requested clips beyond eight requests', () => {
  const long = structure(7200)
  assert.equal(discoveryWindows(long, 7200, 20, lengthRange).length, 20)
  assert.equal(discoveryWindows(long, 7200, 3, lengthRange).length, 3)
  assert.equal(discoveryWindows(structure(601), 601, 10, lengthRange).length, 3)
})

test('each window carries its active chapter and local chapter changes only', () => {
  const chapters = [
    { start: 0, title: 'Intro' },
    { start: 200, title: 'Erste Runde' },
    { start: 320, title: '' },
    { start: 630, title: 'Dritte Runde' },
    { start: 680, title: 'Später' },
  ]
  const windows = discoveryWindows(structure(1200, chapters), 1200, 4, lengthRange)
  const second = windows[1].transcript
  assert.ok(second.startsWith('## Erste Runde\n[S30'))
  assert.match(second, /## Kapitel 3\n\[S32/)
  assert.match(second, /## Dritte Runde\n\[S63/)
  assert.doesNotMatch(second, /## Intro|## Später/)
  assert.equal((second.match(/## Erste Runde/g) ?? []).length, 1)
})

test('short videos and a single requested clip keep one complete source window', () => {
  for (const [duration, maxClips] of [[600, 8], [1200, 1]]) {
    const source = structure(duration)
    const windows = discoveryWindows(source, duration, maxClips, lengthRange)
    assert.equal(windows.length, 1)
    assert.equal(windows[0].firstSentence, 0)
    assert.equal(windows[0].lastSentence, source.sentences.length - 1)
    assert.equal(windows[0].transcript, prompts.formatSentencesForPrompt(source.sentences))
  }
})

test('empty transcripts and empty chronological cores do not produce requests', () => {
  assert.deepEqual(discoveryWindows(structure(0), 1200, 4, lengthRange), [])
  assert.deepEqual(discoveryWindows(structure(), 1200, 0, lengthRange), [])
  const sparse = structure()
  sparse.sentences = sparse.sentences.slice(110)
  const windows = discoveryWindows(sparse, 1200, 4, lengthRange)
  assert.equal(windows.length, 1)
  assert.equal(windows[0].firstSentence, 0)
  assert.equal(windows[0].startSeconds, 1100)
})

test('default formatting is unchanged and an explicit offset changes only IDs', () => {
  const source = structure(20)
  const normal = prompts.formatSentencesForPrompt(source.sentences)
  assert.equal(normal, '[S0 | 0.000–9.000s] Geschichte Nummer 0.\n[S1 | 10.000–19.000s] Geschichte Nummer 1.')
  assert.equal(prompts.formatSentencesForPrompt(source.sentences, [], 40), normal.replace('[S0 ', '[S40 ').replace('[S1 ', '[S41 '))
})

test('window prompts request distinct stories and preserve global IDs and durations', () => {
  const prompt = prompts.buildAnalysisPrompt({
    transcript: '[S30 | 300.000–309.000s] Beispiel.', durationSeconds: 1200,
    maxClips: 8, targetClips: 3, lengthRange,
    searchWindow: { startSeconds: 300, endSeconds: 679, index: 2, count: 4 },
  })
  assert.match(prompt, /bis zu 8 plausible Kandidaten/)
  assert.match(prompt, /nach 3 unterschiedlichen verwendbaren Momenten/)
  assert.match(prompt, /Höre nach dem ersten guten Fund nicht auf/)
  assert.match(prompt, /Suchabschnitt 2 von 4: 300\.000 bis 679\.000 Sekunden/)
  assert.match(prompt, /nicht bei null neu zählen/)
  assert.match(prompt, /zwischen 20 und 75 Sekunden/)
  assert.match(prompt, /schwache Füllclips bleiben ausgeschlossen/)
  assert.ok(prompt.includes('[S30 | 300.000–309.000s] Beispiel.'))
})

test('a window targeting one final clip still seeks alternatives for review within its candidate budget', () => {
  const prompt = (maxClips) => prompts.buildAnalysisPrompt({
    transcript: 'Beispiel.', durationSeconds: 1200, maxClips, targetClips: 1,
  })
  assert.match(prompt(8), /nach 3 unterschiedlichen verwendbaren Momenten/)
  assert.match(prompt(2), /nach 2 unterschiedlichen verwendbaren Momenten/)
  assert.match(prompt(1), /nach 1 unterschiedlichen verwendbaren Momenten/)
})
