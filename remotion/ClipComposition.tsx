import React from 'react'
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion'
import type { ClipCompositionProps } from '@/types/editor'
import { getCropTransform } from './reframe'
import { CaptionLayer } from './captions/CaptionLayer'

/**
 * Die einzige Composition der Plattform.
 *
 * Entscheidend: GENAU diese Komponente läuft sowohl im `<Player>` im Browser
 * als auch in `renderMediaOnLambda()`. Es gibt keinen zweiten Rendering-Pfad.
 * Deshalb ist die Live-Vorschau kein Näherungswert, sondern bildgenau das, was
 * später als MP4 herauskommt — und Änderungen am Untertitel-Styling sind ein
 * reiner Props-Wechsel ohne Server-Roundtrip.
 */
export const ClipComposition: React.FC<ClipCompositionProps> = ({
  videoSrc,
  startSeconds,
  words,
  captionStyle,
  cropKeyframes,
  sourceWidth,
  sourceHeight,
}) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()

  const crop = getCropTransform({
    frame,
    keyframes: cropKeyframes,
    sourceWidth,
    sourceHeight,
    compositionWidth: width,
    compositionHeight: height,
  })

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        {/*
          Der Ausschnitt sitzt auf diesem Wrapper, nicht auf dem Video selbst:
          Remotion setzt auf dem <video> grundsätzlich width/height auf 100% und
          überschreibt damit jede eigene Größenangabe. Position und Größe müssen
          deshalb vom Elternelement kommen, das Video füllt es nur aus.
        */}
        <div
          style={{
            position: 'absolute',
            left: crop.left,
            top: crop.top,
            width: crop.displayWidth,
            height: crop.displayHeight,
          }}
        >
          <OffthreadVideo
            src={videoSrc}
            // trimBefore erwartet Frames. `startFrom` ist seit Remotion 4 deprecated.
            trimBefore={Math.round(startSeconds * fps)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      </AbsoluteFill>

      <CaptionLayer words={words} style={captionStyle} />
    </AbsoluteFill>
  )
}
