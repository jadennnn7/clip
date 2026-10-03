import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getPublishingAccount, listAccounts } from '@/services/publishing/accounts'
import { PublishingApiError } from '@/services/publishing/auth'
import { getProvider, PublishError, type ChannelStats, type PostStats } from '@/services/social'
import type { AnalyticsResponse, ChannelAnalytics, PostAnalytics, QueueCount } from '@/types/analytics'
import type { Clip, SocialAccount, SocialPlatform } from '@/types/database'
import type { PublishingStatus } from '@/types/publishing'

/** Plattform-Quoten sind knapp; Kennzahlen ändern sich nicht im Sekundentakt. */
const CACHE_MS = 5 * 60_000
/** Auch „Aktualisieren" darf die Plattformen nicht im Sekundentakt abfragen. */
const MIN_REFRESH_MS = 30_000
/** Ein hängender Kanal darf die ganze Seite nicht aufhalten. */
const PLATFORM_TIMEOUT_MS = 15_000

const cache = new Map<string, { at: number; data: AnalyticsResponse }>()

interface JobRow {
  id: string
  source_job_id: string
  clip_index: number
  account_id: string
  title: string
  status: PublishingStatus
  publish_at: string
  platform_post_id: string | null
  platform_post_url: string | null
  clip_id: string | null
  clip: Pick<Clip, 'virality_score' | 'start_seconds' | 'end_seconds' | 'thumbnail_url'>
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PublishError(`${label}: Die Plattform antwortet gerade nicht.`, 'retryable')), PLATFORM_TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** PublishError-Texte sind für Nutzer geschrieben und enthalten nie Tokens. */
function reason(error: unknown, fallback: string): string {
  return error instanceof PublishError ? error.message : fallback
}

async function loadAccountStats(userId: string, account: SocialAccount, postIds: string[]) {
  try {
    const { credentials } = await getPublishingAccount(userId, account.id)
    const provider = getProvider(account.platform)
    const [channel, posts] = await Promise.allSettled([
      withTimeout(provider.getChannelStats(credentials), 'Kanalstatistik'),
      postIds.length ? withTimeout(provider.getPostStats(credentials, postIds), 'Beitragsstatistik') : Promise.resolve(new Map<string, PostStats>()),
    ])
    return {
      channel: channel.status === 'fulfilled' ? channel.value : null,
      channelError: channel.status === 'rejected' ? reason(channel.reason, 'Kanalstatistik nicht verfügbar.') : null,
      posts: posts.status === 'fulfilled' ? posts.value : null,
      postsError: posts.status === 'rejected' ? reason(posts.reason, 'Beitragsstatistik nicht verfügbar.') : null,
    }
  } catch (error) {
    const message = reason(error, 'Die Verbindung zu diesem Kanal ist gestört.')
    return { channel: null, channelError: message, posts: null, postsError: message }
  }
}

