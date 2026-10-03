import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { compileFunction } from 'node:vm'
import ts from 'typescript'

// Exercise the real orchestration without loading server-only, calling an API,
// or requiring Node's optional TypeScript loader. Only explicit imports resolve.
const require = createRequire(import.meta.url)
const compiled = new Map()
async function loadModule(relativePath, dependencies = {}, environment = {}, timers = globalThis) {
  if (!compiled.has(relativePath)) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
      },
    })
    compiled.set(relativePath, compileFunction(outputText, ['require', 'module', 'exports', 'process', 'setTimeout', 'clearTimeout'], { filename: relativePath }))
  }
  const loaded = { exports: {} }
  const resolve = (name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name]
    if (name === 'server-only') return {}
    if (name === 'zod' || name.startsWith('node:')) return require(name)
    throw new Error(`Unmocked import: ${name} from ${relativePath}`)
  }
  compiled.get(relativePath)(resolve, loaded, loaded.exports, { env: environment }, timers.setTimeout, timers.clearTimeout)
  return loaded.exports
}

const prompts = await loadModule('../src/services/ai/prompts.ts')
const editorial = await loadModule('../src/services/ai/editorial.ts')
const discovery = await loadModule('../src/services/ai/discovery.ts', { './prompts': prompts })

function transcript() {
  const passages = [
    [0.25, 4.8, 'Willkommen zur heutigen Geschichte aus unserem Laden.'],
    [10.125, 16.9, 'Das teuerste Angebot war als Erstes ausverkauft.'],
    [17.1, 25.5, 'Unsere Kunden zahlten für Hilfe innerhalb einer Stunde statt für mehr Funktionen.'],
    [26.2, 38.875, 'Seitdem verkaufen wir schnelle Antworten und die Beschwerden gingen zurück.'],
    [45.25, 51.5, 'Mein Handy schlief eine Woche in der Küche.'],
    [52, 60, 'Vorher las ich nach jedem Aufwachen alle neuen Nachrichten auf dem Bildschirm.'],
    [61, 72.625, 'Ohne Handy schlief ich endlich nach wenigen Minuten wieder ein.'],
  ]
  const words = []
  const sentences = passages.map(([start, end, text]) => {
    const tokens = text.split(' ')
    const from = words.length
    tokens.forEach((word, index) => words.push({
      word,
      start: start + index * (end - start) / tokens.length,
      end: start + (index + 1) * (end - start) / tokens.length,
    }))
    return { from, to: words.length - 1, start, end, text, complete: true }
  })
  return {
    words, sentences, punctuated: true, cased: true, chapters: [],
    topicStarts: new Set([0, 4]), topicStrength: new Map(), chapterStarts: new Set(),
    chapterOf: sentences.map(() => -1), terms: sentences.map(() => []),
  }
}

const proposals = () => [
  {
    first_sentence: 1, last_sentence: 3, title: 'Schnelle Hilfe statt mehr Funktionen',
    description: 'Unser teuerstes Angebot löste ein konkretes Problem.',
    hashtags: ['#Kunden', '#Service', '#Angebot'], angle: 'Kunden bezahlen für schnell gelöste Probleme.',
  },
  {
    first_sentence: 4, last_sentence: 6, title: 'Das Handy blieb nachts in der Küche',
    description: 'Eine kleine Änderung half beim Wiedereinschlafen.',
    hashtags: ['#Schlaf', '#Handy', '#Alltag'], angle: 'Den Bildschirm außer Reichweite bringen.',
  },
]

const response = (data) => ({ candidates: [{ finishReason: 'STOP' }], text: JSON.stringify(data) })
const reviewCandidates = (request) => JSON.parse(request.contents.slice(request.contents.indexOf('\n') + 1))

function reviewed(request, { decision = 'accept', scores = [86, 94] } = {}) {
  return response({ reviews: reviewCandidates(request).map((clip, index) => ({
    candidate_id: clip.candidate_id, decision, standalone: true, payoff_complete: true,
    opener_is_hook: true, misleading: false, promotional: false, story_key: clip.candidate_id,
    hook: { score: scores[index] ?? 88, reason: 'Konkrete überraschende Situation am Einstieg.', evidence: clip.opening_first_3_seconds },
    flow: { score: scores[index] ?? 88, reason: 'Die Veränderung wird mit ihrem Ergebnis beendet.', evidence: clip.closing_sentences },
    value: { score: scores[index] ?? 88, reason: 'Der Clip zeigt ein nachvollziehbares persönliches Ergebnis.', evidence: clip.closing_sentences },
    strengths: ['Vollständige Geschichte'], weaknesses: ['Persönliche Erfahrung ohne weitere Fälle'],
  })) })
}

