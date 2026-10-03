import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import ts from 'typescript'

const compiled = new Map()
async function loadModule(relativePath, dependencies = {}, environment = {}) {
  if (!compiled.has(relativePath)) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    })
    compiled.set(relativePath, compileFunction(outputText, ['require', 'module', 'exports', 'process', 'console']))
  }
  const loaded = { exports: {} }
  compiled.get(relativePath)((name) => {
    if (name === 'server-only') return {}
    if (Object.hasOwn(dependencies, name)) return dependencies[name]
    throw new Error(`Unexpected dependency: ${name}`)
  }, loaded, loaded.exports, { env: environment }, { error() {} })
  return loaded.exports
}

class UserFacingError extends Error {}
const clipExport = await loadModule('../src/lib/clip-export.ts')
const links = await loadModule('../src/lib/links.ts')
const settings = await loadModule('../src/types/workspace.ts')
const profile = { subscription_tier: 'free', render_minutes_used: 0, render_minutes_limit: 8 }
const clip = (seconds, segments) => ({ start_seconds: 10, end_seconds: 10 + seconds, segments })

function database({ account = profile, readError = null, rpcData = true, rpcError = null, rpcThrows = null, events = [] } = {}) {
  const calls = { reads: 0, updates: 0, rpc: [] }
  const db = {
    from(table) {
      assert.equal(table, 'profiles')
      calls.reads++
      events.push('read-credit')
      const chain = {
        select() { return chain },
        eq(column, value) { assert.equal(column, 'id'); assert.equal(value, 'user-1'); return chain },
        async maybeSingle() { return { data: account, error: readError } },
        update() { calls.updates++; throw new Error('No direct balance mutations are allowed') },
      }
      return chain
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args })
      if (rpcThrows) throw rpcThrows
      return { data: rpcData, error: rpcError }
    },
  }
  return { db, calls }
}

async function credits(db, adminError) {
  return loadModule('../src/services/billing/credits.ts', {
    '@/lib/supabase/admin': { createAdminClient() { if (adminError) throw adminError; return db } },
    '@/lib/clip-export': clipExport,
    '@/services/video/source': { UserFacingError },
  })
}

test('successful atomic charge returns without profile fallback and preserves job reference', async () => {
  const { db, calls } = database()
  const { chargeClipTokens } = await credits(db)
  for (let i = 0; i < 2; i++) await chargeClipTokens('user-1', 'job-1', [clip(72)])
  assert.equal(calls.reads, 0)
  assert.equal(calls.updates, 0)
  assert.deepEqual(calls.rpc, Array.from({ length: 2 }, () => ({
    name: 'charge_clip_tokens', args: { p_user_id: 'user-1', p_tokens: 1.2, p_reference: 'clip:job-1' },
  })))
})

test('insufficient balance reports the actual required and available fractional amounts', async () => {
  const { db, calls } = database({ rpcData: false, account: { ...profile, render_minutes_used: 7.5 } })
  const { chargeClipTokens, TokenBillingError } = await credits(db)
  await assert.rejects(chargeClipTokens('user-1', 'job-1', [clip(72)]), (error) => {
    assert.ok(error instanceof TokenBillingError)
    assert.equal(error.status, 402)
    assert.match(error.message, /1,2 Token benötigt/)
    assert.match(error.message, /Verfügbar: 0,5 Token/)
    return true
  })
  assert.equal(calls.updates, 0)
})

test('missing schema and network errors never fall back to a profile charge', async () => {
  for (const [code, message, expected] of [
    ['PGRST205', 'table missing', /Einrichtung/],
    ['PGRST202', 'function missing', /Einrichtung/],
    ['FETCH_ERROR', 'network unavailable', /konnte nicht geprüft werden/],
  ]) {
    const { db, calls } = database({ rpcData: null, rpcError: { code, message } })
    const { chargeClipTokens, TokenBillingError } = await credits(db)
    await assert.rejects(chargeClipTokens('user-1', 'job-1', [clip(60)]), (error) => {
      assert.ok(error instanceof TokenBillingError)
      assert.equal(error.status, 503)
      assert.match(error.message, expected)
      return true
    })
    assert.equal(calls.reads, 0)
    assert.equal(calls.updates, 0)
  }
  const { db, calls } = database({ rpcThrows: new TypeError('fetch failed') })
  const { chargeClipTokens } = await credits(db)
  await assert.rejects(chargeClipTokens('user-1', 'job-1', [clip(60)]))
  assert.equal(calls.reads, 0)
  assert.equal(calls.updates, 0)
})

test('an invalid charge response is a technical failure, never insufficient funds', async () => {
  for (const rpcData of [null, undefined, 'true', 1, {}]) {
    const fixture = database()
    fixture.db.rpc = async () => ({ data: rpcData, error: null })
    const { chargeClipTokens, TokenBillingError } = await credits(fixture.db)
    await assert.rejects(chargeClipTokens('user-1', 'job-1', [clip(60)]), (error) => {
      assert.ok(error instanceof TokenBillingError)
      assert.equal(error.status, 503)
      return true
    })
    assert.equal(fixture.calls.reads, 0)
  }
})

