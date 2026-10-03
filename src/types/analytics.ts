import type { SocialAccountStatus, SocialPlatform } from './database'
import type { PublishingStatus } from './publishing'

/**
 * Was `/api/analytics` an den Browser gibt. Zählwerte sind `null`, wenn die
 * Plattform sie nicht liefert — nie 0, sonst läse das Dashboard eine
 * fehlende Berechtigung als „keine Aufrufe".
 */
export interface ChannelAnalytics {
  accountId: string
  platform: SocialPlatform
  username: string | null
  avatarUrl: string | null
  status: SocialAccountStatus
  followers: number | null
  /** Aufrufe des ganzen Kanals; nur YouTube liefert sie ohne Insights. */
  totalViews: number | null
  mediaCount: number | null
  notice: string | null
}

export interface PostAnalytics {
  jobId: string
  accountId: string
  platform: SocialPlatform
  /** Pipeline-Lauf des Projekts, entspricht `project.trigger_run_id`. */
  sourceJobId: string
  clipIndex: number
  /** ID des Clips im Workspace, aus dem Snapshot des Auftrags. */
  clipId: string | null
  title: string
  publishedAt: string
  url: string | null
  thumbnailUrl: string | null
  viralityScore: number
  durationSeconds: number
  /** Hochgeladen, aber noch nicht öffentlich (YouTube privat, TikTok-Inbox). */
  isPublic: boolean
  views: number | null
  likes: number | null
  comments: number | null
  notice: string | null
}

export interface QueueCount {
  status: PublishingStatus
  platform: SocialPlatform
  /** Pipeline-Lauf, damit die Seite auf das passende Projekt verlinken kann. */
  sourceJobId: string
  count: number
}

export interface AnalyticsResponse {
  configured: boolean
  error?: string
  fetchedAt: string
  channels: ChannelAnalytics[]
  posts: PostAnalytics[]
  queue: QueueCount[]
}
