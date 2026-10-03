import React from 'react'
import { Composition } from 'remotion'
import { ClipComposition } from './ClipComposition'
import { COMPOSITION_HEIGHT, COMPOSITION_WIDTH, FPS } from '@/types/editor'
import { DEFAULT_CAPTION_STYLE } from './captions/presets'
import { MOCK_VIDEO_SRC, mockClips } from '@/lib/mock-data'
import { compositionDurationInFrames } from './timing'

const preview = mockClips[0]

/**
 * Registriert die Composition für `npx remotion studio` und für den
 * Lambda-Deploy (`npx remotion lambda sites create`).
 *
 * Die tatsächlichen Props kommen zur Laufzeit aus der Datenbank — die
 * defaultProps dienen nur dem Studio-Preview.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Clip"
      component={ClipComposition}
      width={COMPOSITION_WIDTH}
      height={COMPOSITION_HEIGHT}
      fps={FPS}
      durationInFrames={Math.round((preview.end_seconds - preview.start_seconds) * FPS)}
      defaultProps={{
        videoSrc: MOCK_VIDEO_SRC,
        startSeconds: preview.start_seconds,
        endSeconds: preview.end_seconds,
        words: preview.words,
        captionStyle: DEFAULT_CAPTION_STYLE,
        cropKeyframes: preview.crop_keyframes,
        sourceWidth: 1920,
        sourceHeight: 1080,
        overlays: preview.overlays,
      }}
      // Die Cliplänge ist pro Render unterschiedlich — und nach Schnitten
      // kürzer als das Fenster im Quellvideo. Deshalb aus den Props abgeleitet.
      calculateMetadata={({ props }) => ({
        durationInFrames: compositionDurationInFrames(props, FPS),
      })}
    />
  )
}