async function analysisHarness(steps, { environment = {}, onWait } = {}) {
  const calls = []
  const clientOptions = []
  const waits = []
  class GoogleGenAI {
    constructor(options) {
      clientOptions.push(options)
      this.models = {
        generateContent: async (request) => {
          const index = calls.push(request) - 1
          assert.ok(index < steps.length, 'Unexpected additional model request')
          const step = steps[index]
          return typeof step === 'function' ? step(request) : step
        },
      }
    }
  }
  const { analyzeTranscript, describeAiFailure } = await loadModule('../src/services/ai/analyze.ts', {
    '@google/genai': { GoogleGenAI, FinishReason: { STOP: 'STOP' } },
    './prompts': prompts, './editorial': editorial, './discovery': discovery,
  }, { GEMINI_API_KEY: 'test-only-not-a-real-key', ...environment }, {
    setTimeout(callback, ms) {
      waits.push(ms)
      queueMicrotask(() => { onWait?.(); callback() })
      return 0
    },
    clearTimeout() {},
  })
  const structure = transcript()
  return {
    calls, clientOptions, waits, structure, analyzeTranscript, describeAiFailure,
    run: (options = {}) => analyzeTranscript({ structure, durationSeconds: 73.3, maxClips: 2, ...options }),
  }
}

test('discovery and independent review run in order on exact inclusive sentence ranges', async () => {
  const harness = await analysisHarness([response({ candidates: proposals() }), reviewed])
  const phases = []
  const controller = new AbortController()
  const result = await harness.run({ signal: controller.signal, onPhase: (phase) => phases.push(phase) })
  assert.deepEqual(phases, ['discovery', 'review'])
  assert.equal(harness.calls.length, 2)
  assert.equal(harness.clientOptions.length, 1, 'both passes share the configured client')
  assert.equal(harness.calls[0].config.systemInstruction, prompts.VIRALITY_SYSTEM_PROMPT)
  assert.equal(harness.calls[1].config.systemInstruction, prompts.EDITORIAL_REVIEW_SYSTEM_PROMPT)
  for (const call of harness.calls) assert.equal(call.config.abortSignal, controller.signal)
  assert.match(harness.calls[0].contents, /\[S1 \| 10\.125–16\.900s\]/)
  assert.match(harness.calls[0].contents, /\[S6 \| 61\.000–72\.625s\]/)

  const reviewedClips = reviewCandidates(harness.calls[1])
  assert.equal(reviewedClips[0].transcript, harness.structure.sentences.slice(1, 4).map(({ text }) => text).join(' '))
  assert.equal(reviewedClips[1].transcript, harness.structure.sentences.slice(4, 7).map(({ text }) => text).join(' '))
  assert.equal(reviewedClips[0].duration_seconds, 38.875 - 10.125)
  assert.equal(result[0].title, proposals()[1].title, 'the stronger later story ranks first')
  assert.deepEqual(result.map(({ start_seconds, end_seconds }) => [start_seconds, end_seconds]), [[45.25, 72.625], [10.125, 38.875]])
})

const apiFailure = (status) => () => { throw Object.assign(new Error(`API ${status}`), { status }) }

test('persistent 503 during review switches models and preserves the complete editorial result', async () => {
  const harness = await analysisHarness([
    response({ candidates: proposals() }), apiFailure(503), apiFailure(503), reviewed,
  ])
  const result = await harness.run()
  assert.equal(result.length, 2)
  assert.ok(result.every((clip) => clip.editorial?.method === 'ai'))
  assert.deepEqual(harness.calls.map(({ model }) => model), [
    'gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.6-flash',
  ])
  for (const request of harness.calls.slice(2)) {
    assert.deepEqual({ ...request, model: harness.calls[1].model }, harness.calls[1])
  }
  assert.deepEqual(harness.waits, [3000])
  assert.equal(harness.clientOptions[0].httpOptions.retryOptions.attempts, 1)
})

