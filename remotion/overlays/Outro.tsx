import React from 'react'
import { AbsoluteFill, Easing, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { WATERMARK_LOGO } from './watermark-logo'

/** Weich auslaufend, ohne Nachfedern — die Kurve ruhiger Marken-Intros. */
const EASE = Easing.bezier(0.16, 1, 0.3, 1)

/**
 * Der Abspann im Gratis-Tarif: „Made with" über Zeichen und Wortmarke auf
 * dunklem Grund. Läuft als eigene `<Sequence>` hinter dem Clip
 * (`OUTRO_SECONDS` in `timing.ts`), der Inhalt bleibt also ganz sichtbar.
 *
 * Bewusst zurückhaltend: Das Zeichen wird aus der Unschärfe scharf, die
 * Wortmarke folgt einen Hauch später, die Zeile darüber zuletzt. Nichts
 * dreht oder federt. Am Ende blendet alles zu Schwarz ab, damit der Clip
 * sauber endet statt abzureißen.
 */
export const Outro: React.FC = () => {
  const frame = useCurrentFrame()
  const { width, height, durationInFrames } = useVideoConfig()
  const unit = Math.min(width, height) / 1080

  const reveal = (from: number, to: number) =>
    interpolate(frame, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE })
  const mark = reveal(0, 18)
  const word = reveal(5, 22)
  const label = reveal(12, 28)
  const out = interpolate(frame, [durationInFrames - 8, durationInFrames - 1], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  })

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        // Fast schwarz, zur Mitte hin ein Hauch Logo-Blau — Tiefe statt Fläche.
        background: 'radial-gradient(ellipse 70% 45% at 50% 50%, #0B1624 0%, #05080D 55%, #000 100%)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 * unit, opacity: out }}>
        <span
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontWeight: 500,
            fontSize: 34 * unit,
            letterSpacing: '0.3em',
            // Gleicht den Abstand nach dem letzten Buchstaben aus, sonst sitzt die Zeile links.
            paddingLeft: '0.3em',
            textTransform: 'uppercase',
            color: 'rgba(255, 255, 255, 0.6)',
            opacity: label,
            transform: `translateY(${(1 - label) * 10 * unit}px)`,
          }}
        >
          Made with
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 28 * unit }}>
          <Img
            src={WATERMARK_LOGO}
            style={{
              height: 132 * unit,
              width: 'auto',
              opacity: mark,
              transform: `scale(${0.92 + 0.08 * mark})`,
              filter: `blur(${(1 - mark) * 12 * unit}px)`,
            }}
          />
          <span
            style={{
              fontFamily: '"Inter", system-ui, sans-serif',
              fontWeight: 700,
              fontSize: 124 * unit,
              letterSpacing: '-0.045em',
              lineHeight: 1,
              color: '#FFFFFF',
              opacity: word,
              transform: `translateX(${(1 - word) * -14 * unit}px)`,
              filter: `blur(${(1 - word) * 8 * unit}px)`,
            }}
          >
            Clyp
          </span>
        </div>
      </div>
    </AbsoluteFill>
  )
}
