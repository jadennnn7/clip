import type { ClipCompositionProps } from './editor'
import type { OutputFormat } from './workspace'

/**
 * Ein MP4-Render eines Clips.
 *
 * Die Props sind exakt die, mit denen der Player im Editor die Vorschau
 * zeichnet — Vorschau und Datei kommen aus derselben `ClipComposition`.
 */
export interface RenderRequest {
  inputProps: ClipCompositionProps
  outputFormat: OutputFormat
  /** Dateiname des Downloads, ohne Endung. */
  title: string
}

export type RenderStatus = 'queued' | 'rendering' | 'ready' | 'error'

export interface RenderJob {
  id: string
  status: RenderStatus
  /** 0..1 */
  progress: number | null
  error: string | null
  title: string
  createdAt: string
  updatedAt: string
}
