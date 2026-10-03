import test from 'node:test'
import assert from 'node:assert/strict'
import { trimClip, visibleCaptionWords, subtitleTimestamp, exportClip } from '../src/lib/clip-export.ts'

const clip = {
  title: 'Test', description: '', hashtags: [], hook_text: null,
  start_seconds: 10, end_seconds: 14,
  caption_style: { wordsPerLine: 2 }, crop_keyframes: [{ frame: 0, x: 0.5, y: 0.5, scale: 1 }],
  words: [
    { word: 'Hallo', start: 0, end: 0.8 },
    { word: 'ähm', start: 0.8, end: 1.2 },
    { word: 'Welt', start: 1.2, end: 2.4 },
    { word: '<Ende>', start: 3.5, end: 4 },
  ],
}

test('in-point changes preserve absolute word times, with reversible hidden words', () => {
  const trimmed = trimClip(clip, 11, 13, 30)
  assert.deepEqual(visibleCaptionWords(trimmed, [1]), [{ word: 'Welt', start: 0.19999999999999996, end: 1.4 }])
  assert.equal(trimmed.words[0].start + trimmed.start_seconds, 10)
  assert.equal(trimmed.crop_keyframes[0].frame, -30)
  assert.equal(trimClip(trimmed, 10, 14, 30).words[0].start, 0)
})

test('trim stays within source duration and rejects non-finite input', () => {
  const trimmed = trimClip(clip, 29.9, 70, 30)
  assert.equal(trimmed.start_seconds, 29.5)
  assert.equal(trimmed.end_seconds, 30)
  assert.equal(trimClip(clip, NaN, 4), clip)
})

test('subtitles omit excluded words and use format-specific time separators', () => {
  const srt = exportClip(clip, [1], 'srt')
  assert.match(srt, /00:00:00,000 --> 00:00:02,400\nHallo Welt/)
  assert.doesNotMatch(srt, /ähm/)
  assert.match(srt, /&lt;Ende&gt;/)
  assert.match(exportClip(clip, [1], 'vtt'), /^WEBVTT\n\n1\n00:00:00\.000/)
})

test('timestamp carries rounded milliseconds into the next minute', () => {
  assert.equal(subtitleTimestamp(59.9996), '00:01:00,000')
})

test('empty captions remain valid and edit exports declare audio unchanged', () => {
  assert.equal(exportClip({ ...clip, words: [] }, [], 'vtt'), 'WEBVTT\n\n\n')
  const data = JSON.parse(exportClip(clip, [1], 'json', '1:1'))
  assert.equal(data.outputFormat, '1:1')
  assert.equal(data.videoRendered, false)
  assert.equal(data.excludedWordsAffectAudio, false)
  assert.equal(data.words.length, 3)
})

// --- Schnitte innerhalb eines Clips -------------------------------------------

import { clipOutputDuration, clipSegments, normalizeSegments, outputToSource, sourceToOutput, wordsToOutput } from '../src/lib/clip-export.ts'

const cutClip = { ...clip, segments: [{ start: 0, end: 1 }, { start: 2, end: 4 }] }

test('segments map between source and output time across a cut', () => {
  const segments = clipSegments(cutClip)
  assert.equal(clipOutputDuration(cutClip), 3)
  assert.equal(sourceToOutput(segments, 0.5), 0.5)
  // Eine Zeit in der Lücke landet am Anfang des nächsten Abschnitts.
  assert.equal(sourceToOutput(segments, 1.5), 1)
  assert.equal(sourceToOutput(segments, 2.5), 1.5)
  assert.equal(outputToSource(segments, 1.5), 2.5)
  assert.equal(outputToSource(segments, 10), 4)
})

test('normalizing clamps, sorts and merges overlaps but keeps touching splits', () => {
  assert.deepEqual(normalizeSegments([{ start: 3, end: 9 }, { start: -1, end: 1 }, { start: 0.5, end: 2 }], 4), [{ start: 0, end: 2 }, { start: 3, end: 4 }])
  assert.deepEqual(normalizeSegments([{ start: 0, end: 1 }, { start: 1, end: 2 }], 2), [{ start: 0, end: 1 }, { start: 1, end: 2 }])
  assert.deepEqual(normalizeSegments(null, 3), [{ start: 0, end: 3 }])
})

test('cut words leave the captions, slivers at a cut do not flash', () => {
  const words = wordsToOutput(clip.words, clipSegments(cutClip))
  // „ähm“ (0,8–1,2 s) behält seine hörbaren 0,2 s vor dem Schnitt.
  assert.deepEqual(words.map((word) => word.word), ['Hallo', 'ähm', 'Welt', '<Ende>'])
  assert.deepEqual([words[1].start, words[1].end], [0.8, 1])
  // „Welt“ (1,2–2,4 s) verliert den geschnittenen Teil und beginnt direkt am Schnitt.
  assert.deepEqual([words[2].start, words[2].end], [1, 1.4])
  const sliver = wordsToOutput([{ word: 'fast', start: 0.99, end: 1.6 }], clipSegments(cutClip))
  assert.equal(sliver.length, 0)
})

test('subtitle exports follow the edited timeline', () => {
  const srt = exportClip(cutClip, [], 'srt')
  assert.match(srt, /00:00:01,000 --> 00:00:01,400\nWelt/)
  assert.equal(JSON.parse(exportClip(cutClip, [], 'json')).outputDurationSeconds, 3)
})

test('moving the in-point keeps cuts on their material and pulls the edges along', () => {
  const trimmed = trimClip(cutClip, 9.5, 14, 30)
  assert.deepEqual(trimmed.segments, [{ start: 0, end: 1.5 }, { start: 2.5, end: 4.5 }])
  // Ein Fenster ganz innerhalb eines Abschnitts braucht keine Schnitte mehr.
  assert.equal(trimClip(cutClip, 12, 14, 30).segments, null)
})
