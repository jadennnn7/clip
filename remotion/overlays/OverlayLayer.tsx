import React, { useMemo } from 'react'
import { AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import type {
  EmojiOverlay,
  Overlay,
  OverlayAnimation,
  ProgressOverlay,
  ShapeOverlay,
  TextOverlay,
} from '@/types/database'
import { EMOJI_FONT_STACK, containsEmoji, ensureEmojiFont, ensureFont, fontStack, resolveWeight } from '../fonts'
import { withAlpha } from './defaults'

/**
 * Alles, was über dem Bild liegt: Texte, Formen, Emojis, Fortschrittsbalken.
 *
 * Jedes Overlay läuft in einer eigenen `<Sequence>` — außerhalb seines
 * Zeitraums existiert es nicht, und seine Animation rechnet mit Frames ab
 * dem eigenen Auftritt. Höhere Spuren werden später gezeichnet und liegen
 * damit oben, wie in jedem Schnittprogramm.
 *
 * `data-overlay-id` markiert die Inhaltsbox ohne Transformationen. Der
 * Editor misst daran den Auswahlrahmen, das Render ignoriert es.
 */
export const OverlayLayer: React.FC<{ overlays: Overlay[] }> = ({ overlays }) => {
  const { fps } = useVideoConfig()
  const ordered = useMemo(
    () => overlays.filter((overlay) => !overlay.hidden).slice().sort((a, b) => a.track - b.track || a.start - b.start),
    [overlays],
  )

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {ordered.map((overlay) => {
        const from = Math.round(overlay.start * fps)
        const durationInFrames = Math.round(overlay.end * fps) - from
        if (durationInFrames < 1) return null
        return (
          <Sequence key={overlay.id} from={from} durationInFrames={durationInFrames} layout="none" name={overlay.name ?? overlay.kind}>
            <OverlayItem overlay={overlay} durationInFrames={durationInFrames} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}

// --- Animation --------------------------------------------------------------

interface Motion {
  opacity: number
  x: number
  y: number
  scale: number
  blur: number
}

const STILL: Motion = { opacity: 1, x: 0, y: 0, scale: 1, blur: 0 }

const IN_SECONDS = 0.45
const OUT_SECONDS = 0.35

/**
 * Zustand einer Ein- oder Ausblendung. `progress` läuft von 0 (unsichtbar)
 * nach 1 (in Ruhe) — die Ausblendung ist dieselbe Bewegung rückwärts.
 */
function motionFor(animation: OverlayAnimation, progress: number, width: number, popSpring: number): Motion {
  const p = Math.min(1, Math.max(0, progress))
  const travel = width * 0.09
  switch (animation) {
    case 'fade':
    case 'typewriter':
      return { ...STILL, opacity: p }
    case 'pop':
      return { ...STILL, opacity: Math.min(1, p * 2.5), scale: 0.35 + 0.65 * popSpring }
    case 'zoom':
      return { ...STILL, opacity: p, scale: 1.35 - 0.35 * p }
    case 'blur':
      return { ...STILL, opacity: p, blur: (1 - p) * 26, scale: 1.04 - 0.04 * p }
    case 'slide-up':
      return { ...STILL, opacity: p, y: (1 - p) * travel }
    case 'slide-down':
      return { ...STILL, opacity: p, y: -(1 - p) * travel }
    case 'slide-left':
      return { ...STILL, opacity: p, x: (1 - p) * travel * 1.4 }
    case 'slide-right':
      return { ...STILL, opacity: p, x: -(1 - p) * travel * 1.4 }
    default:
      return STILL
  }
}

function combine(a: Motion, b: Motion): Motion {
  return { opacity: a.opacity * b.opacity, x: a.x + b.x, y: a.y + b.y, scale: a.scale * b.scale, blur: a.blur + b.blur }
}

function typewriterFrames(text: string, fps: number, available: number): number {
  return Math.min(available, Math.max(Math.round(0.3 * fps), Math.round(Math.min(1.6, text.length * 0.04) * fps)))
}

function useOverlayMotion(overlay: Overlay, durationInFrames: number) {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()

  // Kurze Overlays teilen sich die Zeit: Ein- und Ausblendung zusammen höchstens die ganze Dauer.
  const half = Math.floor(durationInFrames / 2)
  const typewriter = overlay.kind === 'text' && overlay.animationIn === 'typewriter'
  const inFrames = overlay.animationIn === 'none'
    ? 0
    : typewriter
      ? typewriterFrames((overlay as TextOverlay).text, fps, half)
      : Math.min(half, Math.round(IN_SECONDS * fps))
  const outFrames = overlay.animationOut === 'none' ? 0 : Math.min(half, Math.round(OUT_SECONDS * fps))

  const inProgress = inFrames > 0 ? interpolate(frame, [0, inFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }) : 1
  const outProgress = outFrames > 0 ? interpolate(frame, [durationInFrames - outFrames, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) }) : 1

  // Pop federt beim Auftritt über das Ziel hinaus; beim Abgang nicht — ein
  // Element, das beim Verschwinden noch einmal wächst, wirkt wie ein Fehler.
  const popIn = overlay.animationIn === 'pop'
    ? spring({ frame, fps, config: { damping: 11, stiffness: 190, mass: 0.6 }, durationInFrames: Math.max(1, inFrames) })
    : 1

  const motion = combine(
    inFrames > 0 ? motionFor(overlay.animationIn, inProgress, width, popIn) : STILL,
    outFrames > 0 ? motionFor(overlay.animationOut, outProgress, width, outProgress) : STILL,
  )

  const typed = typewriter ? Math.min(1, frame / Math.max(1, inFrames)) : 1
  const progress = durationInFrames > 1 ? Math.min(1, Math.max(0, frame / (durationInFrames - 1))) : 1
  return { motion, typed, progress }
}

// --- Elemente ---------------------------------------------------------------

const OverlayItem: React.FC<{ overlay: Overlay; durationInFrames: number }> = ({ overlay, durationInFrames }) => {
  const { width, height } = useVideoConfig()
  const { motion, typed, progress } = useOverlayMotion(overlay, durationInFrames)

  if (overlay.kind === 'progress') {
    return <ProgressBar overlay={overlay} progress={progress} opacity={overlay.opacity * motion.opacity} />
  }

  return (
    <div style={{ position: 'absolute', left: overlay.x * width, top: overlay.y * height, width: 0, height: 0 }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `translate(-50%, -50%) translate(${motion.x}px, ${motion.y}px) rotate(${overlay.rotation}deg) scale(${overlay.scale * motion.scale})`,
          transformOrigin: 'center',
          opacity: overlay.opacity * motion.opacity,
          filter: motion.blur > 0.1 ? `blur(${motion.blur}px)` : undefined,
        }}
      >
        {overlay.kind === 'text' ? <TextBox overlay={overlay} typed={typed} /> : null}
        {overlay.kind === 'shape' ? <ShapeBox overlay={overlay} /> : null}
        {overlay.kind === 'emoji' ? <EmojiBox overlay={overlay} /> : null}
      </div>
    </div>
  )
}

const TextBox: React.FC<{ overlay: TextOverlay; typed: number }> = ({ overlay, typed }) => {
  const { width } = useVideoConfig()
  const weight = resolveWeight(overlay.font, overlay.fontWeight)
  ensureFont(overlay.font, weight, overlay.italic)
  if (containsEmoji(overlay.text)) ensureEmojiFont()

  // Die Schreibmaschine blendet Zeichen ein, statt sie anzuhängen: Der Rest
  // steht unsichtbar schon da, damit der Block nicht mit jedem Buchstaben
  // neu umbricht und hin- und herspringt.
  const characters = Array.from(overlay.text)
  const visible = typed >= 1 ? characters.length : Math.floor(characters.length * typed)
  const shadow = overlay.shadow > 0
    ? `0 ${Math.round(4 + overlay.shadow * 6)}px ${Math.round(12 + overlay.shadow * 36)}px rgba(0, 0, 0, ${0.3 + overlay.shadow * 0.5})`
    : undefined

  const content = visible >= characters.length ? (
    overlay.text || ' '
  ) : (
    <>
      {characters.slice(0, visible).join('')}
      <span style={{ opacity: 0 }}>{characters.slice(visible).join('')}</span>
    </>
  )

  // Box je Zeile, wie der Text auf TikTok: Der Hintergrund liegt auf dem
  // Text selbst, `clone` gibt jeder Zeile eigene Rundungen und eigenen
  // Innenabstand. Die Zeilenhöhe lässt die Streifen leicht überlappen, so
  // greifen sie ineinander statt als lose Balken übereinander zu liegen.
  if (overlay.lineBox && overlay.background) {
    const vertical = overlay.padding * 0.3
    return (
      <div
        data-overlay-id={overlay.id}
        style={{
          width: 'max-content',
          maxWidth: overlay.maxWidth * width,
          fontFamily: fontStack(overlay.font),
          fontSize: overlay.fontSize,
          fontWeight: weight,
          fontStyle: overlay.italic ? 'italic' : 'normal',
          color: overlay.color,
          textAlign: overlay.align,
          textTransform: overlay.uppercase ? 'uppercase' : 'none',
          letterSpacing: `${overlay.letterSpacing}em`,
          lineHeight: overlay.lineHeight,
          // Wie `pre-line` statt `pre-wrap`: Ein Leerzeichen am Umbruch läge
          // sonst mit im Streifen und machte ihn rechts breiter als links.
          // Als Einzelwerte, weil `white-space` und `text-wrap` sich als
          // Kurzschreibweisen überschneiden.
          whiteSpaceCollapse: 'preserve-breaks',
          textWrap: 'balance',
          overflowWrap: 'break-word',
          // Der Auswahlrahmen im Editor misst diese Box — sie muss die
          // Streifen samt ihrem Innenabstand umfassen.
          padding: `${vertical}px 0`,
        }}
      >
        <span
          style={{
            background: withAlpha(overlay.background, overlay.backgroundOpacity),
            padding: `${vertical}px ${overlay.padding}px`,
            borderRadius: overlay.radius,
            boxDecorationBreak: 'clone',
            WebkitBoxDecorationBreak: 'clone',
            boxShadow: shadow ? `0 ${Math.round(4 + overlay.shadow * 8)}px ${Math.round(16 + overlay.shadow * 36)}px rgba(0, 0, 0, ${0.2 + overlay.shadow * 0.35})` : undefined,
            WebkitTextStroke: overlay.strokeWidth > 0 ? `${overlay.strokeWidth}px ${overlay.strokeColor}` : undefined,
            paintOrder: 'stroke fill',
          }}
        >
          {content}
        </span>
      </div>
    )
  }

  return (
    <div
      data-overlay-id={overlay.id}
      style={{
        width: 'max-content',
        maxWidth: overlay.maxWidth * width,
        fontFamily: fontStack(overlay.font),
        fontSize: overlay.fontSize,
        fontWeight: weight,
        fontStyle: overlay.italic ? 'italic' : 'normal',
        color: overlay.color,
        textAlign: overlay.align,
        textTransform: overlay.uppercase ? 'uppercase' : 'none',
        letterSpacing: `${overlay.letterSpacing}em`,
        lineHeight: overlay.lineHeight,
        // Wie `pre-wrap`, als Einzelwerte neben `text-wrap`. Eine
        // Schlagzeile bricht in gleich lange Zeilen um; andere Texte behalten
        // ihren Umbruch, damit bestehende Layouts nicht springen.
        whiteSpaceCollapse: 'preserve',
        textWrap: overlay.role === 'hook' ? 'balance' : 'wrap',
        overflowWrap: 'break-word',
        WebkitTextStroke: overlay.strokeWidth > 0 ? `${overlay.strokeWidth}px ${overlay.strokeColor}` : undefined,
        paintOrder: 'stroke fill',
        textShadow: shadow,
        background: overlay.background ? withAlpha(overlay.background, overlay.backgroundOpacity) : undefined,
        padding: overlay.padding > 0 ? `${overlay.padding * 0.55}px ${overlay.padding}px` : undefined,
        borderRadius: overlay.radius,
      }}
    >
      {content}
    </div>
  )
}

const ShapeBox: React.FC<{ overlay: ShapeOverlay }> = ({ overlay }) => {
  const fill = overlay.fill ? withAlpha(overlay.fill, overlay.fillOpacity) : 'transparent'

  if (overlay.shape === 'arrow') {
    const { width, height } = overlay
    const shaft = Math.max(4, height * 0.3)
    const head = Math.min(height * 0.95, width * 0.5)
    const top = (height - shaft) / 2
    const path = `M0 ${top} H${width - head} V0 L${width} ${height / 2} L${width - head} ${height} V${top + shaft} H0 Z`
    return (
      <svg data-overlay-id={overlay.id} width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
        <path
          d={path}
          fill={fill}
          stroke={overlay.strokeWidth > 0 ? overlay.stroke : 'none'}
          strokeWidth={overlay.strokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  const line = overlay.shape === 'line'
  return (
    <div
      data-overlay-id={overlay.id}
      style={{
        width: overlay.width,
        height: overlay.height,
        boxSizing: 'border-box',
        background: fill,
        border: !line && overlay.strokeWidth > 0 ? `${overlay.strokeWidth}px solid ${overlay.stroke}` : undefined,
        borderRadius: overlay.shape === 'ellipse' ? '50%' : line ? Math.min(overlay.radius, overlay.height / 2) : overlay.radius,
      }}
    />
  )
}

const EmojiBox: React.FC<{ overlay: EmojiOverlay }> = ({ overlay }) => {
  ensureEmojiFont()
  return (
    <div
      data-overlay-id={overlay.id}
      style={{ width: 'max-content', fontFamily: EMOJI_FONT_STACK, fontSize: overlay.size, lineHeight: 1.1 }}
    >
      {overlay.emoji}
    </div>
  )
}

const ProgressBar: React.FC<{ overlay: ProgressOverlay; progress: number; opacity: number }> = ({ overlay, progress, opacity }) => (
  <div
    data-overlay-id={overlay.id}
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      [overlay.position]: 0,
      height: overlay.thickness,
      background: withAlpha(overlay.trackColor, overlay.trackOpacity),
      opacity,
    }}
  >
    <div style={{ height: '100%', width: `${progress * 100}%`, background: overlay.color }} />
  </div>
)
