import test from 'node:test'
import assert from 'node:assert/strict'
import { getPublishingStatus } from '../src/lib/publishing-status.ts'

// Run with: node --import tsx --test scripts/test-publishing-status.mjs
const now = Date.parse('2026-10-04T23:21:22Z')
const job = (overrides = {}) => ({
  status: 'pending', publish_at: '2026-10-04T23:21:15.178Z',
  next_retry_at: null, last_error: null, ...overrides,
})

test('immediate and overdue jobs waiting for a worker are not labelled scheduled or published', () => {
  for (const publish_at of ['2026-10-04T23:20:05.390Z', new Date(now).toISOString(), '2026-10-05T01:21:15.178+02:00']) {
    const status = getPublishingStatus(job({ publish_at }), now)
    assert.equal(status.label, 'Wartet auf Verarbeitung')
    assert.match(status.detail, /wartet.*Vorbereitung.*Upload/)
  }
})

test('future jobs stay scheduled until their publication time', () => {
  const scheduled = job({ publish_at: new Date(now + 1).toISOString() })
  assert.equal(getPublishingStatus(scheduled, now).label, 'Eingeplant')
  assert.equal(getPublishingStatus(scheduled, now + 1).label, 'Wartet auf Verarbeitung')
})

test('automatic retry information takes priority over the original publication time', () => {
  const retry = job({ next_retry_at: '2026-10-04T23:25:00Z' })
  const status = getPublishingStatus(retry, now)
  assert.equal(status.label, 'Wird erneut versucht')
  assert.match(status.detail, /Nächster automatischer Versuch/)
})

test('only confirmed public posts show published; platform confirmation remains actionable', () => {
  const labels = {
    needs_review: 'Wartet auf Freigabe', rendering: 'Video wird vorbereitet',
    publishing: 'Wird veröffentlicht', published: 'Veröffentlicht',
    action_required: 'Auf Plattform prüfen', failed: 'Fehlgeschlagen', cancelled: 'Abgebrochen',
  }
  for (const [status, label] of Object.entries(labels)) {
    assert.equal(getPublishingStatus(job({ status }), now).label, label)
  }
})

test('confirmed TikTok inbox delivery asks the creator to publish in TikTok', () => {
  const inbox = job({ status: 'action_required', platform: 'tiktok', last_error: 'Öffne die Benachrichtigung in deiner TikTok-Inbox, ergänze Titel und Beschreibung und veröffentliche den Clip in TikTok.' })
  assert.equal(getPublishingStatus(inbox, now).label, 'In TikTok veröffentlichen')
  assert.equal(getPublishingStatus({ ...inbox, last_error: 'Der Plattformstatus ist unklar.' }, now).label, 'Auf Plattform prüfen')
})

test('private Direct Posts are labelled private without asking the creator to open the Inbox', () => {
  const post = job({ status: 'action_required', platform: 'tiktok', last_error: 'Privat auf TikTok veröffentlicht. Sichtbarkeit: Nur ich.' })
  assert.equal(getPublishingStatus(post, now).label, 'Privat veröffentlicht')
})
