import { DEFAULT_CAPTION_STYLE } from '../../remotion/captions/presets'
import { createHookOverlay, draftHookTitle } from '@/lib/hook-title'
import type { Clip } from '@/types/database'
import type { PipelineResult, PipelineSegment } from '@/types/pipeline'

/** Shared snapshot: automatic publishing renders the same initial clip as the editor. */
export function segmentToClip(segment: PipelineSegment, projectId: string, now: string, result: PipelineResult, id = crypto.randomUUID(), userId = 'local-user'): Clip {
  return {
    id,
    project_id: projectId,
    user_id: userId,
    title: segment.title,
    description: segment.description,
    hashtags: segment.hashtags,
    hook_text: segment.hook_text,
    start_seconds: segment.start_seconds,
    end_seconds: segment.end_seconds,
    segments: segment.segments,
    virality_score: segment.virality_score,
    score_reasoning: segment.score_reasoning,
    editorial: segment.editorial ?? null,
    analysis_source: result.analysis,
    analysis_notice: result.notice,
    words: segment.words,
    // Jeder Clip startet mit Untertiteln. Hat die Quelle schon eingebrannte,
    // blendet man die eigenen im Editor aus.
    caption_style: { ...DEFAULT_CAPTION_STYLE },
    // Jeder Clip startet mit Hook-Titel — von der KI formuliert, sonst aus
    // Titel und Einstieg abgeleitet.
    overlays: [createHookOverlay(
      segment.hook_title?.trim() || draftHookTitle(segment),
      segment.end_seconds - segment.start_seconds,
    )],
    crop_keyframes: segment.crop_keyframes,
    render_status: 'pending',
    render_key: null,
    render_job_id: null,
    render_error: null,
    thumbnail_url: segment.thumbnail_url ?? null,
    created_at: now,
    updated_at: now,
  }
}
