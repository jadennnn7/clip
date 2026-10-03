import type React from 'react'
import { CAPTION_PRESETS } from '../../../remotion/captions/presets'
import type { CaptionStyle } from '@/types/database'
import { cn } from '@/lib/utils'

/**
 * Was ein fertiger Short im Bild trägt — für die Beispiele auf der Landing
 * Page nachgebaut aus denselben Werten, mit denen der Renderer arbeitet.
 *
 * Alle Längen sind `cqw` des Bildes: Die Presets sind für 1080 px
 * Kompositionsbreite gedacht, `px(84)` ist also auf jeder Kartengröße genau
 * so groß wie im gerenderten Clip. Der Vorfahr braucht dafür `@container`.
 */
const COMPOSITION_WIDTH = 1080

const px = (value: number) => `${+((value / COMPOSITION_WIDTH) * 100).toFixed(3)}cqw`

/**
 * Das gerade gesprochene Wort wandert durch die Zeile. Die Verzögerungen sind
 * negativ, damit jede Zeile schon im ersten Frame im Takt ist; die Keyframes
 * `spoken-2` bis `spoken-4` stehen in `globals.css`.
 */
export function spokenWord(index: number, count: number, beat: number): React.CSSProperties {
  return {
    animation: `spoken-${count} ${+(beat * count).toFixed(2)}s linear infinite`,
    animationDelay: `${+((index - count) * beat).toFixed(2)}s`,
  }
}

/** Eine Untertitelzeile im Stil einer Vorlage, das aktive Wort läuft mit. */
export function CaptionLine({
  preset,
  words,
  beat = 0.6,
}: {
  preset: CaptionStyle['preset']
  words: string[]
  /** Sekunden pro Wort. Karten mit verschiedenem Takt blinken nicht im Gleichschritt. */
  beat?: number
}) {
  const style = CAPTION_PRESETS[preset]

  return (
    <div
      className="absolute inset-x-[7%] flex -translate-y-1/2 justify-center"
      style={{ top: `${style.positionY}%` }}
    >
      <p
        className={cn(
          'inline-flex flex-wrap justify-center gap-x-[0.34em] text-center leading-[1.1]',
          // Sonst erbt die Zeile das Laufweiten-Tuning der Seite.
          'tracking-normal',
        )}
        style={{
          fontSize: px(style.fontSize),
          fontWeight: style.fontWeight ?? 900,
          // Playfair lädt die Landing Page nicht — eine Serife muss es trotzdem sein.
          fontFamily: preset === 'elegant' ? 'Georgia, "Times New Roman", serif' : undefined,
          textTransform: style.uppercase ? 'uppercase' : undefined,
          WebkitTextStroke: style.strokeWidth
            ? `${px(style.strokeWidth)} ${style.strokeColor}`
            : undefined,
          paintOrder: 'stroke fill',
          textShadow: style.shadow
            ? `0 ${px(4)} ${px(18)} rgb(0 0 0 / ${style.shadow})`
            : undefined,
          background: style.background
            ? `rgb(0 0 0 / ${style.backgroundOpacity ?? 1})`
            : undefined,
          padding: style.background ? `${px(8)} ${px(22)}` : undefined,
          borderRadius: style.background ? px(14) : undefined,
        }}
      >
        {words.map((word, index) => (
          <span
            key={`${word}-${index}`}
            className="spoken"
            style={
              {
                '--base': style.color,
                '--hot': style.highlightColor,
                ...spokenWord(index, words.length, beat),
              } as React.CSSProperties
            }
          >
            {word}
          </span>
        ))}
      </p>
    </div>
  )
}

/**
 * Der Hook-Titel im Look „Sticker" (`lib/hook-title.ts`): jede Zeile auf
 * ihrem eigenen weißen Streifen, so wie TikTok selbst Text setzt.
 */
export function HookSticker({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="absolute inset-x-[10%] -translate-y-1/2 text-center tracking-[-0.01em] text-balance"
      style={{ top: '17%', fontSize: px(56), fontWeight: 800, lineHeight: 1.36 }}
    >
      <span
        className="bg-white text-[#0A0A0A] [-webkit-box-decoration-break:clone] [box-decoration-break:clone]"
        style={{ padding: `${px(3)} ${px(22)}`, borderRadius: px(16) }}
      >
        {children}
      </span>
    </p>
  )
}
