import type { EditorialAssessment } from './editorial'

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
  /** Gratis-Test und Abo-Kontingent, 1 Credit = 1 Minute Ausgangsvideo. */
  plan_credits: number
  /** Nachgekaufte Credits; verfallen nicht. */
  pack_credits: number
  monthly_credits: number
  credit_cycle_anchor: string | null
  credit_cycles_granted: number
  cycle_peak_credits: number
  trial_exports_used: number
  trial_ended_at: string | null
  /** Veraltet, nur noch für reserve_/refund_render_minutes. */
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

export type CaptionPreset = 'clean' | 'hormozi' | 'karaoke' | 'minimal' | 'beast' | 'box' | 'elegant' | 'comic' | 'impact' | 'marker' | 'headline' | 'mono'

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
  // --- Seit dem Schnitt-Editor; fehlen bei älteren Clips ---------------------
  /** Untertitel ein- oder ausgeblendet. Fehlt = sichtbar. */
  enabled?: boolean
  /** Fehlt = die kräftigste Stärke, die die Schrift hat. */
  fontWeight?: number
  /** Farbe einer Box hinter der Zeile; null = keine Box. */
  background?: string | null
  backgroundOpacity?: number
  /** Weicher Schlagschatten, 0..1. */
  shadow?: number
  /** Punkt, Komma und Auslassungspunkte zeigen. Fehlt = ausgeblendet; ? und ! bleiben immer. */
  punctuation?: boolean
}

/**
 * Ein behaltener Abschnitt des Clips — Sekunden relativ zum Clip-Start, also
 * an das Quellmaterial gebunden wie die Wort-Timestamps. Was zwischen zwei
 * Abschnitten liegt, ist herausgeschnitten; die Ausgabe spielt die Abschnitte
 * lückenlos hintereinander.
 */
export interface ClipSegment {
  start: number
  end: number
}

export type OverlayAnimation =
  | 'none'
  | 'fade'
  | 'pop'
  | 'zoom'
  | 'blur'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'typewriter'

export type OverlayKind = 'text' | 'shape' | 'emoji' | 'progress'

interface OverlayBase {
  id: string
  kind: OverlayKind
  /** Anzeigename in Timeline und Inspector. */
  name?: string
  /**
   * Zeit in der AUSGABE — also nach allen Schnitten —, Sekunden ab Clip-Anfang.
   * Anders als Wörter hängen Overlays an der Timeline, nicht am Material:
   * Ein Titel bei 0:00 bleibt bei 0:00, auch wenn der Anfang gekürzt wird.
   */
  start: number
  end: number
  /** Spur in der Timeline. Höhere Spuren liegen im Bild weiter oben. */
  track: number
  /** Mittelpunkt, normalisiert auf 0..1 der Bildbreite bzw. -höhe. */
  x: number
  y: number
  /** 1 = Grundgröße. */
  scale: number
  /** Grad, im Uhrzeigersinn. */
  rotation: number
  /** 0..1 */
  opacity: number
  animationIn: OverlayAnimation
  animationOut: OverlayAnimation
  hidden?: boolean
  locked?: boolean
}

export interface TextOverlay extends OverlayBase {
  kind: 'text'
  text: string
  /** Schlüssel aus `remotion/fonts.ts`. */
  font: string
  fontSize: number
  fontWeight: number
  italic: boolean
  color: string
  align: 'left' | 'center' | 'right'
  uppercase: boolean
  /** In em. */
  letterSpacing: number
  lineHeight: number
  strokeColor: string
  strokeWidth: number
  /** Weicher Schlagschatten, 0..1. */
  shadow: number
  /** Farbe der Box hinter dem Text; null = keine Box. */
  background: string | null
  backgroundOpacity: number
  padding: number
  radius: number
  /** Größte Breite des Textblocks, Anteil der Bildbreite. */
  maxWidth: number
  /** Die Box umschließt jede Zeile einzeln statt den ganzen Block — wie Text auf TikTok. */
  lineBox?: boolean
  /** `hook`: der Hook-Titel oben im Clip. Wird im Editor eigens angeboten. */
  role?: 'hook'
}

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow'

export interface ShapeOverlay extends OverlayBase {
  kind: 'shape'
  shape: ShapeKind
  /** Pixel im Ausgabebild. */
  width: number
  height: number
  fill: string | null
  fillOpacity: number
  stroke: string
  strokeWidth: number
  radius: number
}

export interface EmojiOverlay extends OverlayBase {
  kind: 'emoji'
  emoji: string
  /** Pixel im Ausgabebild. */
  size: number
}

/** Fortschrittsbalken am oberen oder unteren Bildrand. Ignoriert x/y. */
export interface ProgressOverlay extends OverlayBase {
  kind: 'progress'
  position: 'top' | 'bottom'
  thickness: number
  color: string
  trackColor: string
  trackOpacity: number
}

export type Overlay = TextOverlay | ShapeOverlay | EmojiOverlay | ProgressOverlay

/**
 * Wie das Quellbild den Rahmen füllt.
 *   fill     — beschnitten, folgt der Kamerafahrt (Standard)
 *   fit      — ganz sichtbar, Rest in Hintergrundfarbe
 *   fit-blur — ganz sichtbar, dahinter dasselbe Bild verwischt
 */
export type VideoLayout = 'fill' | 'fit' | 'fit-blur'

export interface VideoSettings {
  layout: VideoLayout
  /** Zusätzlicher Zoom, 1 = keiner. */
  zoom: number
  /** Verschiebung des Ausschnitts, -1..1. */
  offsetX: number
  offsetY: number
  flip: boolean
  /** Hintergrund bei `fit`. */
  background: string
  /** Name des gewählten Looks — nur für die Anzeige. */
  look: string
  /** 1 = unverändert. */
  brightness: number
  contrast: number
  saturation: number
  /** 0..1, Wärme über einen Sepia-Anteil. */
  warmth: number
  /** 0..1 */
  vignette: number
  /** 0..2, 1 = Originallautstärke. */
  volume: number
  muted: boolean
  /** Ein- und Ausblende aus bzw. in Schwarz, Sekunden. Gilt auch für den Ton. */
  fadeIn: number
  fadeOut: number
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
  /** Getrennte redaktionelle Bewertung; fehlt bei älteren oder regelbasierten Clips. */
  editorial?: EditorialAssessment | null
  /** Herkunft und Hinweise der Auswahl; fehlen bei älteren Clips. */
  analysis_source?: 'ai' | 'heuristic' | null
  analysis_notice?: string | null
  words: TranscriptWord[]
  caption_style: CaptionStyle
  crop_keyframes: CropKeyframe[]
  /** Behaltene Abschnitte; fehlt oder null = der ganze Clip am Stück. */
  segments?: ClipSegment[] | null
  overlays?: Overlay[]
  video_settings?: VideoSettings | null
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
