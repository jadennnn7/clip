import type { Clip, SocialAccount, SocialPlatform } from './database'
import type { OutputFormat } from './workspace'

export interface PublishingCapability {
  configured: boolean
  canAutoPublish: boolean
  notice: string | null
  publicDirectPost?: boolean
}

export type PublishingCapabilities = Record<SocialPlatform, PublishingCapability>

export type PublishingStatus =
  | 'needs_review' | 'pending' | 'rendering' | 'publishing' | 'published'
  | 'action_required' | 'failed' | 'cancelled'

/** Safe browser projection: credentials, checkpoints and source storage keys stay on the server. */
export interface PublishingJobSummary {
  id: string
  source_job_id: string
  clip_index: number
  /** ID des Clips im Workspace; fehlt bei Aufträgen aus der Zeit vor festen Clip-IDs. */
  clip_id: string | null
  virality_score: number | null
  clip_start_seconds: number
  clip_end_seconds: number
  account_id: string
  title: string
  caption: string
  status: PublishingStatus
  publish_at: string
  render_key: string | null
  review_required: boolean
  last_error: string | null
  platform_post_id: string | null
  platform_post_url: string | null
  attempt_count: number
  next_retry_at: string | null
  created_at: string
  updated_at: string
  platform?: SocialPlatform
  account_username?: string | null
}

export interface PublishingJob {
  id: string
  user_id: string
  source_job_id: string
  clip_index: number
  account_id: string
  clip: Clip
  source_width: number
  source_height: number
  proxy_key: string
  output_format: OutputFormat
  title: string
  review_required: boolean
  status: PublishingStatus
  publish_at: string
  render_key: string | null
  checkpoint: Record<string, string>
  attempt_count: number
  last_error: string | null
  platform_post_id: string | null
  platform_post_url: string | null
  lease_until: string | null
  claim_token: string | null
  next_retry_at: string | null
  created_at: string
  updated_at: string
  account?: SocialAccount
}
