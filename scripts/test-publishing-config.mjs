import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// No env files, real credentials, database calls or provider requests.
const source = readFileSync(new URL('../src/services/publishing/config.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const config = { exports: {} }
new Function('require', 'module', 'exports', compiled)((specifier) => {
  if (specifier === 'server-only') return {}
  throw new Error(`Unexpected import: ${specifier}`)
}, config, config.exports)
const { getPublishingSetupIssues, getPublishingSetupNotice, isPublishingConfigured, getPublishingCapabilities } = config.exports

const complete = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.test',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-secret',
  TRIGGER_SECRET_KEY: 'test-trigger-secret',
  R2_ACCOUNT_ID: 'test-account',
  R2_ACCESS_KEY_ID: 'test-access',
  R2_SECRET_ACCESS_KEY: 'test-storage-secret',
  TOKEN_ENCRYPTION_KEY: '01'.repeat(32),
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  GOOGLE_CLIENT_ID: 'test-google', GOOGLE_CLIENT_SECRET: 'test-google-secret',
  META_APP_ID: 'test-meta', META_APP_SECRET: 'test-meta-secret',
  TIKTOK_CLIENT_KEY: 'test-tiktok', TIKTOK_CLIENT_SECRET: 'test-tiktok-secret',
  YOUTUBE_AUDIT_PASSED: 'false', META_APP_REVIEW_PASSED: 'false',
  R2_PUBLIC_BASE_URL: 'https://media.example.test',
}
const original = { ...process.env }
afterEach(() => {
  for (const key of Object.keys(complete)) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
})

test('reports all missing services, invalid key and origin without exposing secrets', () => {
  Object.assign(process.env, complete, {
    TRIGGER_SECRET_KEY: '', R2_ACCESS_KEY_ID: ' ', TOKEN_ENCRYPTION_KEY: 'too-short',
    NEXT_PUBLIC_APP_URL: 'http://app.example.test',
  })
  assert.equal(isPublishingConfigured(), false)
  assert.deepEqual(getPublishingSetupIssues().map((issue) => issue.variables), [
    ['TRIGGER_SECRET_KEY'], ['R2_ACCESS_KEY_ID'], ['TOKEN_ENCRYPTION_KEY'], ['NEXT_PUBLIC_APP_URL'],
  ])
  const result = JSON.stringify({ issues: getPublishingSetupIssues(), notice: getPublishingSetupNotice(), capabilities: getPublishingCapabilities() })
  for (const secret of ['test-service-secret', 'test-storage-secret', 'too-short']) assert.equal(result.includes(secret), false)
  assert.match(getPublishingSetupNotice(), /Trigger.dev.*Cloudflare R2.*Verschlüsselung.*App-Adresse/)
  assert.ok(Object.values(getPublishingCapabilities()).every((value) => !value.configured && !value.canAutoPublish))
})

test('complete core config preserves platform audit restrictions', () => {
  Object.assign(process.env, complete)
  assert.equal(isPublishingConfigured(), true)
  assert.equal(getPublishingSetupNotice(), null)
  assert.deepEqual(getPublishingSetupIssues(), [])
  const capabilities = getPublishingCapabilities()
  assert.ok(Object.values(capabilities).every((value) => value.configured && !value.canAutoPublish))
  process.env.YOUTUBE_AUDIT_PASSED = 'true'
  process.env.META_APP_REVIEW_PASSED = 'true'
  assert.equal(getPublishingCapabilities().youtube.canAutoPublish, true)
  assert.equal(getPublishingCapabilities().instagram.canAutoPublish, true)
  assert.equal(getPublishingCapabilities().tiktok.canAutoPublish, false)
})

test('missing platform credentials name that platform without blaming configured cloud services', () => {
  Object.assign(process.env, complete, { GOOGLE_CLIENT_SECRET: '', META_APP_ID: '', TIKTOK_CLIENT_KEY: ' ' })
  assert.equal(isPublishingConfigured(), true)
  const capabilities = getPublishingCapabilities()
  for (const [platform, label] of [['youtube', 'YouTube'], ['instagram', 'Instagram'], ['tiktok', 'TikTok']]) {
    assert.equal(capabilities[platform].configured, false)
    assert.equal(capabilities[platform].canAutoPublish, false)
    assert.match(capabilities[platform].notice, new RegExp(label))
    assert.doesNotMatch(capabilities[platform].notice, /Cloudflare|Trigger|Serverkonfiguration/)
  }
})

test('app origin rejects credentials and non-local HTTP but accepts HTTPS and local development', () => {
  Object.assign(process.env, complete)
  for (const origin of ['http://example.test', 'https://user:secret@example.test', 'not-a-url']) {
    process.env.NEXT_PUBLIC_APP_URL = origin
    assert.equal(isPublishingConfigured(), false)
  }
  for (const origin of ['https://example.test', 'http://localhost:3000', 'http://127.0.0.1:3000']) {
    process.env.NEXT_PUBLIC_APP_URL = origin
    assert.equal(isPublishingConfigured(), true)
  }
})
