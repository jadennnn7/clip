import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Ein Konto verschwindet erst, wenn alles außerhalb der Datenbank weg ist —
// danach fehlt die Liste, wo es lag. Und was ablehnen kann, lehnt ab, bevor
// irgendetwas gelöscht ist.

function load(path, mocks, env = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', 'process', 'console', compiled)((name) => {
    if (name === 'server-only') return {}
    assert.ok(Object.hasOwn(mocks, name), `Unexpected import ${name}`)
    return mocks[name]
  }, loaded, loaded.exports, { env }, { error() {}, info() {}, log() {} })
  return loaded.exports
}

class PublishingApiError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

const OWNER = 'owner'

/** Nur die Aufrufe, die `delete.ts` braucht: Profil lesen, Tabellen seitenweise lesen, Auth-Nutzer löschen. */
function fakeDb({ customerId = null, tables = {}, calls }) {
  return {
    from(table) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        maybeSingle: async () => ({ data: { stripe_customer_id: customerId }, error: null }),
        range: async (from, to) => {
          const rows = tables[table] ?? []
          if (rows instanceof Error) return { data: null, error: rows }
          return { data: rows.slice(from, to + 1), error: null }
        },
      }
      return builder
    },
    auth: { admin: { deleteUser: async (id) => { calls.push(['delete-user', id]); return { error: null } } } },
  }
}

function account({
  customerId = null, stripe = true, stripeError = null, tables = {}, inFlight = [false, false],
  jobs = {}, failing = new Set(), r2 = true,
} = {}) {
  const calls = []
  const checks = [...inFlight]
  const step = (name, id) => async () => {
    calls.push([name, id])
    if (failing.has(`${name}:${id}`)) throw new Error(`${name} ${id} kaputt`)
  }
  const { deleteAccount } = load('../src/services/account/delete.ts', {
    '@/lib/storage/r2': { isR2Configured: () => r2, deletePrefix: (prefix) => step('prefix', prefix)() },
    '@/lib/stripe/client': {
      getStripe: () => (stripe ? {
        customers: { del: async (id) => { calls.push(['stripe', id]); if (stripeError) throw stripeError } },
      } : null),
    },
    '@/lib/supabase/admin': { createAdminClient: () => fakeDb({ customerId, tables, calls }) },
    '@/services/pipeline': {
      readPipeline: async (id) => jobs[id] ?? null,
      removePipeline: (id) => step('pipeline', id)(),
    },
    '@/services/publishing/auth': { PublishingApiError },
    '@/services/publishing/jobs': {
      hasInFlightPublishing: async (userId, source) => { calls.push(['in-flight?', userId, source]); return checks.shift() ?? false },
      cancelPendingPublishing: async (userId, source) => { calls.push(['cancel', userId, source]) },
    },
    '@/services/render': { removeRender: (id) => step('render', id)() },
    '@/services/uploads': { deleteUpload: (id) => step('upload', id)() },
  })
  return { run: () => deleteAccount(OWNER), calls }
}

const TABLES = {
  projects: [
    { id: 'p-link', source_type: 'youtube', trigger_run_id: 'run_mine' },
    { id: 'p-upload', source_type: 'upload', trigger_run_id: null },
    // Die Lauf-ID kommt aus dem Browser — dieser Lauf gehört jemand anderem.
    { id: 'p-foreign', source_type: 'youtube', trigger_run_id: 'run_foreign' },
  ],
  clips: [{ render_job_id: 'run_render' }, { render_job_id: null }, { render_job_id: 'run_render' }],
  publishing_jobs: [{ source_job_id: 'run_mine' }, { source_job_id: 'run_published' }],
}
const JOBS = {
  run_mine: { id: 'run_mine', userId: OWNER },
  run_published: { id: 'run_published', userId: OWNER },
  run_foreign: { id: 'run_foreign', userId: 'someone-else' },
}

test('everything outside the database goes first, then Stripe, then the auth user', async () => {
  const { run, calls } = account({ customerId: 'cus_1', tables: TABLES, jobs: JOBS })
  await run()
  const names = calls.map(([name]) => name)
  assert.deepEqual(names.slice(0, 3), ['in-flight?', 'cancel', 'in-flight?'])
  // Veröffentlichungen des ganzen Kontos, nicht eines Videos.
  assert.deepEqual(calls[1], ['cancel', OWNER, undefined])
  assert.deepEqual(names.slice(-2), ['stripe', 'delete-user'])
  assert.deepEqual(calls.at(-2), ['stripe', 'cus_1'])
  assert.deepEqual(calls.at(-1), ['delete-user', OWNER])
  const files = calls.slice(3, -2).map(([name, id]) => `${name}:${id}`).sort()
  assert.deepEqual(files, [
    'pipeline:run_mine', 'pipeline:run_published', 'prefix:publishing/owner/', 'render:run_render', 'upload:p-upload',
  ])
})

test('a run owned by another account is never deleted', async () => {
  const { run, calls } = account({ tables: TABLES, jobs: JOBS })
  await run()
  assert.ok(!calls.some(([name, id]) => name === 'pipeline' && id === 'run_foreign'))
})

test('a running upload refuses before anything is deleted', async () => {
  const { run, calls } = account({ customerId: 'cus_1', tables: TABLES, jobs: JOBS, inFlight: [true] })
  await assert.rejects(run(), (error) => error.status === 409 && /lässt sich nicht mehr anhalten/.test(error.message))
  assert.deepEqual(calls.map(([name]) => name), ['in-flight?'])
})