test('a temporary overload recovers on the primary model before switching', async () => {
  const harness = await analysisHarness([apiFailure(503), response({ candidates: proposals() }), reviewed])
  assert.equal((await harness.run()).length, 2)
  assert.ok(harness.calls.every(({ model }) => model === 'gemini-3.8-flash'))
})

test('transient failures have a bounded retry budget even when every model fails', async () => {
  for (const status of [429, 500, 502, 503, 504]) {
    const harness = await analysisHarness(Array.from({ length: 5 }, () => apiFailure(status)))
    await assert.rejects(harness.run(), { status })
    // Einmal Geduld mit dem Hauptmodell, dann jedes Ersatzmodell der Reihe nach.
    assert.deepEqual(harness.calls.map(({ model }) => model), [
      'gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite',
    ])
    assert.deepEqual(harness.waits, [3000])
  }
})

test('invalid requests and credentials are not retried or routed to another model', async () => {
  for (const status of [400, 401, 403]) {
    const harness = await analysisHarness([apiFailure(status)])
    await assert.rejects(harness.run(), { status })
    assert.equal(harness.calls.length, 1)
    assert.deepEqual(harness.waits, [])
  }
})

test('model overrides are honored and an unavailable model switches immediately', async () => {
  const harness = await analysisHarness([apiFailure(404), response({ candidates: proposals() }), reviewed], {
    environment: { GEMINI_MODEL: ' primary-model ', GEMINI_FALLBACK_MODEL: ' backup-model ' },
  })
  assert.equal((await harness.run()).length, 2)
  assert.deepEqual(harness.calls.map(({ model }) => model), ['primary-model', 'backup-model', 'backup-model'])
  assert.deepEqual(harness.waits, [])
})

test('an unavailable fallback fails clearly and duplicate models are not retried for 404', async () => {
  const harness = await analysisHarness(Array.from({ length: 4 }, () => apiFailure(404)))
  await assert.rejects(harness.run(), { status: 404 })
  assert.equal(harness.calls.length, 4)
  assert.match(harness.describeAiFailure({ status: 404 }), /Modell ist nicht verfügbar/)
  const duplicate = await analysisHarness([apiFailure(404)], {
    environment: { GEMINI_MODEL: 'same-model', GEMINI_FALLBACK_MODEL: 'same-model' },
  })
  await assert.rejects(duplicate.run(), { status: 404 })
  assert.equal(duplicate.calls.length, 1)
})

test('cancellation during retry backoff prevents any retry or model switch', async () => {
  const controller = new AbortController()
  const harness = await analysisHarness([apiFailure(503)], { onWait: () => controller.abort() })
  await assert.rejects(harness.run({ signal: controller.signal }), { name: 'AbortError' })
  assert.equal(harness.calls.length, 1)
})

test('discovery supplies no score anchors or self-justification to the independent reviewer', async () => {
  const candidates = proposals().map((proposal) => ({
    ...proposal, angle: 'ANCHOR_SHOULD_NOT_REACH_REVIEW',
    virality_score: 99, score_reasoning: 'ANCHOR_SCORE_REASON',
  }))
  const harness = await analysisHarness([response({ candidates }), reviewed])
  await harness.run()
  const discoverySchema = harness.calls[0].config.responseJsonSchema
  assert.equal(discoverySchema.properties.candidates.items.properties.virality_score, undefined)
  assert.equal(discoverySchema.$schema, undefined)
  assert.doesNotMatch(harness.calls[1].contents, /ANCHOR_|virality_score|score_reasoning/)
  for (const clip of reviewCandidates(harness.calls[1])) {
    assert.equal(clip.angle, undefined)
    assert.equal(clip.hook, undefined)
    assert.equal(clip.virality_score, undefined)
  }
})

test('review receives neighboring source sentences separately from the audible clip', async () => {
  const harness = await analysisHarness([response({ candidates: proposals() }), reviewed])
  await harness.run()
  const [first, second] = reviewCandidates(harness.calls[1])
  assert.deepEqual(first.boundary_context, {
    before: harness.structure.sentences[0].text,
    after: harness.structure.sentences.slice(4, 6).map(({ text }) => text).join(' '),
  })
  assert.deepEqual(second.boundary_context, {
    before: harness.structure.sentences.slice(2, 4).map(({ text }) => text).join(' '),
    after: '',
  })
  assert.ok(!first.transcript.includes(first.boundary_context.before))
  assert.ok(!first.transcript.includes(first.boundary_context.after))
})