test('missing or invalid account values are not replaced with zero or a free allowance', async () => {
  for (const account of [
    null,
    { ...profile, render_minutes_used: null },
    { ...profile, render_minutes_limit: null },
    { ...profile, render_minutes_used: -1 },
    { ...profile, render_minutes_limit: Infinity },
    { ...profile, render_minutes_used: 'not a number' },
    { ...profile, subscription_tier: 'unknown' },
    { ...profile, render_minutes_used: '' },
    { ...profile, render_minutes_limit: true },
  ]) {
    const { db } = database({ account })
    const { readTokenUsage, TokenBillingError } = await credits(db)
    await assert.rejects(readTokenUsage(db, 'user-1'), (error) => {
      assert.ok(error instanceof TokenBillingError)
      assert.equal(error.status, 503)
      return true
    }, `invalid account ${JSON.stringify(account)}`)
  }
})

test('cost charges retained frames and rounds only once for the completed batch', async () => {
  const { db, calls } = database()
  const { clipTokenCost, chargeClipTokens } = await credits(db)
  assert.equal(clipTokenCost([clip(120, [{ start: 0, end: 10 }, { start: 100, end: 120 }])]), 0.5)
  assert.equal(clipTokenCost([clip(0.4), clip(0.4)]), 0.01)
  assert.equal(clipTokenCost([clip(1 / 30)]), 0.01)
  assert.equal(clipTokenCost([]), 0)
  await chargeClipTokens('user-1', 'empty-job', [])
  assert.equal(calls.rpc.length, 0)
  for (const seconds of [0, -1, NaN, Infinity]) assert.throws(() => clipTokenCost([clip(seconds)]))
})

async function pipelineRoute({ db, authError, adminError, events = [] }) {
  const billing = await credits(db, adminError)
  return loadModule('../src/app/api/pipeline/route.ts', {
    '@/lib/links': links,
    '@/types/workspace': settings,
    '@/services/video/source': { UserFacingError },
    '@/services/billing/credits': billing,
    '@/services/publishing/config': { isPublishingConfigured: () => true },
    '@/services/publishing/accounts': { listAccounts: async () => { events.push('accounts'); return [] } },
    '@/services/publishing/auth': {
      assertSameOrigin() { events.push('origin') },
      async getAuthenticatedUser() { events.push('auth'); if (authError) throw authError; return { id: 'user-1' } },
      publishingErrorResponse: () => Response.json({ error: 'Nicht angemeldet.' }, { status: 401 }),
    },
    '@/services/pipeline': {
      async startPipeline(input) {
        events.push('start')
        assert.equal(input.userId, 'user-1')
        return { id: 'job-1', title: 'Test', source: 'youtube', durationSeconds: 60, thumbnailUrl: null }
      },
    },
  }, { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' })
}

const pipelineRequest = (patch = {}) => new Request('http://localhost:3000/api/pipeline', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://youtu.be/test', rightsConfirmed: true, ...patch }),
})

test('pipeline checks authenticated balance before accounts, metadata or download work', async () => {
  const events = []
  const { db } = database({ events })
  const route = await pipelineRoute({ db, events })
  const response = await route.POST(pipelineRequest())
  assert.equal(response.status, 202)
  assert.equal((await response.json()).jobId, 'job-1')
  assert.deepEqual(events, ['origin', 'auth', 'read-credit', 'accounts', 'start'])
})

test('pipeline returns actionable preflight errors without starting costly work', async () => {
  for (const scenario of [
    { account: { ...profile, render_minutes_used: 8 }, status: 402, message: /aufgebraucht/ },
    { account: null, status: 503, message: /Einrichtung/ },
    { readError: { code: 'PGRST205', message: 'table missing' }, status: 503, message: /Einrichtung/ },
    { readError: { code: 'NETWORK', message: 'fetch failed' }, status: 503, message: /konnte nicht geprüft werden/ },
    { adminError: new Error('missing service role'), status: 503, message: /Einrichtung/ },
  ]) {
    const events = []
    const { db, calls } = database({ ...scenario, events })
    const route = await pipelineRoute({ db, events, adminError: scenario.adminError })
    const response = await route.POST(pipelineRequest())
    assert.equal(response.status, scenario.status)
    assert.match((await response.json()).error, scenario.message)
    assert.ok(!events.includes('start'))
    assert.ok(!events.includes('accounts'))
    assert.equal(calls.rpc.length, 0)
    assert.equal(calls.updates, 0)
  }
})

test('invalid requests and unauthenticated calls do not look up or charge an account', async () => {
  const { db, calls } = database()
  const route = await pipelineRoute({ db })
  assert.equal((await route.POST(pipelineRequest({ rightsConfirmed: false }))).status, 400)
  assert.equal((await route.POST(pipelineRequest({ url: 'https://localhost/private' }))).status, 400)
  const unauthenticated = await pipelineRoute({ db, authError: new Error('logged out') })
  assert.equal((await unauthenticated.POST(pipelineRequest())).status, 401)
  assert.equal(calls.reads, 0)
  assert.equal(calls.rpc.length, 0)
})
