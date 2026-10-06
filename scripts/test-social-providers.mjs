import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import ts from 'typescript'

// Transpile only these server modules, without loading Next or any .env files.
// All HTTP calls below are mocked; an unexpected call fails instead of using a network.
const modules = new Map()
function load(path) {
  const full = resolve(path)
  if (modules.has(full)) return modules.get(full).exports
  const loaded = { exports: {} }
  modules.set(full, loaded)
  const compiled = ts.transpileModule(readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'module', 'exports', compiled)((specifier) => {
    if (specifier === 'server-only') return {}
    if (!specifier.startsWith('.')) throw new Error(`Unexpected test import: ${specifier}`)
    return load(resolve(dirname(full), `${specifier}.ts`))
  }, loaded, loaded.exports)
  return loaded.exports
}
const root = fileURLToPath(new URL('../src/services/social/', import.meta.url))
const { youtubeProvider } = load(resolve(root, 'youtube.ts'))
const { instagramProvider } = load(resolve(root, 'instagram.ts'))
const { tiktokProvider, getTikTokCreatorInfo, validateTikTokPost } = load(resolve(root, 'tiktok.ts'))
const { PublishError } = load(resolve(root, 'base.ts'))
const { providerError } = load(resolve(root, 'http.ts'))

const originalFetch = globalThis.fetch
const envKeys = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'META_APP_ID', 'META_APP_SECRET', 'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'YOUTUBE_AUDIT_PASSED', 'TIKTOK_AUDIT_PASSED']
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))
for (const key of envKeys) process.env[key] = 'test-only-placeholder'
afterEach(() => { globalThis.fetch = originalFetch; process.env.TIKTOK_AUDIT_PASSED = 'false' })
process.on('exit', () => { for (const key of envKeys) { if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key] } })

const response = (body, status = 200, headers = {}) => new Response(body == null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const ttResponse = (data) => response({ data, error: { code: 'ok' } })
const completeVideo = (privacyStatus = 'public') => response({ items: [{ id: 'video-1', status: { privacyStatus, uploadStatus: 'processed' }, processingDetails: { processingStatus: 'succeeded' } }] })
function queueFetch(steps) {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    const step = steps.shift()
    assert.ok(step, `Unexpected request to ${new URL(url).pathname}`)
    return typeof step === 'function' ? step(String(url), init) : step
  }
  return { calls, done: () => assert.equal(steps.length, 0, 'All expected HTTP calls occurred') }
}
function job(checkpoint = {}) {
  let saved = { ...checkpoint }
  const history = []
  const params = { account: { accessToken: 'test-token', platformAccountId: 'account-1', metaIgUserId: 'ig-1' }, videoUrl: 'https://media.example.com/clip.mp4', title: 'Test', description: 'Description', hashtags: ['#shorts'], idempotencyKey: 'job-1', checkpoint: saved,
    saveCheckpoint: async (value) => { saved = { ...value }; history.push(saved) },
  }
  return { params, history, saved: () => saved, retry: () => ({ ...params, checkpoint: saved }) }
}
const failsAs = (kind) => (error) => error instanceof PublishError && error.kind === kind