test('neighboring context cannot serve as positive hook, payoff or value evidence', async () => {
  for (const [criterion, side] of [['hook', 'before'], ['flow', 'after'], ['value', 'before']]) {
    const harness = await analysisHarness([
      response({ candidates: [proposals()[0]] }),
      (request) => {
        const [clip] = reviewCandidates(request)
        const data = JSON.parse(reviewed(request, { scores: [99] }).text)
        data.reviews[0][criterion].evidence = clip.boundary_context[side]
        return response(data)
      },
      response({ candidates: [] }),
    ])
    assert.deepEqual(await harness.run(), [], `${criterion} quoted from context ${side}`)
  }
})

test('empty discovery gets one corrective search but never manufactures filler clips', async () => {
  const harness = await analysisHarness([response({ candidates: [] }), response({ candidates: [] })])
  assert.deepEqual(await harness.run(), [])
  assert.equal(harness.calls.length, 2)
  assert.match(harness.calls[1].contents, /Korrekturrunde/)
})

test('out-of-range discovery candidates cannot be shortened into unreviewed replacement content', async () => {
  const candidates = [{ ...proposals()[0], first_sentence: 0, last_sentence: 6 }]
  const harness = await analysisHarness([response({ candidates }), response({ candidates: [] })])
  assert.deepEqual(await harness.run({ lengthRange: { min: 20, max: 40 } }), [])
  assert.equal(harness.calls.length, 2)
  assert.match(harness.calls[1].contents, /Dauer außerhalb des Längenbereichs/)
})

test('a review may still reject every candidate after one corrective search', async () => {
  const harness = await analysisHarness([
    response({ candidates: proposals() }),
    (request) => reviewed(request, { decision: 'reject', scores: [99, 99] }),
    response({ candidates: proposals() }),
    (request) => reviewed(request, { decision: 'reject', scores: [99, 99] }),
  ])
  assert.deepEqual(await harness.run(), [])
  assert.equal(harness.calls.length, 3, 'identical rejected cuts are not reviewed again')
})

test('a rejected cut is revised using feedback and reviewed independently before selection', async () => {
  const harness = await analysisHarness([
    response({ candidates: [{ ...proposals()[0], last_sentence: 2 }] }),
    (request) => {
      const data = JSON.parse(reviewed(request).text)
      data.reviews[0].payoff_complete = false
      data.reviews[0].weaknesses = ['MISSING_RESULT_MARKER']
      return response(data)
    },
    response({ candidates: [proposals()[0]] }),
    reviewed,
  ])
  const result = await harness.run({ maxClips: 1, lengthRange: { min: 10, max: 40 } })
  assert.equal(result.length, 1)
  assert.equal(result[0].end_seconds, 38.875)
  assert.match(harness.calls[2].contents, /Auflösung fehlt im Ausschnitt/)
  assert.match(harness.calls[2].contents, /MISSING_RESULT_MARKER/)
  assert.doesNotMatch(harness.calls[3].contents, /MISSING_RESULT_MARKER|Korrekturrunde/)
  assert.equal(harness.calls[3].config.systemInstruction, prompts.EDITORIAL_REVIEW_SYSTEM_PROMPT)
})

test('cancellation before the corrective search prevents further API requests', async () => {
  const controller = new AbortController()
  const harness = await analysisHarness([response({ candidates: [] })])
  let discoveries = 0
  await assert.rejects(harness.run({
    signal: controller.signal,
    onPhase: (phase) => { if (phase === 'discovery' && ++discoveries === 2) controller.abort() },
  }), { name: 'AbortError' })
  assert.equal(harness.calls.length, 1)
})

test('maxClips caps the final ranked selection, not discovery at the first plausible story', async () => {
  const harness = await analysisHarness([response({ candidates: proposals() }), reviewed])
  const result = await harness.run({ maxClips: 1 })
  assert.equal(reviewCandidates(harness.calls[1]).length, 2)
  assert.equal(result.length, 1)
  assert.equal(result[0].title, proposals()[1].title)
})

