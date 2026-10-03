import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = await readFile(new URL('../src/stores/billing-usage-store.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
})
const initialize = compileFunction(outputText, ['require', 'module', 'exports', 'fetch', 'window', 'document'])
const response = (data, ok = true) => ({ ok, json: async () => data })
const settle = () => new Promise((resolve) => setImmediate(resolve))

function setup(fetch) {
  const effects = []
  const listeners = new Map()
  let workspaceChanged
  const window = {
    addEventListener: (key, callback) => listeners.set(key, callback),
    removeEventListener: (key) => listeners.delete(key),
    setInterval: (callback) => { listeners.set('poll', callback); return 1 },
    clearInterval: () => listeners.delete('poll'),
  }
  const document = { ...window, visibilityState: 'visible' }
  const loaded = { exports: {} }
  initialize((name) => {
    if (name === 'react') return { useEffect: (effect) => effects.push(effect) }
    if (name === 'zustand') return require('zustand')
    if (name === '@/stores/workspace-store') return {
      useWorkspaceStore: { subscribe: (listener) => {
        workspaceChanged = listener
        return () => { workspaceChanged = undefined }
      } },
    }
    throw new Error(`Unexpected dependency: ${name}`)
  }, loaded, loaded.exports, fetch, window, document)
  return {
    ...loaded.exports, listeners, document,
    mount: () => { loaded.exports.useBillingUsageSync(); return effects[0]() },
    changeWorkspace: (state, previous) => workspaceChanged(state, previous),
  }
}

test('balance starts unknown and uses account values including fractional tokens', async () => {
  const billing = setup(async (_url, options) => {
    assert.equal(options.cache, 'no-store')
    return response({ tier: 'free', used: 2.35, limit: 8 })
  })
  assert.equal(billing.useBillingUsage.getState().usage, null)
  await billing.refreshBillingUsage()
  assert.deepEqual(billing.useBillingUsage.getState().usage, { tier: 'free', used: 2.35, limit: 8 })
})

test('failed or malformed responses hide stale balance instead of inventing credits', async () => {
  const replies = [
    response({ tier: 'free', used: 2, limit: 8 }),
    response({ error: 'Guthaben nicht verfügbar.' }, false),
    response({ tier: 'free', used: 2 }),
  ]
  const billing = setup(async () => replies.shift())
  await billing.refreshBillingUsage()
  for (let i = 0; i < 2; i++) {
    await billing.refreshBillingUsage()
    const state = billing.useBillingUsage.getState()
    assert.equal(state.usage, null)
    assert.ok(state.error)
    assert.equal(state.loading, false)
  }
})

test('job completion during a pending read triggers one fresh read after it finishes', async () => {
  let finish
  let calls = 0
  const billing = setup(() => {
    calls++
    if (calls === 1) return new Promise((resolve) => { finish = resolve })
    return Promise.resolve(response({ tier: 'free', used: 3.25, limit: 8 }))
  })
  const cleanup = billing.mount()
  await settle()
  const first = billing.refreshBillingUsage()
  const previous = { projects: [{ id: 'p', status: 'reframing', trigger_run_id: 'job' }], clips: [] }
  billing.changeWorkspace({ ...previous, projects: [{ ...previous.projects[0], status: 'ready' }] }, previous)
  assert.equal(calls, 1)
  finish(response({ tier: 'free', used: 0, limit: 8 }))
  await first
  await settle()
  assert.equal(calls, 2)
  assert.equal(billing.useBillingUsage.getState().usage.used, 3.25)
  cleanup()
  assert.equal(billing.listeners.size, 0)
})

test('failed jobs refresh the balance and hidden tabs do not poll', async () => {
  let calls = 0
  const billing = setup(async () => {
    calls++
    return response({ tier: 'free', used: 1, limit: 8 })
  })
  const cleanup = billing.mount()
  await settle()
  const previous = { projects: [{ id: 'p', status: 'analyzing' }], clips: [] }
  billing.changeWorkspace({ projects: [{ id: 'p', status: 'error' }], clips: [] }, previous)
  await settle()
  assert.equal(calls, 2)
  billing.document.visibilityState = 'hidden'
  billing.listeners.get('poll')()
  await settle()
  assert.equal(calls, 2)
  billing.document.visibilityState = 'visible'
  billing.listeners.get('focus')()
  await settle()
  assert.equal(calls, 3)
  cleanup()
})
