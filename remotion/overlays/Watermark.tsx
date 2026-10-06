import React from 'react'
import { AbsoluteFill, Img, useVideoConfig } from 'remotion'
import { WATERMARK_LOGO } from './watermark-logo'

/**
 * Wasserzeichen im Gratis-Tarif: Ocuris-Zeichen und „Made with Ocuris" oben
 * links. Am Ende folgt der Abspann (`Outro.tsx`).
 *
 * Oben links, knapp unter der Kopfzeile der Apps (die strengste endet bei
 * 9 % der Höhe): Dort liegen weder die Aktionsleiste rechts (ab 43 %) noch
 * Name und Beschreibung unten, und Hook-Titel und Untertitel stehen mittig.
 * Eine dunkle, leicht durchscheinende Pille mit Haarlinie hält es auf jedem
 * Material lesbar, ohne wie ein Aufkleber zu wirken.
 */
export const Watermark: React.FC = () => {
  const { width, height } = useVideoConfig()
  // Gleich groß zur kürzeren Seite — im 16:9-Bild nicht doppelt so breit.
  const unit = Math.min(width, height) / 1080

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top: height * 0.095,
          left: 36 * unit,
          display: 'flex',
          alignItems: 'center',
          gap: 12 * unit,
          padding: `${11 * unit}px ${24 * unit}px ${11 * unit}px ${14 * unit}px`,
          borderRadius: 999,
          background: 'rgba(8, 10, 14, 0.58)',
          border: `${1.5 * unit}px solid rgba(255, 255, 255, 0.14)`,
        }}
      >
        <Img src={WATERMARK_LOGO} style={{ height: 40 * unit, width: 'auto' }} />
        <span
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 9 * unit,
            fontFamily: '"Inter", system-ui, sans-serif',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontWeight: 500, fontSize: 32 * unit, letterSpacing: '-0.005em', color: 'rgba(255, 255, 255, 0.78)' }}>
            Made with
          </span>
          <span style={{ fontWeight: 700, fontSize: 40 * unit, letterSpacing: '-0.03em', color: '#FFFFFF' }}>Ocuris</span>
        </span>
      </div>
    </AbsoluteFill>
  )
}
