import type { CropKeyframe, ProjectStatus, SocialPlatform, TranscriptWord } from './database'
import type { LinkSource } from '@/lib/links'
import type { ProjectSettings } from './workspace'
import type { EditorialAssessment } from './editorial'

/**
 * Vertrag zwischen der lokalen Pipeline (`services/pipeline`) und dem Browser.
 *
 * Der Browser hält Projekte und Clips im lokalen Workspace; der Server kennt
 * nur den Job. Fertige Segmente übernimmt der Client als Clips — ab dann
 * gehören sie dem Workspace, und der Job liefert nur noch Video und Wellenform.
 */

export interface PipelineSegment {
  start_seconds: number
  end_seconds: number
  /** Behaltene Teilbereiche relativ zum Clip-Start; Lücken werden im Render entfernt. */
  segments?: Array<{ start: number; end: number }>
  virality_score: number
  title: string
  /** Schlagzeile oben im Clip, von der KI formuliert. Fehlt ohne KI-Analyse. */
  hook_title?: string | null
  description: string
  hashtags: string[]
  hook_text: string | null
  score_reasoning: string | null
  editorial?: EditorialAssessment | null
  /** Relativ zum Clip-Start, wie in `Clip.words`. */
  words: TranscriptWord[]
  crop_keyframes: CropKeyframe[]
  /** Echtes Standbild des Clips im 9:16-Ausschnitt, `null` falls das Extrahieren scheiterte. */
  thumbnail_url: string | null
}

export interface PipelineResult {
  durationSeconds: number
  width: number
  height: number
  fps: number
  language: string | null
  transcriptSource: 'deepgram' | 'youtube-captions'
  analysis: 'ai' | 'heuristic'
  /** Hinweis für den Nutzer, etwa wenn auf die regelbasierte Auswahl ausgewichen wurde. */
  notice: string | null
  peaks: number[]
  segments: PipelineSegment[]
  /** Confirmed durable queue entries, not a promise that a provider has published. */
  publishing?: PipelinePublishingSummary
}

export interface PipelinePublishingPlan {
  status: 'automatic' | 'review_required' | 'not_configured'
  message: string
  targets: Array<{
    accountId: string
    platform: SocialPlatform
    username: string | null
    mode: 'auto_publish' | 'review_queue'
    minScore: number
    notice: string | null
  }>
}

export interface PipelinePublishingSummary {
  queuedCount: number
  automaticCount: number
  reviewCount: number
  notice: string | null
}

export interface PipelineJob {
  id: string
  /** Owner of authenticated cloud runs; never supplied by the browser. */
  userId?: string
  url: string
  source: LinkSource
  settings: ProjectSettings
  title: string
  thumbnailUrl: string | null
  durationSeconds: number | null
  /** Sprache laut Quelle und die gewählte Untertitelspur — gebraucht, falls der Job neu startet. */
  sourceLanguage: string | null
  caption: { key: string; automatic: boolean } | null
  status: ProjectStatus
  /** 0..1 innerhalb des aktuellen Schritts, `null` wenn unbekannt. */
  progress: number | null
  message: string | null
  error: string | null
  createdAt: string
  updatedAt: string
  result: PipelineResult | null
  /** Snapshot of the channel setup when this import was started. */
  publishing?: PipelinePublishingPlan
}

export interface StartPipelineResponse {
  jobId: string
  title: string
  source: LinkSource
  durationSeconds: number | null
  thumbnailUrl: string | null
  publishing?: PipelinePublishingPlan
}
