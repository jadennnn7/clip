import React, { useMemo } from 'react'
import { useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from 'remotion'
import type { CaptionStyle, TranscriptWord } from '@/types/database'
import { ensureFont, fontKeyFromCss, heaviestWeight, resolveWeight } from '../fonts'
import { withAlpha } from '../overlays/defaults'
import { CAPTION_SIDE_PADDING, captionText, chunkWords } from './chunk'

export { chunkWords } from './chunk'

/** Schriftstärke der Untertitel: gewählt oder die kräftigste, die es gibt. */
export function captionWeight(style: CaptionStyle): number {
  const key = fontKeyFromCss(style.fontFamily)
  if (!key) return style.fontWeight ?? 900
  return style.fontWeight ? resolveWeight(key, style.fontWeight) : heaviestWeight(key)
}

/**
 * Die Untertitel im Bild.
 *
 * Animiert wird der ganze Untertitel auf einmal, nicht jedes Wort mit
 * Versatz: Gestaffelt wuchsen die Wörter einzeln aus dem Nichts, und in
 * jedem Standbild standen sie in drei verschiedenen Größen da. So kommt der
 * Untertitel als Einheit — wie auf TikTok und Reels —, und nur das gerade
 * gesprochene Wort bekommt Farbe und einen kleinen Puls.
 */
export const CaptionLayer: React.FC<{
  words: TranscriptWord[]
  style: CaptionStyle
}> = ({ words, style }) => {
  const frame = useCurrentFrame()
  const { fps, height } = useVideoConfig()
  const time = frame / fps

  const chunks = useMemo(() => chunkWords(words, style), [words, style])

  const active = chunks.find((chunk) => time >= chunk.start && time < chunk.end)
  const fontKey = fontKeyFromCss(style.fontFamily)
  const weight = captionWeight(style)
  if (fontKey) ensureFont(fontKey, weight)
  if (!active) return null

  const since = frame - active.start * fps
  const boxed = Boolean(style.background) && (style.backgroundOpacity ?? 1) > 0
  const highlight = style.highlightColor.toLowerCase() !== style.color.toLowerCase()

  // Schon im ersten Frame sichtbar: Folgt ein Untertitel direkt auf den
  // vorigen, wäre ein unsichtbarer Startframe ein Flackern bei jedem Wechsel.
  let opacity = 1
  let transform: string | undefined
  switch (style.animation) {
    case 'pop': {
      const grow = spring({ frame: since, fps, config: { damping: 14, stiffness: 260, mass: 0.5 }, durationInFrames: 9 })
      transform = `scale(${0.86 + 0.14 * grow})`
      break
    }
    case 'fade':
      opacity = interpolate(since, [0, 4], [0.35, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
      break
    case 'slide': {
      const progress = interpolate(since, [0, 6], [0.3, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
      opacity = progress
      transform = `translateY(${(1 - progress) * style.fontSize * 0.4}px)`
      break
    }
    case 'none':
      break
  }

  const shadow = style.shadow
    ? `0 ${Math.round(3 + style.shadow * 6)}px ${Math.round(10 + style.shadow * 30)}px rgba(0, 0, 0, ${0.3 + style.shadow * 0.5})`
    : undefined

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        // positionY ist der vertikale Mittelpunkt in Prozent der Höhe.
        top: (style.positionY / 100) * height,
        transform: 'translateY(-50%)',
        display: 'flex',
        justifyContent: 'center',
        padding: `0 ${CAPTION_SIDE_PADDING}px`,
        pointerEvents: 'none',
      }}
    >
      <div
        // Der Editor erkennt die Untertitel daran im Bild — zum Auswählen
        // und zum Verschieben per Maus. Im Render ohne Wirkung.
        data-caption-layer=""
        style={{
          maxWidth: '100%',
          textAlign: 'center',
          // Zwei gleich lange Zeilen statt einer vollen und einem Rest.
          textWrap: 'balance',
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: weight,
          lineHeight: boxed ? 1.2 : 1.14,
          letterSpacing: '-0.01em',
          // Die Kontur ragt zur Hälfte aus den Buchstaben, das hervorgehobene
          // Wort wächst um 8 % — beides frisst sonst das Leerzeichen auf.
          wordSpacing: style.strokeWidth * 0.6 + (highlight && style.animation === 'pop' ? style.fontSize * 0.07 : 0),
          textTransform: style.uppercase ? 'uppercase' : 'none',
          color: style.color,
          background: boxed ? withAlpha(style.background!, style.backgroundOpacity ?? 1) : undefined,
          padding: boxed ? `${style.fontSize * 0.14}px ${style.fontSize * 0.34}px` : undefined,
          borderRadius: boxed ? style.fontSize * 0.28 : undefined,
          transform,
          transformOrigin: 'center',
          opacity,
        }}
      >
        {active.words.map((word, index) => {
          const current = time >= word.start && time < word.end
          // Der Puls gehört zur Hervorhebung — ohne Farbwechsel wirkte er wie
          // ein Zittern. Er verändert das Layout nicht (`scale`), deshalb klein
          // genug, dass das Wort nicht in die Nachbarn ragt.
          const pulse = current && highlight && style.animation === 'pop'
            ? spring({ frame: frame - word.start * fps, fps, config: { damping: 12, stiffness: 320, mass: 0.35 }, durationInFrames: 8 })
            : 0
          return (
            <React.Fragment key={`${word.start}-${index}`}>
              {index > 0 ? ' ' : null}
              <span
                style={{
                  display: 'inline-block',
                  color: current && highlight ? style.highlightColor : undefined,
                  // `paintOrder: stroke` zeichnet die Kontur HINTER die Füllung.
                  // Ohne das frisst eine 14px-Kontur die Buchstabenform von innen auf.
                  WebkitTextStroke: style.strokeWidth > 0 ? `${style.strokeWidth}px ${style.strokeColor}` : undefined,
                  paintOrder: 'stroke fill',
                  textShadow: shadow,
                  transform: pulse ? `scale(${1 + pulse * 0.08})` : undefined,
                  whiteSpace: 'pre',
                }}
              >
                {captionText(word.word, style)}
              </span>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