test('one approved clip triggers a further search and both rounds contribute to the result', async () => {
  const harness = await analysisHarness([
    response({ candidates: [proposals()[0]] }), reviewed,
    response({ candidates: proposals() }), reviewed,
  ])
  const result = await harness.run()
  assert.equal(result.length, 2)
  assert.deepEqual(new Set(result.map(({ title }) => title)), new Set(proposals().map(({ title }) => title)))
  assert.match(harness.calls[2].contents, /1 von 2 gewünschten Clips/)
  assert.equal(reviewCandidates(harness.calls[3]).length, 1, 'the existing exact cut is not reviewed twice')
  assert.notEqual(reviewCandidates(harness.calls[1])[0].candidate_id, reviewCandidates(harness.calls[3])[0].candidate_id)
})

test('empty or failed supplementary searches preserve already reviewed clips', async () => {
  for (const next of [response({ candidates: [] }), apiFailure(400)]) {
    const harness = await analysisHarness([response({ candidates: [proposals()[0]] }), reviewed, next])
    const [result] = await harness.run()
    assert.equal(result.title, proposals()[0].title)
    assert.equal(result.editorial.method, 'ai')
    assert.equal(harness.calls.length, 3)
  }
})

test('duplicates across rounds do not inflate the clip count', async () => {
  const sameStory = (request) => {
    const result = JSON.parse(reviewed(request).text)
    result.reviews.forEach((review) => { review.story_key = 'same-story' })
    return response(result)
  }
  const harness = await analysisHarness([
    response({ candidates: [proposals()[0]] }), sameStory,
    response({ candidates: [proposals()[1]] }), sameStory,
  ])
  assert.equal((await harness.run()).length, 1)
  assert.equal(harness.calls.length, 4)
})

test('a higher-scoring supplementary cut cannot replace two existing clips with one', async () => {
  const harness = await analysisHarness([
    response({ candidates: proposals() }), reviewed,
    response({ candidates: [{ ...proposals()[0], last_sentence: 6, title: 'Both stories combined' }] }),
    (request) => reviewed(request, { scores: [99] }),
  ])
  const result = await harness.run({ maxClips: 3 })
  assert.equal(result.length, 2)
  assert.deepEqual(new Set(result.map(({ title }) => title)), new Set(proposals().map(({ title }) => title)))
})

test('cancellation after an approved clip still aborts supplementary discovery', async () => {
  const controller = new AbortController()
  const harness = await analysisHarness([response({ candidates: [proposals()[0]] }), reviewed])
  let searches = 0
  await assert.rejects(harness.run({
    signal: controller.signal,
    onPhase: (phase) => { if (phase === 'discovery' && ++searches === 2) controller.abort() },
  }), { name: 'AbortError' })
  assert.equal(harness.calls.length, 2)
})

