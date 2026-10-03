import type { Clip, Project } from '@/types/database'
import type { BrandKit, OutputFormat, ProjectPublishing, ProjectSettings } from '@/types/workspace'

/**
 * Der Workspace als Datenbankzeilen — die Form, in der `/api/workspace` liest
 * und schreibt.
 *
 * Im Browser liegen Einstellungen, Publishing-Plan, ausgeblendete Wörter,
 * Ausgabeformat und Favoriten in eigenen Maps neben Projekten und Clips. In
 * der Datenbank gehören sie als Spalten zur jeweiligen Zeile: So kann nichts
 * übrig bleiben, wenn ein Projekt oder Clip verschwindet.
 */

export const OUTPUT_FORMATS: OutputFormat[] = ['9:16', '1:1', '16:9']

/** Fehlercode von `/api/workspace`, solange die Migration fehlt — der Browser bleibt dann beim lokalen Speicher. */
export const WORKSPACE_SCHEMA_MISSING = 'workspace_schema_missing'

export interface ProjectRow {
  id: string
  title: string
  source_type: Project['source_type']
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
  status: Project['status']
  error_message: string | null
  trigger_run_id: string | null
  rights_confirmed: boolean
  rights_confirmed_at: string | null
  settings: ProjectSettings | null
  publishing: ProjectPublishing | null
  created_at: string
  updated_at: string
}

export interface ClipRow {
  id: string
  project_id: string
  title: string
  description: string
  hashtags: string[]
  hook_text: string | null
  start_seconds: number
  end_seconds: number
  virality_score: number
  score_reasoning: string | null
  editorial: Clip['editorial'] | null
  analysis_source: Clip['analysis_source'] | null
  analysis_notice: string | null
  words: Clip['words']
  caption_style: Clip['caption_style']
  crop_keyframes: Clip['crop_keyframes']
  segments: Clip['segments'] | null
  overlays: NonNullable<Clip['overlays']>
  video_settings: Clip['video_settings'] | null
  render_status: Clip['render_status']
  render_key: string | null
  render_job_id: string | null
  render_error: string | null
  thumbnail_url: string | null
  removed_words: number[]
  output_format: OutputFormat | null
  is_favorite: boolean
  created_at: string
  updated_at: string
}

export interface BrandKitRow {
  id: string
  name: string
  style: BrandKit['style']
}

export interface WorkspaceSnapshot {
  /** Ob der Workspace schon angelegt ist; sonst entstehen Vorlagen bzw. die Übernahme aus dem Browser. */
  initialized: boolean
  projects: ProjectRow[]
  clips: ClipRow[]
  brandKits: BrandKitRow[]
}

/** Postgres liefert `numeric` je nach Weg als Zahl oder als Text. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

export function projectToRow(project: Project, settings: ProjectSettings | undefined, publishing: ProjectPublishing | undefined): ProjectRow {
  return {
    id: project.id,
    title: project.title,
    source_type: project.source_type,
    source_url: project.source_url,
    source_key: project.source_key,
    proxy_key: project.proxy_key,
    audio_key: project.audio_key,
    waveform_key: project.waveform_key,
    thumbnail_url: project.thumbnail_url,
    duration_seconds: project.duration_seconds,
    width: project.width,
    height: project.height,
    fps: project.fps,
    status: project.status,
    error_message: project.error_message,
    trigger_run_id: project.trigger_run_id,
    rights_confirmed: project.rights_confirmed,
    rights_confirmed_at: project.rights_confirmed_at,
    settings: settings ?? null,
    publishing: publishing ?? null,
    created_at: project.created_at,
    updated_at: project.updated_at,
  }
}

export function rowToProject(row: ProjectRow, userId: string): { project: Project; settings: ProjectSettings | null; publishing: ProjectPublishing | null } {
  const { settings, publishing, ...rest } = row
  return {
    project: {
      ...rest,
      user_id: userId,
      duration_seconds: toNumber(row.duration_seconds),
      width: toNumber(row.width),
      height: toNumber(row.height),
      fps: toNumber(row.fps),
    },
    settings,
    publishing,
  }
}

export function clipToRow(clip: Clip, removedWords: number[] | undefined, outputFormat: OutputFormat | undefined, favorite: boolean): ClipRow {
  return {
    id: clip.id,
    project_id: clip.project_id,
    title: clip.title,
    description: clip.description,
    hashtags: clip.hashtags,
    hook_text: clip.hook_text,
    start_seconds: clip.start_seconds,
    end_seconds: clip.end_seconds,
    // Die Spalte ist ganzzahlig und auf 0–100 begrenzt.
    virality_score: Math.min(100, Math.max(0, Math.round(clip.virality_score))),
    score_reasoning: clip.score_reasoning,
    editorial: clip.editorial ?? null,
    analysis_source: clip.analysis_source ?? null,
    analysis_notice: clip.analysis_notice ?? null,
    words: clip.words,
    caption_style: clip.caption_style,
    crop_keyframes: clip.crop_keyframes,
    segments: clip.segments ?? null,
    overlays: clip.overlays ?? [],
    video_settings: clip.video_settings ?? null,
    render_status: clip.render_status,
    render_key: clip.render_key,
    render_job_id: clip.render_job_id,
    render_error: clip.render_error,
    thumbnail_url: clip.thumbnail_url,
    removed_words: removedWords ?? [],
    output_format: outputFormat ?? null,
    is_favorite: favorite,
    created_at: clip.created_at,
    updated_at: clip.updated_at,
  }
}

export function rowToClip(row: ClipRow, userId: string): { clip: Clip; removedWords: number[]; outputFormat: OutputFormat | null; favorite: boolean } {
  const { removed_words, output_format, is_favorite, ...rest } = row
  return {
    clip: {
      ...rest,
      user_id: userId,
      start_seconds: toNumber(row.start_seconds) ?? 0,
      end_seconds: toNumber(row.end_seconds) ?? 0,
      virality_score: toNumber(row.virality_score) ?? 0,
    },
    removedWords: Array.isArray(removed_words) ? removed_words.filter(Number.isInteger) : [],
    outputFormat: output_format && OUTPUT_FORMATS.includes(output_format) ? output_format : null,
    favorite: is_favorite === true,
  }
}

export function brandKitToRow(kit: BrandKit): BrandKitRow {
  return { id: kit.id, name: kit.name, style: kit.style }
}
