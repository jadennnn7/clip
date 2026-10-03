import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

// Ein Projekt darf aus dem Workspace nur verschwinden, wenn der Server das
// Löschen bestätigt hat — sonst läuft eine Veröffentlichung womöglich weiter.

const require = createRequire(import.meta.url)

function load(path, mocks, env = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', 'process', 'console', compiled)((name) => {
    if (name === 'server-only') return {}
    assert.ok(Object.hasOwn(mocks, name), `Unexpected import ${name}`)
    return mocks[name]
  }, loaded, loaded.exports, { env }, { error() {} })
  return loaded.exports
}

// ---------------------------------------------------------------------------
// DELETE /api/pipeline/[jobId]
// ---------------------------------------------------------------------------

const AUTH_ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' }

class PublishingApiError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

function pipelineRoute({ env = AUTH_ENV, job = { id: 'run_1', userId: 'owner' }, inFlight = [false, false], failRemove = false } = {}) {
  const calls = []
  const checks = [...inFlight]
  const route = load('../src/app/api/pipeline/[jobId]/route.ts', {
    '@/services/pipeline': {
      stopPipeline: async (id) => { calls.push(['stop', id]) },
      removePipeline: async (id) => {
        calls.push(['remove', id])
        if (failRemove) throw new Error('R2 down')
      },
    },
    '@/services/pipeline/access': {
      readOwnedPipeline: async () => {
        if (!job) throw new PublishingApiError(404, 'Job nicht gefunden.')
        return job
      },
    },
    '@/services/publishing/auth': {
      PublishingApiError,
      getAuthenticatedUser: async () => { calls.push(['auth']); return { id: 'owner' } },
      assertSameOrigin: () => { calls.push(['origin']) },
      publishingErrorResponse: (error) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
    },
    '@/services/publishing/jobs': {
      hasInFlightPublishing: async (userId, id) => { calls.push(['in-flight?', userId, id]); return checks.shift() ?? false },
      cancelPendingPublishing: async (userId, id) => { calls.push(['cancel', userId, id]) },
    },
  }, env)
  const run = () => route.DELETE(new Request('http://app.test/api/pipeline/run_1', { method: 'DELETE' }), { params: Promise.resolve({ jobId: 'run_1' }) })
  return { run, calls }
}

test('a running upload refuses the deletion before anything is changed', async () => {
  const { run, calls } = pipelineRoute({ inFlight: [true] })
  const response = await run()
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /gerade gerendert oder hochgeladen/)
  assert.deepEqual(calls.map(([name]) => name), ['auth', 'origin', 'in-flight?'])
})

test('the run stops before its publications, and files go last', async () => {
  const { run, calls } = pipelineRoute()
  const response = await run()
  assert.equal(response.status, 204)
  assert.deepEqual(calls.map(([name]) => name), ['auth', 'origin', 'in-flight?', 'stop', 'cancel', 'in-flight?', 'remove'])
  assert.deepEqual(calls.find(([name]) => name === 'cancel'), ['cancel', 'owner', 'run_1'])
})

test('a job claimed during the stop still refuses, and keeps the source video', async () => {
  const { run, calls } = pipelineRoute({ inFlight: [false, true] })
  const response = await run()
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /übrigen geplanten Veröffentlichungen sind bereits gestoppt/)
  assert.ok(!calls.some(([name]) => name === 'remove'))
})

test('a vanished run still stops the user’s scheduled publications', async () => {
  const { run, calls } = pipelineRoute({ job: null })
  const response = await run()
  assert.equal(response.status, 204)
  assert.deepEqual(calls.map(([name]) => name), ['auth', 'origin', 'in-flight?', 'cancel', 'in-flight?'])
})

test('a storage failure is reported instead of claiming success', async () => {
  const { run } = pipelineRoute({ failRemove: true })
  const response = await run()
  assert.equal(response.status, 502)
  assert.match((await response.json()).error, /nicht vollständig vom Server gelöscht/)
})

test('demo mode without accounts deletes the local job only', async () => {
  const { run, calls } = pipelineRoute({ env: {}, job: { id: 'run_1' } })
  const response = await run()
  assert.equal(response.status, 204)
  assert.deepEqual(calls.map(([name]) => name), ['remove'])
})

// ---------------------------------------------------------------------------
// Workspace-Store: deleteProject und Trennung nach Konto
// ---------------------------------------------------------------------------

class MemoryStorage {
  constructor() { this.values = new Map() }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
}

const project = (id, patch = {}) => ({
  id, user_id: 'local-user', title: `Video ${id}`, source_type: 'youtube', source_url: 'https://youtu.be/x',
  source_key: null, proxy_key: null, audio_key: null, waveform_key: null, thumbnail_url: null,
  duration_seconds: 60, width: 1920, height: 1080, fps: 30, status: 'ready', error_message: null,
  trigger_run_id: `run_${id}`, rights_confirmed: true, rights_confirmed_at: null,
  created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z', ...patch,
})
const clip = (id, projectId, renderJobId) => ({ id, project_id: projectId, title: id, words: [], caption_style: { enabled: true }, overlays: [], render_job_id: renderJobId })
const workspace = (projects, clips = []) => JSON.stringify({
  version: 2,
  data: { projects, clips, favoriteClipIds: [], brandKits: [], schedules: [], projectSettings: {}, removedWords: {}, outputFormats: {}, projectPublishing: {} },
})