test('long videos collect clips from separate windows with global sentence IDs', async () => {
  const structure = transcript()
  const later = transcript()
  const wordOffset = structure.words.length
  const sentenceOffset = structure.sentences.length
  structure.words.push(...later.words.map((word) => ({ ...word, start: word.start + 650, end: word.end + 650 })))
  structure.sentences.push(...later.sentences.map((sentence) => ({
    ...sentence, from: sentence.from + wordOffset, to: sentence.to + wordOffset,
    start: sentence.start + 650, end: sentence.end + 650,
  })))
  const lateProposal = { ...proposals()[1], first_sentence: 4 + sentenceOffset, last_sentence: 6 + sentenceOffset }
  const harness = await analysisHarness([
    response({ candidates: [proposals()[0]] }), reviewed,
    response({ candidates: [lateProposal] }), reviewed,
  ])
  const result = await harness.run({ structure, durationSeconds: 900 })
  assert.equal(result.length, 2)
  assert.ok(result.some((clip) => clip.start_seconds < 100))
  assert.ok(result.some((clip) => clip.start_seconds > 650))
  assert.match(harness.calls[2].contents, /\[S11 \| 695\.250/)
  assert.equal(harness.calls.length, 4)
})

test('zero maxClips and an empty transcript cause no model request', async () => {
  const harness = await analysisHarness([])
  assert.deepEqual(await harness.run({ maxClips: 0 }), [])
  assert.deepEqual(await harness.run({ structure: { ...harness.structure, sentences: [] } }), [])
  assert.equal(harness.calls.length, 0)
})

test('blocked, truncated, malformed and schema-invalid discovery responses throw', async () => {
  const cases = [
    [{ promptFeedback: { blockReason: 'SAFETY' } }, /Analyse abgelehnt/],
    [{ candidates: [{ finishReason: 'MAX_TOKENS' }], text: '{"candidates":[]}' }, /vorzeitig beendet/],
    [{ candidates: [{ finishReason: 'STOP' }], text: '{"candidates":[' }, /kein auswertbares JSON/],
    [response({ segments: [] }), /unerwarteter Form/],
    [response({ candidates: [{ ...proposals()[0], first_sentence: 1.5 }] }), /unerwarteter Form/],
  ]
  for (const [reply, pattern] of cases) {
    const harness = await analysisHarness([reply])
    await assert.rejects(harness.run(), pattern)
    assert.equal(harness.calls.length, 1)
  }
})

test('incomplete, duplicate and malformed reviewer output throws instead of accepting a partial answer', async () => {
  const variants = [
    (request) => {
      const data = JSON.parse(reviewed(request).text)
      data.reviews.pop()
      return response(data)
    },
    (request) => {
      const data = JSON.parse(reviewed(request).text)
      data.reviews[1].candidate_id = data.reviews[0].candidate_id
      return response(data)
    },
    (request) => {
      const data = JSON.parse(reviewed(request).text)
      delete data.reviews[0].payoff_complete
      return response(data)
    },
    () => ({ candidates: [{ finishReason: 'MAX_TOKENS' }], text: '{"reviews":[]}' }),
  ]
  for (const variant of variants) {
    const harness = await analysisHarness([response({ candidates: proposals() }), variant])
    await assert.rejects(harness.run(), /nicht alle Kandidaten|unerwarteter Form|vorzeitig beendet/)
    assert.equal(harness.calls.length, 2)
  }
})

test('an already aborted signal prevents the first model request', async () => {
  const harness = await analysisHarness([])
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(harness.run({ signal: controller.signal }), { name: 'AbortError' })
  assert.equal(harness.calls.length, 0)
})

test('cancellation while discovery resolves prevents a later review request', async () => {
  const controller = new AbortController()
  const harness = await analysisHarness([() => {
    controller.abort()
    return response({ candidates: proposals() })
  }])
  await assert.rejects(harness.run({ signal: controller.signal }), { name: 'AbortError' })
  assert.equal(harness.calls.length, 1)
})

test('cancellation between the discovery and review phases prevents the second model call', async () => {
  const harness = await analysisHarness([response({ candidates: proposals() })])
  const controller = new AbortController()
  await assert.rejects(harness.run({
    signal: controller.signal,
    onPhase: (phase) => { if (phase === 'review') controller.abort() },
  }), { name: 'AbortError' })
  assert.equal(harness.calls.length, 1)
})

test('cancellation during review never publishes the otherwise valid returned clips', async () => {
  const controller = new AbortController()
  const harness = await analysisHarness([response({ candidates: proposals() }), (request) => {
    controller.abort()
    return reviewed(request)
  }])
  await assert.rejects(harness.run({ signal: controller.signal }), { name: 'AbortError' })
  assert.equal(harness.calls.length, 2)
})

async function pipelineHarness(t, analysis, { aiEnabled = true, fallbackSegments = [], range = { min: 20, max: 75 } } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'omegaclip-editorial-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await Promise.all([
    writeFile(path.join(directory, 'info.json'), '{}'),
    writeFile(path.join(directory, 'proxy.mp4'), ''),
  ])
  const calls = { heuristic: 0, heuristicOptions: [], reframe: [], slices: [], thumbnails: [], reports: [] }
  const unexpected = (name) => () => { throw new Error(`Unexpected pipeline service: ${name}`) }
  class UserFacingError extends Error {}
  const keyframes = [{ frame: 0, x: 0.5, y: 0.5, scale: 1 }]
  const { runPipeline } = await loadModule('../src/services/pipeline/run.ts', {
    '@/types/editor': { FPS: 30 },
    '@/services/ai/analyze': { analyzeTranscript: analysis.analyzeTranscript, describeAiFailure: analysis.describeAiFailure },
    '@/services/billing/credits': { requiredCredits: () => 1, reserveCredits: async () => {}, refundCredits: async () => {} },
    '@/services/ai/captions': {
      readCaptionWords: async () => analysis.structure.words,
      readCaptionCues: unexpected('readCaptionCues'), alignReference: unexpected('alignReference'),
    },
    '@/services/ai/structure': {
      analyzeStructure: () => analysis.structure,
      firstContentWord: unexpected('firstContentWord'), snapToSentences: unexpected('snapToSentences'),
    },
    '@/services/ai/heuristic': {
      CLIP_LENGTH_RANGES: { auto: range }, clipCountFor: () => 2,
      findClipSegments: (options) => { calls.heuristic++; calls.heuristicOptions.push(options); return fallbackSegments },
    },
    '@/services/ai/transcribe': {
      transcribeFile: unexpected('transcribeFile'),
      sliceWordsForClip: (words, start, end) => {
        calls.slices.push([start, end])
        return words.filter((word) => word.start >= start && word.end <= end)
          .map((word) => ({ ...word, start: word.start - start, end: word.end - start }))
      },
    },
    '@/services/video/ffmpeg': {
      probe: async () => ({ hasAudio: true, durationSeconds: 73.3, width: 1920, height: 1080, fps: 30 }),
      createProxy: unexpected('createProxy'), extractAudio: unexpected('extractAudio'),
      extractPortraitFrame: async (...args) => { calls.thumbnails.push(args) },
    },
    '@/services/video/reframe': {
      fallbackKeyframes: () => keyframes,
      computeCropKeyframes: async (options) => { calls.reframe.push(options); return keyframes },
    },
    '@/services/video/source': {
      UserFacingError, downloadCaptions: async () => path.join(directory, 'captions.json'),
      readChapters: async () => [], findReferenceTrack: async () => null,
      downloadVideo: unexpected('downloadVideo'), fetchSourceInfo: unexpected('fetchSourceInfo'),
    },
    '@/services/video/waveform': { computeWaveform: async () => ({ peaks: [0.1234, 0.8] }) },
  }, aiEnabled ? { GEMINI_API_KEY: 'test-only-not-a-real-key' } : {})
  return {
    calls, UserFacingError,
    run: () => runPipeline({
      id: 'test-editorial-job', url: 'https://example.invalid/test-only',
      caption: { key: 'de', automatic: false }, sourceLanguage: 'de',
      settings: { language: 'auto', clipLength: 'auto', topic: '' },
    }, { directory, signal: new AbortController().signal, report: (patch) => calls.reports.push(patch) }),
  }
}

