import type { Clip } from '@/types/database'
import type { ClipCompositionProps } from '@/types/editor'
import { clipSegments, outputCaptionWords } from '@/lib/clip-export'
import { HOOK_TITLES_PAUSED, isHookOverlay } from '@/lib/hook-title'

/**
 * Die Props der `ClipComposition` für einen Clip.
 *
 * Editor-Vorschau, Clip-Seite und Render bauen sie hier — an genau einer
 * Stelle. So kann keine der drei ein Feld vergessen, und was man im Editor
 * sieht, ist, was als MP4 herauskommt.
 */
export function buildCompositionProps({
  clip,
  removedWords,
  videoSrc,
  sourceWidth,
  sourceHeight,
  watermark = false,
  outro = true,
}: {
  clip: Clip
  removedWords: number[]
  videoSrc: string
  sourceWidth: number
  sourceHeight: number
  /** Gratis-Tarif. Im Browser nur für die Vorschau; beim Export setzt es der Server. */
  watermark?: boolean
  /** Abspann hinter dem Clip, sofern `watermark`. Der Editor schaltet ihn ab. */
  outro?: boolean
}): ClipCompositionProps {
  return {
    videoSrc,
    startSeconds: clip.start_seconds,
    endSeconds: clip.end_seconds,
    words: outputCaptionWords(clip, removedWords),
    captionStyle: clip.caption_style,
    cropKeyframes: clip.crop_keyframes,
    sourceWidth,
    sourceHeight,
    segments: clip.segments ? clipSegments(clip) : null,
    overlays: (clip.overlays ?? []).filter((overlay) => !(HOOK_TITLES_PAUSED && isHookOverlay(overlay))),
    video: clip.video_settings ?? null,
    watermark,
    outro,
  }
}
