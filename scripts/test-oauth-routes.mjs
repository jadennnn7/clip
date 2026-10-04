import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const origin = 'https://app.example.test'
class PublishingApiError extends Error {
  constructor(status) { super('Authentication failed'); this.status = status }
}
function setup({ authenticated = true, failAt, returnTo = 'connections' } = {}) {
  const calls = []
  const cookies = []
  const step = async (name, value) => {
    calls.push(name)
    if (failAt === name) throw new Error('secret-provider-response')
    return value
  }
  const provider = {
    getAuthUrl: () => { calls.push('authorize'); return 'https://provider.example.test/auth' },
    exchangeCode: () => step('exchange', { accessToken: 'secret-token' }),
    getAccountInfo: () => step('profile', {}),
  }
  const mocks = {
    'next/server': { NextResponse: { redirect: (url) => {
      const response = new Response(null, { status: 307, headers: { Location: String(url) } })
      response.cookies = { set: (...args) => cookies.push(args) }
      return response
    } } },
    '@/services/social': { getProvider: () => provider },
    '@/services/social/base': { ConnectError: class ConnectError extends Error {} },
    '@/services/publishing/auth': {
      PublishingApiError,
      getAuthenticatedUser: async () => {
        calls.push('auth')
        if (!authenticated) throw new PublishingApiError(401)
        return { id: 'owner' }
      },
      publishingErrorResponse: (error) => Response.json({ error: 'failed' }, { status: error.status ?? 500 }),
    },
    '@/services/publishing/config': {
      isSocialPlatform: (value) => value === 'tiktok',
      publishingAppOrigin: () => origin,
      getPublishingCapabilities: () => ({ tiktok: { configured: true } }),
    },
    '@/services/publishing/accounts': { saveAccountConnection: () => step('save', {}) },
    '@/services/publishing/oauth-state': {
      createOAuthState: (...args) => { calls.push(['state', args[2]]); return { state: 'state', cookie: 'signed-state', codeChallenge: 'challenge' } },
      extractOAuthState: () => ({ valid: true, codeVerifier: 'verifier', returnTo }),
      oauthCookieName: () => 'oauth-cookie',
      parseOAuthReturn: (value) => value === 'onboarding' ? 'onboarding' : 'connections',
      oauthReturnPath: (value) => ({ connections: '/dashboard/connections', onboarding: '/onboarding' })[value],
    },
  }
  function load(callback) {
    const path = `../src/app/api/oauth/[platform]/${callback ? 'callback/' : ''}route.ts`
    const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const loaded = { exports: {} }
    new Function('require', 'module', 'exports', compiled)((name) => {
      assert.ok(mocks[name], `Unexpected import ${name}`)
      return mocks[name]
    }, loaded, loaded.exports)
    return loaded.exports.GET
  }
  async function run(callback, host = 'app.example.test', query = '') {
    const request = new Request(`http://${host}/api/oauth/tiktok${callback ? '/callback?code=code&state=state' : query}`, { headers: { host } })
    request.nextUrl = new URL(request.url)
    request.cookies = { get: () => ({ value: 'signed-state' }) }
    return load(callback)(request, { params: Promise.resolve({ platform: 'tiktok' }) })
  }
  return { run, calls, cookies }
}

test('localhost connection moves to configured host before auth or provider calls', async () => {
  const state = setup()
  const response = await state.run(false, 'localhost:3000')
  assert.equal(response.headers.get('location'), `${origin}/dashboard/connections?error=oauth_origin_mismatch`)
  assert.deepEqual(state.calls, [])
  assert.deepEqual(state.cookies, [])
})

test('a tunnel with an internal HTTP origin can initiate OAuth on the matching host', async () => {
  const state = setup()
  const response = await state.run(false)
  assert.equal(response.headers.get('location'), 'https://provider.example.test/auth')
  assert.equal(state.cookies[0][2].secure, true)
})

for (const callback of [false, true]) {
  test(`missing Ocuris session at ${callback ? 'callback' : 'start'} requests login without contacting provider`, async () => {
    const state = setup({ authenticated: false })
    const response = await state.run(callback)
    const target = new URL(response.headers.get('location'))
    assert.equal(target.origin, origin)
    assert.equal(target.pathname, '/login')
    assert.equal(target.searchParams.get('error'), 'oauth_session_expired')
    assert.deepEqual(state.calls, ['auth'])
    if (callback) assert.equal(state.cookies[0][2].maxAge, 0)
  })
}

for (const [failAt, error] of [['exchange', 'token_exchange_failed'], ['profile', 'account_lookup_failed'], ['save', 'connection_save_failed']]) {
  test(`${failAt} failure exposes only a safe stage identifier`, async () => {
    const state = setup({ failAt })
    const response = await state.run(true)
    assert.equal(response.headers.get('location'), `${origin}/dashboard/connections?error=${error}`)
    assert.equal(state.cookies[0][2].maxAge, 0)
  })
}

test('successful callback saves connection and clears one-time cookie', async () => {
  const state = setup()
  const response = await state.run(true)
  assert.equal(response.headers.get('location'), `${origin}/dashboard/connections?connected=tiktok`)
  assert.deepEqual(state.calls, ['auth', 'exchange', 'profile', 'save'])
  assert.equal(state.cookies[0][2].maxAge, 0)
})

test('onboarding start stores its return target in the signed state', async () => {
  const state = setup()
  await state.run(false, 'app.example.test', '?return=onboarding')
  assert.deepEqual(state.calls, ['auth', ['state', 'onboarding'], 'authorize'])
})

test('unknown return targets fall back to the connections page', async () => {
  const state = setup()
  const response = await state.run(false, 'localhost:3000', '?return=https%3A%2F%2Fevil.example')
  assert.equal(response.headers.get('location'), `${origin}/dashboard/connections?error=oauth_origin_mismatch`)
})

test('onboarding callback returns to the onboarding, including failures', async () => {
  const ok = setup({ returnTo: 'onboarding' })
  assert.equal((await ok.run(true)).headers.get('location'), `${origin}/onboarding?connected=tiktok`)
  const failed = setup({ returnTo: 'onboarding', failAt: 'exchange' })
  assert.equal((await failed.run(true)).headers.get('location'), `${origin}/onboarding?error=token_exchange_failed`)
})