const directOptions = (overrides = {}) => ({ privacyLevel: 'PUBLIC_TO_EVERYONE', allowComment: false, allowDuet: false, allowStitch: false, commercialContent: false, ownBrand: false, brandedContent: false, isAigc: false, consent: true, ...overrides })
const creatorResponse = (overrides = {}) => ttResponse({ creator_username: 'creator', creator_nickname: 'Creator', privacy_level_options: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'], comment_disabled: false, duet_disabled: false, stitch_disabled: true, max_video_post_duration_sec: 60, ...overrides })
function directJob(options = directOptions(), checkpoint = {}) {
  const j = job(checkpoint)
  Object.assign(j.params, { tiktokPost: options, videoDurationSeconds: 30 })
  j.params.account.scopes = ['user.info.basic', 'video.publish']
  return j
}

test('legacy Inbox authorization cannot initiate Direct Post and unaudited creators only offer private tests', async () => {
  const j = job()
  const blocked = queueFetch([])
  await assert.rejects(getTikTokCreatorInfo(j.params.account), /video.publish/)
  blocked.done()
  process.env.TIKTOK_AUDIT_PASSED = 'false'
  const q = queueFetch([creatorResponse()])
  const creator = await getTikTokCreatorInfo(directJob().params.account)
  assert.deepEqual(creator.privacyOptions, ['SELF_ONLY'])
  assert.equal(creator.publicPostingEnabled, false)
  q.done()
})

test('Direct Post sends the creator-selected metadata and only marks confirmed public posts published', async () => {
  process.env.TIKTOK_AUDIT_PASSED = 'true'
  const j = directJob(directOptions({ allowComment: true, commercialContent: true, ownBrand: true, isAigc: true }))
  const q = queueFetch([creatorResponse(), (url, init) => {
    assert.equal(new URL(url).pathname, '/v2/post/publish/video/init/')
    assert.equal(j.saved().tiktok_direct_publish_id_pending, 'true')
    assert.deepEqual(JSON.parse(init.body).post_info, {
      title: 'Description\n\n#shorts', privacy_level: 'PUBLIC_TO_EVERYONE',
      disable_comment: false, disable_duet: true, disable_stitch: true,
      brand_organic_toggle: true, brand_content_toggle: false, is_aigc: true,
    })
    return ttResponse({ publish_id: 'direct-1' })
  }, ttResponse({ status: 'PUBLISH_COMPLETE', publicly_available_post_id: ['post-1'] })])
  const result = await tiktokProvider.publish(j.params)
  assert.equal(result.requiresManualStep, false)
  assert.equal(result.platformPostUrl, 'https://www.tiktok.com/@creator/video/post-1')
  assert.equal(j.saved().tiktok_direct_publish_id, 'direct-1')
  assert.equal(j.saved().tiktok_publish_id, undefined)
  q.done()
})

test('private Direct Posts never promise public visibility or route to the Inbox', async () => {
  process.env.TIKTOK_AUDIT_PASSED = 'false'
  const j = directJob(directOptions({ privacyLevel: 'SELF_ONLY' }))
  const q = queueFetch([creatorResponse(), (url) => {
    assert.equal(new URL(url).pathname, '/v2/post/publish/video/init/')
    return ttResponse({ publish_id: 'private-1' })
  }, ttResponse({ status: 'PUBLISH_COMPLETE' })])
  const result = await tiktokProvider.publish(j.params)
  assert.equal(result.requiresManualStep, true)
  assert.match(result.manualStepReason, /Privat auf TikTok veröffentlicht/)
  q.done()
})

test('Direct Post validates consent, current visibility, duration, interactions and commercial disclosure before init', async () => {
  process.env.TIKTOK_AUDIT_PASSED = 'true'
  const q = queueFetch([creatorResponse()])
  const creator = await getTikTokCreatorInfo(directJob().params.account)
  validateTikTokPost(directOptions(), creator, 60)
  for (const [options, duration] of [
    [directOptions({ consent: false }), 30], [directOptions({ privacyLevel: 'FOLLOWER_OF_CREATOR' }), 30],
    [directOptions(), 61], [directOptions(), NaN], [directOptions({ allowStitch: true }), 30],
    [directOptions({ commercialContent: true }), 30], [directOptions({ ownBrand: true }), 30],
    [directOptions({ commercialContent: true, brandedContent: true, privacyLevel: 'SELF_ONLY' }), 30],
  ]) assert.throws(() => validateTikTokPost(options, creator, duration), failsAs('terminal'))
  q.done()
  const rejected = directJob(directOptions({ allowStitch: true }))
  const initBlocked = queueFetch([creatorResponse()])
  await assert.rejects(tiktokProvider.publish(rejected.params), failsAs('terminal'))
  assert.equal(initBlocked.calls.length, 1)
  initBlocked.done()
})

test('ambiguous Direct Post creation is never duplicated on worker retry', async () => {
  process.env.TIKTOK_AUDIT_PASSED = 'true'
  const j = directJob()
  let q = queueFetch([creatorResponse(), () => { throw new Error('lost response') }])
  await assert.rejects(tiktokProvider.publish(j.params), failsAs('uncertain'))
  q.done()
  q = queueFetch([])
  await assert.rejects(tiktokProvider.publish(j.retry()), failsAs('uncertain'))
  assert.equal(q.calls.length, 0)
  q.done()
})

test('existing Direct Posts resume status checks without creating another upload', async () => {
  const j = directJob(directOptions(), { tiktok_direct_publish_id: 'direct-1', tiktok_creator_username: 'creator' })
  const q = queueFetch([(url) => {
    assert.equal(new URL(url).pathname, '/v2/post/publish/status/fetch/')
    return ttResponse({ status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['post-1'] })
  }])
  assert.equal((await tiktokProvider.publish(j.params)).requiresManualStep, false)
  q.done()
})

test('an existing Inbox upload is not reused or resent as a Direct Post', async () => {
  const j = directJob(directOptions(), { tiktok_publish_id: 'inbox-1' })
  const q = queueFetch([])
  await assert.rejects(tiktokProvider.publish(j.params), failsAs('terminal'))
  assert.equal(q.calls.length, 0)
  q.done()
})

test('TikTok audit and privacy rejections do not invalidate channel credentials', () => {
  for (const code of ['unaudited_client_can_only_post_to_private_accounts', 'privacy_level_option_mismatch', 'spam_risk_user_banned_from_posting']) {
    assert.equal(providerError(403, { error: { code } }, 'TikTok', true).kind, 'terminal')
  }
})

test('OAuth URLs preserve state and new TikTok connections request Direct Post permission', () => {
  process.env.TIKTOK_AUDIT_PASSED = 'true'
  for (const provider of [youtubeProvider, instagramProvider, tiktokProvider]) {
    const url = new URL(provider.getAuthUrl({ state: 'signed-state', redirectUri: 'https://app.example.com/callback' }))
    assert.equal(url.searchParams.get('state'), 'signed-state')
    assert.equal(url.searchParams.get('redirect_uri'), 'https://app.example.com/callback')
  }
  assert.equal(new URL(tiktokProvider.getAuthUrl({ state: 'x', redirectUri: 'https://app.example.com/callback' })).searchParams.get('scope'), 'user.info.basic,video.publish')
})

test('Google code exchange checks actually granted permissions and retains refresh token expiry', async () => {
  const q = queueFetch([(url, init) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token')
    assert.equal(init.body.get('code'), 'authorization-code')
    return response({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600, refresh_token_expires_in: 86400, scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly' })
  }, response({ access_token: 'access', scope: 'https://www.googleapis.com/auth/youtube.readonly' })])
  const tokens = await youtubeProvider.exchangeCode({ code: 'authorization-code', redirectUri: 'https://app.example.com/callback' })
  assert.equal(tokens.refreshToken, 'refresh')
  assert.ok(tokens.refreshExpiresAt > tokens.expiresAt)
  await assert.rejects(youtubeProvider.exchangeCode({ code: 'no-upload-scope', redirectUri: 'https://app.example.com/callback' }), failsAs('auth'))
  q.done()
})

test('TikTok refresh preserves rotated access and refresh tokens and their real grants', async () => {
  const q = queueFetch([(url, init) => {
    assert.equal(new URL(url).pathname, '/v2/oauth/token/')
    assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded')
    assert.equal(init.body.get('grant_type'), 'refresh_token')
    assert.equal(init.body.get('refresh_token'), 'old-refresh')
    return response({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 86400, refresh_expires_in: 30000000, scope: 'user.info.basic,video.upload' })
  }])
  const tokens = await tiktokProvider.refreshToken('old-refresh')
  assert.equal(tokens.refreshToken, 'new-refresh')
  assert.equal(tokens.accessToken, 'new-access')
  assert.deepEqual(tokens.scopes, ['user.info.basic', 'video.upload'])
  q.done()
})

test('TikTok authorization and code exchange include PKCE challenge and verifier', async () => {
  const authUrl = new URL(tiktokProvider.getAuthUrl({
    state: 'test-state',
    redirectUri: 'https://app.example.com/callback',
    codeChallenge: 'challenge-123',
  }))
  assert.equal(authUrl.searchParams.get('code_challenge'), 'challenge-123')
  assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256')

  const q = queueFetch([(url, init) => {
    assert.equal(new URL(url).pathname, '/v2/oauth/token/')
    assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded')
    assert.equal(init.body.get('grant_type'), 'authorization_code')
    assert.equal(init.body.get('code'), 'auth-code')
    assert.equal(init.body.get('code_verifier'), 'verifier-123')
    return response({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 86400, scope: 'user.info.basic video.publish' })
  }])
  const tokens = await tiktokProvider.exchangeCode({
    code: 'auth-code',
    redirectUri: 'https://app.example.com/callback',
    codeVerifier: 'verifier-123',
  })
  assert.equal(tokens.accessToken, 'access-1')
  assert.equal(tokens.refreshToken, 'refresh-1')
  q.done()
})

const permissions = ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement']
test('Instagram uses the authorized Page token and resolves its professional account', async () => {
  const q = queueFetch([response({ access_token: 'short' }), response({ access_token: 'long' }), response({ data: permissions.map((permission) => ({ permission, status: 'granted' })) }),
    response({ data: [{ id: 'page-1', access_token: 'page-token', instagram_business_account: { id: 'ig-1' } }] }),
    (url, init) => {
      assert.equal(init.headers.Authorization, 'Bearer page-token')
      return response({ id: 'page-1', instagram_business_account: { id: 'ig-1', username: 'creator', profile_picture_url: 'https://image.example.com/avatar.png' } })
    }])
  const tokens = await instagramProvider.exchangeCode({ code: 'code', redirectUri: 'https://app.example.com/callback' })
  assert.equal(tokens.accessToken, 'page-token')
  assert.equal(tokens.refreshToken, undefined)
  const account = await instagramProvider.getAccountInfo(tokens.accessToken)
  assert.equal(account.metaPageId, 'page-1')
  assert.equal(account.metaIgUserId, 'ig-1')
  await assert.rejects(instagramProvider.refreshToken('page-token'), failsAs('auth'))
  q.done()
})

test('Instagram refuses to silently connect the first of multiple authorized accounts', async () => {
  const q = queueFetch([response({ access_token: 'short' }), response({ access_token: 'long' }), response({ data: permissions.map((permission) => ({ permission, status: 'granted' })) }), response({ data: [1, 2].map((id) => ({ id: `page-${id}`, access_token: `page-${id}-token`, instagram_business_account: { id: `ig-${id}` } })) })])
  await assert.rejects(instagramProvider.exchangeCode({ code: 'code', redirectUri: 'https://app.example.com/callback' }), failsAs('auth'))
  q.done()
})

test('YouTube persists session before streaming and reports actual private visibility honestly', async () => {
  process.env.YOUTUBE_AUDIT_PASSED = 'true'
  const j = job()
  const q = queueFetch([
    (url, init) => {
      assert.equal(init.method, 'GET')
      assert.equal(init.headers.Range, 'bytes=0-0')
      return new Response(new Uint8Array([1]), { status: 206, headers: { 'Content-Length': '1', 'Content-Range': 'bytes 0-0/4', ETag: 'v1' } })
    },
    (url, init) => {
      assert.equal(j.saved().youtube_session_url_pending, 'true')
      assert.equal(JSON.parse(init.body).status.privacyStatus, 'public')
      return new Response(null, { status: 200, headers: { Location: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=one' } })
    },
    (url, init) => {
      assert.match(j.saved().youtube_session_url, /upload_id=one/)
      assert.equal(init.headers['If-Match'], 'v1')
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 206, headers: { 'Content-Range': 'bytes 0-3/4' } })
    },
    (url, init) => { assert.equal(init.redirect, 'manual'); assert.equal(init.headers['Content-Range'], 'bytes 0-3/4'); return response({ id: 'video-1' }) },
    completeVideo('private'),
  ])
  const result = await youtubeProvider.publish(j.params)
  assert.equal(result.requiresManualStep, true)
  assert.equal(j.saved().youtube_video_id, 'video-1')
  q.done()
})

test('YouTube storage denial does not invalidate Google credentials', async () => {
  const q = queueFetch([new Response(null, { status: 403 })])
  await assert.rejects(youtubeProvider.publish(job().params), failsAs('terminal'))
  q.done()
})

test('YouTube rejects an invalid storage range before creating an upload', async () => {
  const q = queueFetch([new Response(new Uint8Array([1]), { status: 206, headers: { 'Content-Length': '1', 'Content-Range': 'bytes 1-1/4' } })])
  await assert.rejects(youtubeProvider.publish(job().params), failsAs('terminal'))
  q.done()
})

test('YouTube reconciles a lost completed-upload response without sending a second video', async () => {
  const j = job({ youtube_session_url: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=one', youtube_total_bytes: '4' })
  const q = queueFetch([(url, init) => {
    assert.equal(init.method, 'PUT')
    assert.equal(init.redirect, 'manual')
    assert.equal(init.headers['Content-Range'], 'bytes */4')
    assert.equal(init.body, undefined)
    return response({ id: 'video-1' })
  }, completeVideo()])
  const result = await youtubeProvider.publish(j.params)
  assert.equal(result.requiresManualStep, false)
  assert.equal(q.calls.length, 2)
  q.done()
})

test('YouTube resumes only the missing bytes after interrupted upload', async () => {
  const j = job({ youtube_session_url: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=one', youtube_total_bytes: '4' })
  const q = queueFetch([new Response(null, { status: 308, headers: { Range: 'bytes=0-1' } }),
    (url, init) => { assert.equal(init.headers.Range, 'bytes=2-3'); return new Response(new Uint8Array([3, 4]), { status: 206, headers: { 'Content-Range': 'bytes 2-3/4' } }) },
    (url, init) => { assert.equal(init.headers['Content-Range'], 'bytes 2-3/4'); return response({ id: 'video-1' }) }, completeVideo()])
  await youtubeProvider.publish(j.params)
  q.done()
})

test('expired YouTube session never causes an automatic new upload', async () => {
  const j = job({ youtube_session_url: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=one', youtube_total_bytes: '4' })
  const q = queueFetch([response({}, 404)])
  await assert.rejects(youtubeProvider.publish(j.params), failsAs('uncertain'))
  q.done()
})

test('Instagram persists container and post IDs before subsequent API steps', async () => {
  const j = job()
  const q = queueFetch([response({ data: [{ quota_usage: 4, config: { quota_total: 100 } }] }), response({ id: 'container-1' }),
    (url) => { assert.equal(j.saved().instagram_container_id, 'container-1'); assert.match(url, /container-1/); return response({ status_code: 'FINISHED' }) },
    (url, init) => { assert.equal(j.saved().instagram_post_id_pending, 'true'); assert.equal(init.body.get('creation_id'), 'container-1'); return response({ id: 'post-1' }) },
    () => { assert.equal(j.saved().instagram_post_id, 'post-1'); return response({ id: 'post-1', permalink: 'https://instagram.com/reel/test' }) },
  ])
  const result = await instagramProvider.publish(j.params)
  assert.equal(result.platformPostId, 'post-1')
  assert.equal(result.requiresManualStep, false)
  q.done()
})

test('Instagram resumes an existing container and never replays ambiguous media_publish', async () => {
  const j = job({ instagram_container_id: 'container-1' })
  let q = queueFetch([response({ status_code: 'FINISHED' }), () => { throw new Error('connection lost') }])
  await assert.rejects(instagramProvider.publish(j.params), failsAs('uncertain'))
  assert.equal(j.saved().instagram_post_id_pending, 'true')
  q.done()
  q = queueFetch([response({ status_code: 'FINISHED' })])
  await assert.rejects(instagramProvider.publish(j.retry()), failsAs('uncertain'))
  assert.equal(q.calls.every((call) => call.init.method !== 'POST'), true)
  q.done()
})

test('TikTok inbox delivery is a manual step even with an audit flag', async () => {
  process.env.TIKTOK_AUDIT_PASSED = 'true'
  const j = job()
  const q = queueFetch([(url, init) => {
    assert.match(url, /\/inbox\/video\/init\/$/)
    assert.equal(j.saved().tiktok_publish_id_pending, 'true')
    assert.deepEqual(JSON.parse(init.body), { source_info: { source: 'PULL_FROM_URL', video_url: 'https://media.example.com/clip.mp4' } })
    return ttResponse({ publish_id: 'inbox-1' })
  }, (url) => {
    assert.equal(j.saved().tiktok_publish_id, 'inbox-1')
    assert.match(url, /status\/fetch/)
    return ttResponse({ status: 'SEND_TO_USER_INBOX' })
  }])
  const result = await tiktokProvider.publish(j.params)
  assert.equal(result.requiresManualStep, true)
  assert.equal(result.platformPostUrl, null)
  q.done()
})

test('ambiguous TikTok init is durably blocked from duplicate uploads', async () => {
  const j = job()
  let q = queueFetch([() => { throw new Error('connection lost') }])
  await assert.rejects(tiktokProvider.publish(j.params), failsAs('uncertain'))
  q.done()
  q = queueFetch([])
  await assert.rejects(tiktokProvider.publish(j.retry()), failsAs('uncertain'))
  assert.equal(q.calls.length, 0)
})

test('TikTok resumes an existing publish ID with status requests only', async () => {
  const j = job({ tiktok_publish_id: 'inbox-1' })
  const q = queueFetch([(url, init) => {
    assert.match(url, /status\/fetch/)
    assert.equal(JSON.parse(init.body).publish_id, 'inbox-1')
    return ttResponse({ status: 'SEND_TO_USER_INBOX' })
  }])
  await tiktokProvider.publish(j.params)
  q.done()
})

test('TikTok domain verification failure does not invalidate the channel credentials', async () => {
  const j = job()
  const q = queueFetch([response({ error: { code: 'url_ownership_unverified' } }, 403)])
  await assert.rejects(tiktokProvider.publish(j.params), (error) => {
    assert.equal(error.kind, 'terminal')
    assert.match(error.message, /Video-Domain.*verifiziert/)
    assert.match(error.message, /TikTok-Entwicklerkonsole/)
    return true
  })
  assert.equal(j.saved().tiktok_publish_id_pending, '')
  q.done()
})

test('explicit quota rejection is safe to retry, unlike server errors', async () => {
  const j = job()
  const q = queueFetch([response({ error: { code: 'spam_risk_too_many_pending_share' } }, 403)])
  await assert.rejects(tiktokProvider.publish(j.params), failsAs('quota'))
  assert.equal(j.saved().tiktok_publish_id_pending, '')
  assert.equal(providerError(403, { error: { errors: [{ reason: 'quotaExceeded' }] } }, 'YouTube').kind, 'quota')
  assert.equal(providerError(429, {}, 'TikTok').kind, 'retryable')
  assert.equal(providerError(503, {}, 'Instagram', true).kind, 'uncertain')
  q.done()
})

test('no platform mutation is allowed without durable checkpoint persistence', async () => {
  const q = queueFetch([])
  const j = job()
  for (const provider of [youtubeProvider, instagramProvider, tiktokProvider]) {
    await assert.rejects(provider.publish({ ...j.params, saveCheckpoint: undefined }), failsAs('terminal'))
  }
  await assert.rejects(tiktokProvider.publish({ ...j.params, saveCheckpoint: async () => { throw new Error('database unavailable') } }), failsAs('uncertain'))
  assert.equal(q.calls.length, 0)
})