test('pipeline preserves a successful empty AI judgment and never calls the heuristic fallback', async (t) => {
  const analysis = await analysisHarness([response({ candidates: [] }), response({ candidates: [] })])
  const pipeline = await pipelineHarness(t, analysis)
  await assert.rejects(pipeline.run(), (error) => {
    assert.ok(error instanceof pipeline.UserFacingError)
    assert.match(error.message, /Keine Passage erfüllt die redaktionellen Kriterien/)
    return true
  })
  assert.equal(pipeline.calls.heuristic, 0)
  assert.equal(pipeline.calls.reframe.length, 0)
  assert.equal(analysis.calls.length, 2)
})

test('pipeline also preserves an all-rejected review without manufacturing replacement clips', async (t) => {
  const analysis = await analysisHarness([
    response({ candidates: proposals() }), (request) => reviewed(request, { decision: 'reject' }),
    response({ candidates: proposals() }), (request) => reviewed(request, { decision: 'reject' }),
  ])
  const pipeline = await pipelineHarness(t, analysis)
  await assert.rejects(pipeline.run(), /Keine Passage erfüllt die redaktionellen Kriterien/)
  assert.equal(pipeline.calls.heuristic, 0)
  assert.equal(pipeline.calls.reframe.length, 0)
  assert.equal(analysis.calls.length, 3)
})