function workspaceStore(responses = {}) {
  const requests = []
  globalThis.window = {}
  globalThis.localStorage = new MemoryStorage()
  globalThis.fetch = async (path, init) => {
    requests.push(`${init?.method ?? 'GET'} ${path}`)
    const answer = responses[path] ?? { status: 204 }
    if (answer === 'offline') throw new TypeError('Failed to fetch')
    return answer.body
      ? Response.json(answer.body, { status: answer.status })
      : new Response(null, { status: answer.status })
  }
  const { useWorkspaceStore, LOCAL_WORKSPACE_OWNER } = load('../src/stores/workspace-store.ts', {
    zustand: require('zustand'),
    '../../remotion/captions/presets': { CAPTION_PRESETS: { minimal: {}, karaoke: {}, hormozi: { enabled: true } }, DEFAULT_CAPTION_STYLE: {} },
    '@/lib/clip-export': { clipOutputDuration: () => 0 },
    '@/lib/hook-title': { createHookOverlay: () => ({}), draftHookTitle: () => null, HOOK_SECONDS: 5, isHookOverlay: () => false },
    '@/lib/local-media': { deleteLocalVideo: async () => {} },
  })
  return { store: useWorkspaceStore, requests, storage: globalThis.localStorage, LOCAL_WORKSPACE_OWNER }
}

test('a refused deletion keeps the project and rejects with the server’s reason', async () => {
  const { store, requests, storage } = workspaceStore({
    '/api/pipeline/run_a': { status: 409, body: { error: 'Ein Clip dieses Videos wird gerade hochgeladen.' } },
  })
  storage.setItem('omegaclip-workspace-v1:owner', workspace([project('a')], [clip('c1', 'a', 'render_1')]))
  store.getState().hydrate('owner')

  await assert.rejects(store.getState().deleteProject('a'), /wird gerade hochgeladen/)
  assert.deepEqual(store.getState().projects.map((item) => item.id), ['a'])
  assert.equal(store.getState().clips.length, 1)
  // Die Renders bleiben unangetastet, solange die Quelle nicht gelöscht ist.
  assert.deepEqual(requests, ['DELETE /api/pipeline/run_a'])
})

test('an unreachable server keeps the project too', async () => {
  const { store, storage } = workspaceStore({ '/api/pipeline/run_a': 'offline' })
  storage.setItem('omegaclip-workspace-v1:owner', workspace([project('a')]))
  store.getState().hydrate('owner')
  await assert.rejects(store.getState().deleteProject('a'), /nicht erreichbar/)
  assert.equal(store.getState().projects.length, 1)
})

test('a confirmed deletion removes the project and persists for this account', async () => {
  const { store, requests, storage } = workspaceStore({ '/api/render/render_2': { status: 404 } })
  storage.setItem('omegaclip-workspace-v1:owner', workspace([project('a'), project('b')], [clip('c1', 'a', 'render_1'), clip('c2', 'a', 'render_2')]))
  store.getState().hydrate('owner')

  await store.getState().deleteProject('a')
  assert.deepEqual(store.getState().projects.map((item) => item.id), ['b'])
  assert.equal(store.getState().clips.length, 0)
  assert.deepEqual(requests, ['DELETE /api/pipeline/run_a', 'DELETE /api/render/render_1', 'DELETE /api/render/render_2'])
  const saved = JSON.parse(storage.getItem('omegaclip-workspace-v1:owner'))
  assert.deepEqual(saved.data.projects.map((item) => item.id), ['b'])
})

test('uploads are deleted through the upload route', async () => {
  const { store, requests, storage } = workspaceStore()
  storage.setItem('omegaclip-workspace-v1:owner', workspace([project('u', { source_type: 'upload', trigger_run_id: null })]))
  store.getState().hydrate('owner')
  await store.getState().deleteProject('u')
  assert.deepEqual(requests, ['DELETE /api/uploads/u'])
  assert.equal(store.getState().projects.length, 0)
})

test('each account gets its own workspace; the shared one goes to the first account only', () => {
  const { store, storage } = workspaceStore()
  storage.setItem('omegaclip-workspace-v1', workspace([project('old')]))

  store.getState().hydrate('first')
  assert.deepEqual(store.getState().projects.map((item) => item.id), ['old'])
  assert.equal(storage.getItem('omegaclip-workspace-v1'), null)
  assert.ok(storage.getItem('omegaclip-workspace-v1:first'))

  store.getState().hydrate('second')
  assert.deepEqual(store.getState().projects, [])
  store.getState().createProjectDraft({ title: 'Neu', source_type: 'upload', source_url: null, rights_confirmed: true, settings: {} })
  assert.equal(JSON.parse(storage.getItem('omegaclip-workspace-v1:first')).data.projects.length, 1)
  assert.equal(JSON.parse(storage.getItem('omegaclip-workspace-v1:second')).data.projects.length, 1)

  store.getState().hydrate('first')
  assert.deepEqual(store.getState().projects.map((item) => item.id), ['old'])
})

test('nothing is written before the owner is known', () => {
  const { store, storage } = workspaceStore()
  storage.setItem('omegaclip-workspace-v1:owner', workspace([project('kept')]))
  store.getState().createProjectDraft({ title: 'Zu früh', source_type: 'upload', source_url: null, rights_confirmed: true, settings: {} })
  assert.equal(storage.values.size, 1)
  store.getState().hydrate('owner')
  assert.deepEqual(store.getState().projects.map((item) => item.id), ['kept'])
})

test('demo mode keeps using the original key', () => {
  const { store, storage, LOCAL_WORKSPACE_OWNER } = workspaceStore()
  storage.setItem('omegaclip-workspace-v1', workspace([project('demo')]))
  store.getState().hydrate(LOCAL_WORKSPACE_OWNER)
  assert.deepEqual(store.getState().projects.map((item) => item.id), ['demo'])
  assert.ok(storage.getItem('omegaclip-workspace-v1'))
})
