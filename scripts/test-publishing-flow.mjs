import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

// Execute the real queue/policy/worker code with in-memory storage and providers.
// No environment files, database, network, render process or real post is used.
const requireBuiltin = createRequire(import.meta.url)
function load(relative, dependencies = {}) {
  const module = { exports: {} }
  const compiled = ts.transpileModule(readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  new Function('require', 'module', 'exports', compiled)((name) => {
    if (name in dependencies) return dependencies[name]
    if (name === 'server-only') return {}
    if (name.startsWith('node:')) return requireBuiltin(name)
    throw new Error(`Unexpected import: ${name}`)
  }, module, module.exports)
  return module.exports
}
const policy = load('src/services/publishing/policy.ts')
const { buildPublishingPlan } = load('src/services/publishing/plan.ts')
const account = (overrides = {}) => ({ id: 'account-1', user_id: 'user-1', platform: 'youtube', platform_username: 'creator', status: 'active', automation_mode: 'auto_publish', auto_publish_min_score: 80, ...overrides })
const capability = (overrides = {}) => ({ configured: true, canAutoPublish: true, notice: null, ...overrides })
const capabilities = (youtube = {}) => ({ youtube: capability(youtube), instagram: capability(), tiktok: capability({ canAutoPublish: false, notice: 'In TikTok veröffentlichen.' }) })
const clip = (overrides = {}) => ({ id: 'clip-1', title: 'Test clip', analysis_source: 'ai', virality_score: 95, start_seconds: 0, end_seconds: 30, ...overrides })

test('import plan separates effective automatic and approval channels and explains schedule', () => {
  const plan = buildPublishingPlan([account(), account({ id: 'account-2', platform: 'tiktok' }), account({ id: 'account-3', automation_mode: 'manual' })], capabilities())
  assert.equal(plan.status, 'automatic')
  assert.deepEqual(plan.targets.map(({ mode }) => mode), ['auto_publish', 'review_queue'])
  assert.match(plan.message, /8 Stunden/)
  assert.match(plan.message, /Mindestpunktzahl/)
  assert.match(plan.message, /weiteren Kanal/)
})

test('audit, missing setup, disconnected and manual accounts never promise automatic publication', () => {
  const review = buildPublishingPlan([account()], capabilities({ canAutoPublish: false, notice: 'YouTube-Audit fehlt.' }))
  assert.equal(review.status, 'review_required')
  assert.equal(review.targets[0].notice, 'YouTube-Audit fehlt.')
  for (const accounts of [[], [account({ status: 'needs_reauth' })], [account({ automation_mode: 'manual' })]]) {
    const plan = buildPublishingPlan(accounts, capabilities())
    assert.equal(plan.status, 'not_configured')
    assert.equal(plan.targets.length, 0)
    assert.match(plan.message, /nicht veröffentlicht/)
  }
  const brokenSetup = buildPublishingPlan([account()], capabilities(), 'Der Hintergrunddienst fehlt.')
  assert.equal(brokenSetup.status, 'not_configured')
  assert.deepEqual(brokenSetup.targets, [])
  assert.match(brokenSetup.message, /Hintergrunddienst/)
})

test('every required review has an actionable reason; unsafe clips cannot enter automatic publishing', () => {
  assert.equal(policy.initialPublishingStatus(clip(), account(), true), 'pending')
  assert.equal(policy.publishingReviewReason(clip(), account(), true), null)
  for (const [testClip, testAccount, canAuto, expected] of [
    [clip({ virality_score: 70 }), account(), true, /70.*80/],
    [clip({ analysis_source: 'heuristic' }), account(), true, /ohne KI-Analyse/],
    [clip(), account({ automation_mode: 'review_queue' }), true, /Freigabe vor jedem Post/],
    [clip(), account(), false, /Provider-Freigabe fehlt/],
  ]) {
    assert.equal(policy.initialPublishingStatus(testClip, testAccount, canAuto), 'needs_review')
    assert.match(policy.publishingReviewReason(testClip, testAccount, canAuto, 'Provider-Freigabe fehlt.'), expected)
  }
})

function queueHarness(accounts = [account()], caps = capabilities()) {
  const rows = new Map()
  const dueFilters = []
  const db = {
    from(table) {
      assert.equal(table, 'publishing_jobs')
      const query = { eq() { return this }, in() { return this }, lte() { return this }, gte() { return this }, lt() { return this }, order() { return this }, limit() { return this }, or(filter) { dueFilters.push(filter); return this },
        select() { return this }, update() { return this },
        then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve) },
        async upsert(values, options) {
          assert.equal(options.ignoreDuplicates, true)
          for (const value of values) {
            const key = [value.user_id, value.source_job_id, value.clip_index, value.account_id].join(':')
            if (!rows.has(key)) rows.set(key, structuredClone(value))
          }
          return { error: null }
        },
      }
      return query
    },
  }
  const module = load('src/services/publishing/jobs.ts', {
    '@trigger.dev/sdk': { tasks: { trigger() { throw new Error('No due jobs in this test') } } },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/pipeline-clips': { segmentToClip: (segment, projectId, now, result, id, userId) => clip({ ...segment, project_id: projectId, id, user_id: userId, analysis_source: result.analysis }) },
    './accounts': { listAccounts: async () => accounts },
    './config': { getPublishingCapabilities: () => caps },
    './policy': policy,
  })
  return { ...module, rows, dueFilters }
}
const enqueueInput = () => ({ targets: { userId: 'user-1', accountIds: ['account-1'] }, sourceJobId: 'run_test', result: { analysis: 'ai', width: 1920, height: 1080, segments: [clip({ virality_score: 65 }), clip({ virality_score: 95 })] }, proxyKey: 'test/proxy.mp4', outputFormat: '9:16' })

