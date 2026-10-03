import type { CaptionStyle } from './database'
import type { PipelinePublishingPlan, PipelinePublishingSummary } from './pipeline'

export type OutputFormat = '9:16' | '1:1' | '16:9'

export interface BrandKit {
  id: string
  name: string
  style: CaptionStyle
}

export interface ProjectSettings {
  language: string
  clipLength: 'auto' | 'short' | 'medium' | 'long'
  topic: string
  aspectRatio: OutputFormat
}

export interface ProjectPublishing {
  plan?: PipelinePublishingPlan
  summary?: PipelinePublishingSummary
  /** Original segment order; retained when clips are edited, removed or duplicated. */
  clipIds?: string[]
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  language: 'auto',
  clipLength: 'auto',
  topic: '',
  aspectRatio: '9:16',
}
