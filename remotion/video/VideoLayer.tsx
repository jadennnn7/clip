import React from 'react'
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { CropKeyframe, VideoSettings } from '@/types/database'
import { getCropTransform } from '../reframe'
import type { FrameSegment } from '../timing'

interface VideoLayerProps {
  videoSrc: string
  startSeconds: number
  segments: FrameSegment[]
  cropKeyframes: CropKeyframe[]
  sourceWidth: number
  sourceHeight: number
  settings: VideoSettings
}

/** CSS-Filter der Farbeinstellungen; `undefined`, solange alles neutral ist. */
export function videoFilter(settings: VideoSettings): string | undefined {
  const parts: string[] = []
  if (settings.brightness !== 1) parts.push(`brightness(${settings.brightness})`)
  if (settings.contrast !== 1) parts.push(`contrast(${settings.contrast})`)
  if (settings.saturation !== 1) parts.push(`saturate(${settings.saturation})`)
  if (settings.warmth > 0) parts.push(`sepia(${settings.warmth * 0.55})`)
  return parts.length > 0 ? parts.join(' ') : undefined
}

/**
 * Das Quellbild: Abschnitt für Abschnitt, jeweils eine eigene `<Sequence>`.
 *
 * Jeder Abschnitt ist ein eigenes Video-Element, das an seiner Quellstelle
 * beginnt. `premountFor` legt es eine Sekunde vorher unsichtbar an, damit es
 * am Schnitt schon gesucht und gepuffert hat — sonst stockte die Vorschau an
 * jeder Schnittkante.
 *
 * `pauseWhenBuffering` hält den Player an, solange ein Video noch lädt oder
 * sucht. Ohne das (Remotion-4-Standard) lief die Zeit samt Untertiteln über
 * ein schwarzes Bild weiter, bis das Video nachkam. Im Render wirkungslos.
 */
export const VideoLayer: React.FC<VideoLayerProps> = ({ settings, segments, ...media }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const fade = fadeAt(frame, settings, fps, durationInFrames)

  // Während ein Projekt noch geladen wird, kann der Editor kurzzeitig eine
  // leere URL erhalten. Remotion versucht sonst sofort, ein Video mit `src=""`
  // zu dekodieren und meldet nur den wenig hilfreichen Fehler „Error occurred
  // in video {}". Der Player bleibt als schwarzer Hintergrund stabil, bis die
  // echte Media-URL vorhanden ist.
  if (!media.videoSrc.trim()) {
    return <AbsoluteFill style={{ backgroundColor: '#000' }} />
  }

  return (
    <AbsoluteFill style={{ backgroundColor: settings.layout === 'fit' ? settings.background : '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ opacity: fade, transform: settings.flip ? 'scaleX(-1)' : undefined }}>
        {segments.map((segment) => (
          <Sequence
            key={`${segment.from}:${segment.sourceStartFrame}`}
            from={segment.from}
            durationInFrames={segment.durationInFrames}
            premountFor={fps}
            name="Abschnitt"
          >
            <SegmentVideo {...media} segment={segment} settings={settings} />
          </Sequence>
        ))}
      </AbsoluteFill>
      {settings.vignette > 0 ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at center, transparent ${Math.round(62 - settings.vignette * 30)}%, rgba(0, 0, 0, ${0.35 + settings.vignette * 0.5}) 100%)`,
            opacity: fade,
          }}
        />
      ) : null}
    </AbsoluteFill>
  )
}

/** Deckkraft für die Blende aus und in Schwarz. Ton folgt derselben Kurve. */
function fadeAt(frame: number, settings: VideoSettings, fps: number, durationInFrames: number): number {
  let value = 1
  const fadeIn = Math.round(settings.fadeIn * fps)
  const fadeOut = Math.round(settings.fadeOut * fps)
  if (fadeIn > 0) value = Math.min(value, interpolate(frame, [0, fadeIn], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
  if (fadeOut > 0) value = Math.min(value, interpolate(frame, [durationInFrames - fadeOut, durationInFrames - 1], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
  return value
}

const SegmentVideo: React.FC<Omit<VideoLayerProps, 'segments'> & { segment: FrameSegment }> = ({
  videoSrc,
  startSeconds,
  segment,
  cropKeyframes,
  sourceWidth,
  sourceHeight,
  settings,
}) => {
  const frame = useCurrentFrame()
  const { fps, width, height, durationInFrames } = useVideoConfig()
  // Die Kamerafahrt hängt am Material: Frame ab Clip-Start, nicht ab Ausgabe.
  const sourceFrame = segment.sourceStartFrame + frame
  const trimBefore = Math.round(startSeconds * fps) + segment.sourceStartFrame
  const filter = videoFilter(settings)
  const volume = (local: number) => settings.volume * fadeAt(segment.from + local, settings, fps, durationInFrames)

  if (settings.layout === 'fill') {
    const crop = getCropTransform({
      frame: sourceFrame,
      keyframes: cropKeyframes,
      sourceWidth,
      sourceHeight,
      compositionWidth: width,
      compositionHeight: height,
      zoom: settings.zoom,
      offsetX: settings.offsetX,
      offsetY: settings.offsetY,
    })
    return (
      <AbsoluteFill>
        {/*
          Der Ausschnitt sitzt auf diesem Wrapper, nicht auf dem Video selbst:
          Remotion setzt auf dem <video> grundsätzlich width/height auf 100% und
          überschreibt damit jede eigene Größenangabe. Position und Größe müssen
          deshalb vom Elternelement kommen, das Video füllt es nur aus.
        */}
        <div style={{ position: 'absolute', left: crop.left, top: crop.top, width: crop.displayWidth, height: crop.displayHeight, filter }}>
          <OffthreadVideo
            src={videoSrc}
            // trimBefore erwartet Frames. `startFrom` ist seit Remotion 4 deprecated.
            trimBefore={trimBefore}
            volume={volume}
            muted={settings.muted}
            pauseWhenBuffering
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      </AbsoluteFill>
    )
  }

  // Einpassen: das ganze Quellbild, zentriert, mit Zoom und Verschiebung.
  const contain = Math.min(width / sourceWidth, height / sourceHeight) * settings.zoom
  const displayWidth = sourceWidth * contain
  const displayHeight = sourceHeight * contain
  const left = (width - displayWidth) / 2 + settings.offsetX * width * 0.5
  const top = (height - displayHeight) / 2 + settings.offsetY * height * 0.5

  return (
    <AbsoluteFill>
      {settings.layout === 'fit-blur' ? (
        // Derselbe Frame, randlos vergrößert und stark verwischt. Leicht
        // überdimensioniert, weil die Unschärfe sonst an den Rändern ausfranst.
        <div style={{ position: 'absolute', inset: -width * 0.08, filter: `blur(${Math.round(width * 0.035)}px) brightness(0.62) saturate(1.1)` }}>
          <OffthreadVideo src={videoSrc} trimBefore={trimBefore} muted pauseWhenBuffering style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ) : null}
      <div style={{ position: 'absolute', left, top, width: displayWidth, height: displayHeight, filter }}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={trimBefore}
          volume={volume}
          muted={settings.muted}
          pauseWhenBuffering
          style={{ width: '100%', height: '100%', objectFit: 'fill' }}
        />
      </div>
    </AbsoluteFill>
  )
}