test('generated clips create durable automatic jobs, ranked slots, clear low-score reviews, and no duplicates on retry', async () => {
  const harness = queueHarness()
  const input = enqueueInput()
  const summary = await harness.enqueueGeneratedClips(input)
  assert.deepEqual(summary, { queuedCount: 2, automaticCount: 1, reviewCount: 1, notice: null })
  const [automatic, review] = [...harness.rows.values()]
  assert.equal(automatic.status, 'pending')
  assert.equal(automatic.clip_index, 1)
  assert.equal(review.status, 'needs_review')
  assert.match(review.last_error, /65.*80/)
  assert.equal(Date.parse(review.publish_at) - Date.parse(automatic.publish_at), 8 * 3600 * 1000)
  assert.equal(automatic.user_id, 'user-1')
  assert.equal(automatic.proxy_key, input.proxyKey)
  await harness.enqueueGeneratedClips(input)
  assert.equal(harness.rows.size, 2)
})

test('the queue only starts automatic jobs; review jobs wait for the approval click', async () => {
  const harness = queueHarness()
  await harness.dispatchDuePublishingJobs('user-1')
  assert.equal(harness.dueFilters.length, 1)
  assert.match(harness.dueFilters[0], /status\.eq\.pending/)
  assert.doesNotMatch(harness.dueFilters[0], /needs_review/)
  assert.equal(policy.canTransitionJob('needs_review', 'approve'), true)
  assert.equal(policy.canTransitionJob('pending', 'approve'), false)
})

test('account setup changes while generating clips produce an explicit skipped-publication notice', async () => {
  const harness = queueHarness([account({ automation_mode: 'manual' })])
  const summary = await harness.enqueueGeneratedClips(enqueueInput())
  assert.equal(summary.queuedCount, 0)
  assert.match(summary.notice, /2 Veröffentlichungen.*nicht eingeplant/)
  assert.equal(harness.rows.size, 0)
})

