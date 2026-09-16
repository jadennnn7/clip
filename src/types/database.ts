/**
 * Datenbank-Typen, gespiegelt aus `supabase/schema.sql`.
 *
 * Sobald die Supabase-Instanz läuft, kann diese Datei durch
 *   npx supabase gen types typescript --local > src/types/database.ts
 * ersetzt werden. Bis dahin sind die Typen handgepflegt, damit die UI
 * gegen die endgültigen Signaturen entwickelt wird.
 */

export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'agency'

export type ProjectSource = 'upload' | 'youtube' | 'drive'

export type ProjectStatus =
  | 'draft'
  | 'queued'
  | 'downloading'
  | 'transcribing'
  | 'analyzing'
  | 'reframing'
  | 'ready'
  | 'error'

export type ClipRenderStatus = 'pending' | 'queued' | 'rendering' | 'ready' | 'error'

export type SocialPlatform = 'youtube' | 'tiktok' | 'instagram'

export type SocialAccountStatus = 'active' | 'expired' | 'needs_reauth' | 'revoked'

/**
 * Wie weit die Automatik auf diesem Kanal gehen darf.
 *
 * Nicht jede Plattform erlaubt Vollautomatik: TikTok zwingt un-auditierte
 * Clients auf SELF_ONLY-Sichtbarkeit, YouTube auf `private`. Deshalb ist der
 * Automatisierungsgrad pro Account einstellbar statt global.
 */
export type AutomationMode = 'auto_publish' | 'review_queue' | 'manual'

export type ScheduleStatus =
  | 'needs_review'
  | 'pending'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_tier: SubscriptionTier
  subscription_status: string
  current_period_end: string | null
  render_minutes_limit: number
  render_minutes_used: number
  render_minutes_reset_at: string
  max_social_accounts: number
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  user_id: string
  title: string
  source_type: ProjectSource
  source_url: string | null
  source_key: string | null
  proxy_key: string | null
  audio_key: string | null
  waveform_key: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
  width: number | null
  height: number | null
  fps: number | null
  status: ProjectStatus
  error_message: string | null
  trigger_run_id: string | null
  rights_confirmed: boolean
  rights_confirmed_at: string | null
  created_at: string
  updated_at: string
}

/** Ein Wort mit exakten Zeitgrenzen — die Basis für Untertitel und Cut-Punkte. */
export interface TranscriptWord {
  word: string
  start: number
  end: number
  confidence?: number
  speaker?: number
}

export interface Transcript {
  id: string
  project_id: string
  user_id: string
  provider: string
  model: string
  language: string
  full_text: string
  words: TranscriptWord[]
  created_at: string
}

/** Ein Keyframe der Kamerafahrt beim 16:9 → 9:16 Reframing. */
export interface CropKeyframe {
  /** Frame-Nummer relativ zum Clip-Anfang. */
  frame: number
  /** Mittelpunkt des Ausschnitts, normalisiert auf 0..1 der Quellbreite/-höhe. */
  x: number
  y: number
  /** 1 = volle Quellhöhe. Größer heißt näher dran. */
  scale: number
}

export type CaptionPreset = 'hormozi' | 'karaoke' | 'minimal' | 'beast'

export type CaptionAnimation = 'pop' | 'fade' | 'slide' | 'none'

export interface CaptionStyle {
  preset: CaptionPreset
  fontFamily: string
  fontSize: number
  color: string
  highlightColor: string
  strokeColor: string
  strokeWidth: number
  /** Vertikale Position in Prozent der Höhe (0 = oben, 100 = unten). */
  positionY: number
  uppercase: boolean
  animation: CaptionAnimation
  /** Wie viele Wörter gleichzeitig sichtbar sind. */
  wordsPerLine: number
}

export interface Clip {
  id: string
  project_id: string
  user_id: string
  title: string
  description: string
  hashtags: string[]
  hook_text: string | null
  start_seconds: number
  end_seconds: number
  virality_score: number
  score_reasoning: string | null
  words: TranscriptWord[]
  caption_style: CaptionStyle
  crop_keyframes: CropKeyframe[]
  render_status: ClipRenderStatus
  render_key: string | null
  render_job_id: string | null
  render_error: string | null
  thumbnail_url: string | null
  created_at: string
  updated_at: string
}

export interface SocialAccount {
  id: string
  user_id: string
  platform: SocialPlatform
  platform_account_id: string
  platform_username: string | null
  avatar_url: string | null
  status: SocialAccountStatus
  automation_mode: AutomationMode
  auto_publish_min_score: number
  meta_page_id: string | null
  meta_ig_user_id: string | null
  last_published_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface PostingSchedule {
  id: string
  user_id: string
  clip_id: string
  social_account_id: string
  publish_at: string
  status: ScheduleStatus
  platform_post_id: string | null
  platform_post_url: string | null
  attempt_count: number
  last_error: string | null
  next_retry_at: string | null
  idempotency_key: string
  created_at: string
  updated_at: string
}

export interface UsageEvent {
  id: string
  user_id: string
  project_id: string | null
  clip_id: string | null
  kind: 'reserve' | 'refund' | 'reset'
  minutes: number
  note: string | null
  created_at: string
}