async function loadAnalytics(userId: string): Promise<AnalyticsResponse> {
  const db = createAdminClient()
  const [accounts, platformRows, jobsResult] = await Promise.all([
    listAccounts(userId),
    // Auch getrennte Kanäle: Ihre Beiträge bleiben online und brauchen eine Plattform.
    db.from('social_accounts').select('id,platform').eq('user_id', userId),
    db.from('publishing_jobs')
      .select('id,source_job_id,clip_index,account_id,title,status,publish_at,platform_post_id,platform_post_url,clip_id:clip->>id,clip->virality_score,clip->start_seconds,clip->end_seconds,clip->thumbnail_url')
      .eq('user_id', userId).order('publish_at', { ascending: false }).limit(1000),
  ])
  if (platformRows.error || jobsResult.error) throw new PublishingApiError(502, 'Die Veröffentlichungen konnten nicht geladen werden.')

  const platformOf = new Map((platformRows.data ?? []).map((row) => [row.id as string, row.platform as SocialPlatform]))
  // Die JSON-Pfade kommen flach zurück; hier wieder in die Clip-Form bringen.
  const jobs: JobRow[] = (jobsResult.data ?? []).map((row) => {
    const { virality_score, start_seconds, end_seconds, thumbnail_url, ...job } = row as unknown as Omit<JobRow, 'clip'> & JobRow['clip']
    return { ...job, clip: { virality_score, start_seconds, end_seconds, thumbnail_url } }
  })

  const queue = new Map<string, QueueCount>()
  for (const job of jobs) {
    const platform = platformOf.get(job.account_id)
    if (!platform) continue
    const key = `${job.status}:${platform}:${job.source_job_id}`
    const entry = queue.get(key) ?? { status: job.status, platform, sourceJobId: job.source_job_id, count: 0 }
    entry.count += 1
    queue.set(key, entry)
  }

  // Auch hochgeladene, aber private Beiträge: Ihre Zahlen sind echt, nur klein.
  const postJobs = jobs.filter((job) => job.platform_post_id && (job.status === 'published' || job.status === 'action_required'))
  const results = await Promise.all(accounts.map(async (account) => {
    const ids = [...new Set(postJobs.filter((job) => job.account_id === account.id).map((job) => job.platform_post_id!))]
    return [account.id, await loadAccountStats(userId, account, ids)] as const
  }))
  const statsByAccount = new Map(results)

  const channels: ChannelAnalytics[] = accounts.map((account) => {
    const stats = statsByAccount.get(account.id)
    const channel: ChannelStats | null = stats?.channel ?? null
    return {
      accountId: account.id,
      platform: account.platform,
      username: account.platform_username,
      avatarUrl: account.avatar_url,
      status: account.status,
      followers: channel?.followers ?? null,
      totalViews: channel?.totalViews ?? null,
      mediaCount: channel?.mediaCount ?? null,
      notice: stats?.channelError ?? channel?.notice ?? null,
    }
  })

  const posts: PostAnalytics[] = postJobs.flatMap((job) => {
    const platform = platformOf.get(job.account_id)
    if (!platform) return []
    const stats = statsByAccount.get(job.account_id)
    const post = stats?.posts?.get(job.platform_post_id!)
    const notice = !stats
      ? 'Der Kanal ist nicht mehr verbunden.'
      : stats.postsError ?? post?.notice ?? (stats.posts && !post && platform !== 'tiktok'
        ? 'Der Beitrag ist auf der Plattform nicht mehr abrufbar.'
        : platform === 'tiktok' ? 'TikTok liefert in dieser Verbindung keine Beitragszahlen.' : null)
    return [{
      jobId: job.id,
      accountId: job.account_id,
      platform,
      sourceJobId: job.source_job_id,
      clipIndex: job.clip_index,
      clipId: job.clip_id ?? null,
      title: job.title,
      publishedAt: post?.publishedAt ?? job.publish_at,
      url: post?.url ?? job.platform_post_url,
      thumbnailUrl: post?.thumbnailUrl ?? job.clip.thumbnail_url ?? null,
      viralityScore: job.clip.virality_score,
      durationSeconds: Math.max(0, job.clip.end_seconds - job.clip.start_seconds),
      isPublic: job.status === 'published',
      views: post?.views ?? null,
      likes: post?.likes ?? null,
      comments: post?.comments ?? null,
      notice,
    }]
  })

  return { configured: true, fetchedAt: new Date().toISOString(), channels, posts, queue: [...queue.values()] }
}

/**
 * Kennzahlen mit kurzem Cache pro Nutzer. `fresh` umgeht ihn — aber nicht
 * öfter als alle 30 Sekunden, sonst verbrennt ein nervöser Klick die
 * Tagesquote von YouTube.
 */
export async function getAnalytics(userId: string, fresh = false): Promise<AnalyticsResponse> {
  const cached = cache.get(userId)
  const age = cached ? Date.now() - cached.at : Infinity
  if (cached && age < (fresh ? MIN_REFRESH_MS : CACHE_MS)) return cached.data
  const data = await loadAnalytics(userId)
  cache.set(userId, { at: Date.now(), data })
  return data
}