test('a job claimed during the stop still refuses, with nothing deleted', async () => {
  const { run, calls } = account({ tables: TABLES, jobs: JOBS, inFlight: [false, true] })
  await assert.rejects(run(), (error) => error.status === 409 && /bereits gestoppt/.test(error.message))
  assert.deepEqual(calls.map(([name]) => name), ['in-flight?', 'cancel', 'in-flight?'])
})

test('a subscription without a Stripe key refuses before anything changes', async () => {
  const { run, calls } = account({ customerId: 'cus_1', stripe: false, tables: TABLES, jobs: JOBS })
  await assert.rejects(run(), (error) => error.status === 503 && /Abo/.test(error.message))
  assert.deepEqual(calls, [])
})

test('without a Stripe customer, Stripe is not needed at all', async () => {
  const { run, calls } = account({ stripe: false })
  await run()
  assert.deepEqual(calls.map(([name]) => name), ['in-flight?', 'cancel', 'in-flight?', 'prefix', 'delete-user'])
})

test('a failed file keeps the account, but the rest is still deleted', async () => {
  const { run, calls } = account({ customerId: 'cus_1', tables: TABLES, jobs: JOBS, failing: new Set(['upload:p-upload']) })
  await assert.rejects(run(), /1 von 6 Löschaufträgen/)
  assert.ok(calls.some(([name]) => name === 'render'))
  assert.ok(calls.some(([name]) => name === 'prefix'))
  assert.ok(!calls.some(([name]) => name === 'stripe' || name === 'delete-user'))
})

test('a customer Stripe already deleted counts as done on the second attempt', async () => {
  const missing = Object.assign(new Error('No such customer'), { code: 'resource_missing' })
  const { run, calls } = account({ customerId: 'cus_1', stripeError: missing })
  await run()
  assert.deepEqual(calls.at(-1), ['delete-user', OWNER])
})

test('any other Stripe error keeps the account', async () => {
  const { run, calls } = account({ customerId: 'cus_1', stripeError: new Error('Stripe down') })
  await assert.rejects(run(), /Stripe down/)
  assert.ok(!calls.some(([name]) => name === 'delete-user'))
})

test('tables whose migration never ran hold nothing to delete', async () => {
  const missing = Object.assign(new Error('missing'), { code: 'PGRST205', message: 'Could not find the table public.publishing_jobs in the schema cache' })
  const { run, calls } = account({ tables: { ...TABLES, publishing_jobs: missing }, jobs: JOBS, r2: false })
  await run()
  assert.ok(calls.some(([name, id]) => name === 'pipeline' && id === 'run_mine'))
  assert.ok(!calls.some(([name]) => name === 'prefix'))
  assert.deepEqual(calls.at(-1), ['delete-user', OWNER])
})

test('any other database error keeps the account', async () => {
  const { run, calls } = account({ tables: { ...TABLES, clips: Object.assign(new Error('timeout'), { code: '57014', message: 'timeout' }) } })
  await assert.rejects(run(), /clips nicht lesbar/)
  assert.ok(!calls.some(([name]) => name === 'delete-user'))
})

// ---------------------------------------------------------------------------
// DELETE /api/account
// ---------------------------------------------------------------------------

const AUTH_ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' }

function route({ env = AUTH_ENV, user = { id: OWNER, email: 'Owner@Example.com' }, sameOrigin = true, fail = null } = {}) {
  const calls = []
  const { DELETE } = load('../src/app/api/account/route.ts', {
    '@/lib/supabase/server': {
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user }, error: null }),
          signOut: async (options) => { calls.push(['sign-out', options.scope]); return { error: null } },
        },
      }),
    },
    '@/services/account/delete': {
      deleteAccount: async (id) => { calls.push(['delete', id]); if (fail) throw fail },
    },
    '@/services/publishing/auth': {
      PublishingApiError,
      assertSameOrigin: () => { if (!sameOrigin) throw new PublishingApiError(403, 'Diese Anfrage muss aus OmegaClip kommen.') },
      publishingErrorResponse: (error) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
    },
  }, env)
  const run = (body) => DELETE(new Request('http://app.test/api/account', { method: 'DELETE', body: JSON.stringify(body) }))
  return { run, calls }
}

test('the typed address must match the account, in any case', async () => {
  const { run, calls } = route()
  assert.equal((await run({ confirm: 'someone@example.com' })).status, 400)
  assert.equal((await run({})).status, 400)
  assert.deepEqual(calls, [])
  assert.equal((await run({ confirm: '  owner@example.COM ' })).status, 204)
  assert.deepEqual(calls, [['delete', OWNER], ['sign-out', 'local']])
})

test('another site cannot delete the account', async () => {
  const { run, calls } = route({ sameOrigin: false })
  assert.equal((await run({ confirm: 'owner@example.com' })).status, 403)
  assert.deepEqual(calls, [])
})

test('without a session nothing is deleted', async () => {
  const { run, calls } = route({ user: null })
  assert.equal((await run({ confirm: 'owner@example.com' })).status, 401)
  assert.deepEqual(calls, [])
})

test('a refusal keeps its status, anything else says the account still exists', async () => {
  const refused = route({ fail: new PublishingApiError(409, 'Gerade wird ein Clip hochgeladen.') })
  const conflict = await refused.run({ confirm: 'owner@example.com' })
  assert.equal(conflict.status, 409)
  assert.ok(!refused.calls.some(([name]) => name === 'sign-out'))

  const broken = route({ fail: new Error('R2 down') })
  const failure = await broken.run({ confirm: 'owner@example.com' })
  assert.equal(failure.status, 502)
  assert.match((await failure.json()).error, /besteht noch/)
})

test('demo mode has no account to delete', async () => {
  const { run, calls } = route({ env: {} })
  assert.equal((await run({ confirm: 'owner@example.com' })).status, 503)
  assert.deepEqual(calls, [])
})