test('pipeline carries the reviewed timestamps and assessment through reframing without resnapping', async (t) => {
  const analysis = await analysisHarness([response({ candidates: proposals() }), reviewed])
  const pipeline = await pipelineHarness(t, analysis)
  const result = await pipeline.run()
  assert.equal(result.analysis, 'ai')
  assert.equal(result.notice, null)
  assert.equal(pipeline.calls.heuristic, 0)
  const expectedBounds = [[45.25, 72.625], [10.125, 38.875]]
  assert.deepEqual(result.segments.map(({ start_seconds, end_seconds }) => [start_seconds, end_seconds]), expectedBounds)
  assert.deepEqual(pipeline.calls.slices, expectedBounds)
  assert.deepEqual(pipeline.calls.reframe.map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds]), expectedBounds)
  assert.equal(result.segments[0].words.at(-1).word, 'ein.')
  assert.equal(result.segments[0].editorial.hook.score, 94)
  assert.equal(result.segments[0].editorial.trend.score, null)
  assert.equal(result.segments[0].thumbnail_url, '/api/pipeline/test-editorial-job/thumbnails/0')
  assert.ok(pipeline.calls.reports.some(({ message }) => message === 'Hook, Spannungsbogen und Mehrwert werden geprüft'))
})

test('pipeline returns reviewed AI clips without a failure notice after a model overload', async (t) => {
  const analysis = await analysisHarness([
    response({ candidates: proposals() }), apiFailure(503), apiFailure(503), reviewed,
  ])
  const pipeline = await pipelineHarness(t, analysis)
  const result = await pipeline.run()
  assert.equal(result.analysis, 'ai')
  assert.equal(result.notice, null)
  assert.equal(pipeline.calls.heuristic, 0)
  assert.equal(result.segments.length, 2)
  assert.ok(result.segments.every((clip) => clip.editorial?.method === 'ai'))
})

test('pipeline preserves fallback duration exactly at the upper limit and labels it as unreviewed', async (t) => {
  const analysis = await analysisHarness([])
  const segment = {
    ...proposals()[0], start_seconds: 10.125, end_seconds: 38.875,
    hook_text: analysis.structure.sentences[1].text, virality_score: 68,
    score_reasoning: 'Regelbasierter Schnittvorschlag ohne redaktionelle Prüfung.',
  }
  const range = { min: 20, max: segment.end_seconds - segment.start_seconds }
  const pipeline = await pipelineHarness(t, analysis, { aiEnabled: false, fallbackSegments: [segment], range })
  const result = await pipeline.run()
  assert.equal(result.analysis, 'heuristic')
  assert.match(result.notice, /inhaltlich ungeprüfte Schnittvorschläge/)
  assert.equal(analysis.calls.length, 0)
  assert.equal(pipeline.calls.heuristic, 1)
  assert.deepEqual(pipeline.calls.heuristicOptions[0].range, range)
  assert.equal(result.segments[0].end_seconds - result.segments[0].start_seconds, range.max)
  assert.deepEqual(pipeline.calls.slices, [[segment.start_seconds, segment.end_seconds]])
  assert.deepEqual(pipeline.calls.reframe.map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds]), [[segment.start_seconds, segment.end_seconds]])
  assert.equal(result.segments[0].editorial, undefined)
})

test('analysis returns more than eight independently approved clips', async () => {
  const structure = transcript()
  const candidates = proposals()
  for (let index = 1; index < 5; index++) {
    const later = transcript()
    // Distinct text per story keeps the real duplicate filter active.
    later.words = later.words.map((word) => ({ ...word, word: `Thema${index}${word.word}` }))
    later.sentences = later.sentences.map((sentence) => ({
      ...sentence, text: later.words.slice(sentence.from, sentence.to + 1).map((word) => word.word).join(' '),
    }))
    const wordOffset = structure.words.length
    const sentenceOffset = structure.sentences.length
    const offset = index * 90
    structure.words.push(...later.words.map((word) => ({ ...word, start: word.start + offset, end: word.end + offset })))
    structure.sentences.push(...later.sentences.map((sentence) => ({
      ...sentence, from: sentence.from + wordOffset, to: sentence.to + wordOffset,
      start: sentence.start + offset, end: sentence.end + offset,
    })))
    candidates.push(...proposals().map((proposal) => ({
      ...proposal, first_sentence: proposal.first_sentence + sentenceOffset,
      last_sentence: proposal.last_sentence + sentenceOffset,
    })))
  }
  const harness = await analysisHarness([response({ candidates }), reviewed])
  const result = await harness.run({ structure, durationSeconds: 450, maxClips: 10 })
  assert.equal(result.length, 10)
  assert.equal(new Set(result.map((clip) => clip.start_seconds)).size, 10)
})
