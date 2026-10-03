import React, { useMemo } from 'react'
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion'
import type { ClipCompositionProps } from '@/types/editor'
import { CaptionLayer } from './captions/CaptionLayer'
import { ensureFont } from './fonts'
import { normalizeOverlays, resolveVideoSettings } from './overlays/defaults'
import { OverlayLayer } from './overlays/OverlayLayer'
import { Outro } from './overlays/Outro'
import { Watermark } from './overlays/Watermark'
import { contentDurationInFrames, frameSegments, outroFrames } from './timing'
import { VideoLayer } from './video/VideoLayer'

// Die Untertitel-Presets setzen auf "Inter". Im Editor hat die Seite die
// Schrift zwar geladen, aber unter dem Hash-Namen von next/font — und im
// Render-Chrome gibt es sie gar nicht, dort fiel der Text auf eine
// Serifenschrift zurück. Hier geladen, hält Remotion jeden Frame an, bis die
// Schrift da ist: Vorschau und MP4 zeigen dieselben Buchstaben. Weitere
// Schriften lädt `ensureFont`, sobald ein Untertitel oder Text sie braucht.
for (const weight of [400, 500, 600, 700, 800, 900]) ensureFont('inter', weight)

/**
 * Die einzige Composition der Plattform.
 *
 * Entscheidend: GENAU diese Komponente läuft sowohl im `<Player>` im Browser
 * als auch in `renderMediaOnLambda()`. Es gibt keinen zweiten Rendering-Pfad.
 * Deshalb ist die Live-Vorschau kein Näherungswert, sondern bildgenau das, was
 * später als MP4 herauskommt — und jede Änderung im Editor ist ein reiner
 * Props-Wechsel ohne Server-Roundtrip.
 *
 * Ebenen von unten nach oben: Video (mit Schnitten, Farbe, Blenden),
 * Overlays nach Spur, Untertitel, im Gratis-Tarif das Wasserzeichen. Im
 * Gratis-Tarif folgt danach der Abspann.
 */
export const ClipComposition: React.FC<ClipCompositionProps> = ({
  videoSrc,
  startSeconds,
  endSeconds,
  words,
  captionStyle,
  cropKeyframes,
  sourceWidth,
  sourceHeight,
  segments,
  overlays,
  video,
  watermark,
  outro,
}) => {
  const { fps } = useVideoConfig()
  const contentFrames = contentDurationInFrames({ segments, startSeconds, endSeconds }, fps)
  const outroLength = outroFrames({ watermark, outro }, fps)
  const frames = useMemo(() => frameSegments(segments, startSeconds, endSeconds, fps), [segments, startSeconds, endSeconds, fps])
  const settings = useMemo(() => resolveVideoSettings(video), [video])
  const layers = useMemo(() => normalizeOverlays(overlays), [overlays])

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Eine eigene Sequenz: Darin meldet `useVideoConfig` die Länge des
          Clips, nicht samt Abspann — die Blende am Ende sitzt am Clip-Ende. */}
      <Sequence durationInFrames={contentFrames} name="Clip">
        <VideoLayer
          videoSrc={videoSrc}
          startSeconds={startSeconds}
          segments={frames}
          cropKeyframes={cropKeyframes}
          sourceWidth={sourceWidth}
          sourceHeight={sourceHeight}
          settings={settings}
        />
        {layers.length > 0 ? <OverlayLayer overlays={layers} /> : null}
        {captionStyle.enabled === false ? null : <CaptionLayer words={words} style={captionStyle} />}
        {watermark ? <Watermark /> : null}
      </Sequence>
      {outroLength > 0 ? (
        <Sequence from={contentFrames} durationInFrames={outroLength} name="Abspann">
          <Outro />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  )
}