function workerHarness({ review = false, renderKey = null, providerManual = false, checkpoint = {}, currentAccount = account(), secondAccount = currentAccount, caps = capabilities() } = {}) {
  const stored = { id: 'job-1', user_id: 'user-1', account_id: 'account-1', clip: clip(), proxy_key: 'proxy.mp4', source_width: 1920, source_height: 1080, output_format: '9:16', review_required: review, render_key: renderKey, checkpoint, attempt_count: 1, last_error: 'Old transient error', status: 'rendering' }
  const events = []
  let accountReads = 0
  const db = {
    async rpc(name) { assert.equal(name, 'claim_publishing_job'); return { data: { ...stored }, error: null } },
    from(table) {
      let patch
      return {
        update(value) { patch = value; return this }, eq() { return this }, in() { return this }, gt() { return this }, select() { return this },
        async maybeSingle() { assert.equal(table, 'publishing_jobs'); Object.assign(stored, patch); events.push(patch.status ?? 'checkpoint'); return { data: { id: stored.id }, error: null } },
        then(resolve) { return Promise.resolve({ error: null }).then(resolve) },
      }
    },
  }
  class PublishError extends Error {}
  const module = load('src/services/publishing/worker.ts', {
    'node:fs/promises': { mkdtemp: async () => '/fake/render', rm: async () => {} },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/storage/r2': { getDownloadUrl: async (key) => `https://storage.test/${key}`, getPublicUrl: (key) => `https://storage.test/${key}`, uploadFile: async () => { events.push('uploaded-render') } },
    '@/lib/composition-props': { buildCompositionProps: (input) => input },
    '@/services/render/remotion': { getServeUrl: async () => '/fake/bundle', renderClipVideo: async () => { events.push('rendered') } },
    '@/services/social': { PublishError, backoffMs: () => 1000, MAX_PUBLISH_ATTEMPTS: 5,
      getProvider: () => ({ getPublishingLimit: async () => ({ remaining: 10 }), publish: async () => { events.push('provider-publish'); return { platformPostId: 'remote-1', platformPostUrl: 'https://provider.test/post', requiresManualStep: providerManual, manualStepReason: providerManual ? 'Bei der Plattform bestätigen.' : undefined } } }),
    },
    './accounts': { getPublishingAccount: async () => ({ account: accountReads++ === 0 ? currentAccount : secondAccount, credentials: {} }) },
    './config': { getPublishingCapabilities: () => caps },
    './policy': policy,
  })
  return { ...module, stored, events }
}

test('automatic queue job renders and publishes without an approval click', async () => {
  const h = workerHarness()
  await h.processPublishingJob('job-1')
  assert.equal(h.stored.status, 'published')
  assert.equal(h.stored.platform_post_id, 'remote-1')
  assert.ok(h.events.indexOf('rendered') < h.events.indexOf('provider-publish'))
  assert.equal(h.events.filter((event) => event === 'provider-publish').length, 1)
})

test('unapproved review jobs are neither rendered nor published and keep the review reason', async () => {
  const h = workerHarness({ review: true, currentAccount: account({ automation_mode: 'review_queue' }) })
  await h.processPublishingJob('job-1')
  assert.equal(h.stored.status, 'needs_review')
  assert.match(h.stored.last_error, /Freigabe vor jedem Post/)
  assert.equal(h.stored.render_key, null)
  assert.equal(h.events.includes('rendered'), false)
  assert.equal(h.events.includes('provider-publish'), false)
})

test('an approved review job renders and publishes in one run, even though the channel stays in review mode', async () => {
  const h = workerHarness({ checkpoint: { approved_at: '2026-09-25T12:00:00.000Z' }, currentAccount: account({ automation_mode: 'review_queue' }) })
  await h.processPublishingJob('job-1')
  assert.equal(h.stored.status, 'published')
  assert.ok(h.events.indexOf('rendered') < h.events.indexOf('provider-publish'))
  assert.equal(h.events.filter((event) => event === 'provider-publish').length, 1)
})

test('revoked automatic consent during rendering stops public posting, and provider manual steps never show published', async () => {
  const paused = workerHarness({ secondAccount: account({ automation_mode: 'manual' }) })
  await paused.processPublishingJob('job-1')
  assert.equal(paused.stored.status, 'needs_review')
  assert.equal(paused.events.includes('provider-publish'), false)
  const manual = workerHarness({ providerManual: true, renderKey: 'existing.mp4' })
  await manual.processPublishingJob('job-1')
  assert.equal(manual.stored.status, 'action_required')
  assert.equal(manual.stored.last_error, 'Bei der Plattform bestätigen.')
})
