import React, { useMemo } from 'react'
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion'
import type { CaptionStyle, TranscriptWord } from '@/types/database'
import type { CaptionChunk } from '@/types/editor'

/**
 * Gruppiert Wörter zu Untertitel-Zeilen.
 *
 * Das Ende einer Zeile wird bis zum Beginn der nächsten gestreckt. Ohne das
 * würde der Untertitel in jeder Sprechpause kurz verschwinden und wieder
 * auftauchen — ein sichtbares Flackern, das den Clip unruhig macht.
 */
export function chunkWords(words: TranscriptWord[], wordsPerLine: number): CaptionChunk[] {
  const size = Math.max(1, wordsPerLine)
  const chunks: CaptionChunk[] = []

  for (let i = 0; i < words.length; i += size) {
    const group = words.slice(i, i + size)
    if (group.length === 0) continue
    chunks.push({
      words: group,
      start: group[0].start,
      end: group[group.length - 1].end,
    })
  }

  for (let i = 0; i < chunks.length - 1; i++) {
    chunks[i].end = chunks[i + 1].start
  }

  return chunks
}

export const CaptionLayer: React.FC<{
  words: TranscriptWord[]
  style: CaptionStyle
}> = ({ words, style }) => {
  const frame = useCurrentFrame()
  const { fps, height } = useVideoConfig()
  const time = frame / fps

  const chunks = useMemo(() => chunkWords(words, style.wordsPerLine), [words, style.wordsPerLine])

  const active = chunks.find((chunk) => time >= chunk.start && time < chunk.end)
  if (!active) return null

  const enterFrame = active.start * fps

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
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: `${style.fontSize * 0.22}px`,
        padding: '0 72px',
        pointerEvents: 'none',
      }}
    >
      {active.words.map((word, index) => (
        <CaptionWord
          key={`${word.start}-${index}`}
          word={word}
          style={style}
          time={time}
          enterFrame={enterFrame}
          index={index}
        />
      ))}
    </div>
  )
}

const CaptionWord: React.FC<{
  word: TranscriptWord
  style: CaptionStyle
  time: number
  enterFrame: number
  index: number
}> = ({ word, style, time, enterFrame, index }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const isActive = time >= word.start && time < word.end
  const framesSinceEnter = frame - enterFrame - index * 1.5

  // Eintritts-Animation der Zeile.
  const enter = spring({
    frame: framesSinceEnter,
    fps,
    config: { damping: 200, stiffness: 180, mass: 0.5 },
    durationInFrames: 12,
  })

  // Zusätzlicher Puls auf dem gerade gesprochenen Wort — das ist der Effekt,
  // der den "Hormozi"-Look ausmacht.
  const pop = isActive
    ? spring({
        frame: frame - word.start * fps,
        fps,
        config: { damping: 12, stiffness: 340, mass: 0.35 },
        durationInFrames: 10,
      })
    : 0

  let transform = ''
  let opacity = 1

  switch (style.animation) {
    case 'pop':
      transform = `scale(${enter * (1 + pop * 0.16)})`
      opacity = enter
      break
    case 'fade':
      opacity = enter
      break
    case 'slide':
      transform = `translateY(${interpolate(enter, [0, 1], [40, 0])}px)`
      opacity = enter
      break
    case 'none':
      break
  }

  return (
    <span
      style={{
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: 900,
        lineHeight: 1.12,
        letterSpacing: '-0.01em',
        color: isActive ? style.highlightColor : style.color,
        // `paintOrder: stroke` zeichnet die Kontur HINTER die Füllung. Ohne das
        // frisst eine 14px-Kontur die Buchstabenform von innen auf.
        WebkitTextStroke: style.strokeWidth > 0 ? `${style.strokeWidth}px ${style.strokeColor}` : undefined,
        paintOrder: 'stroke fill',
        textTransform: style.uppercase ? 'uppercase' : 'none',
        transform,
        opacity,
        display: 'inline-block',
        whiteSpace: 'pre',
      }}
    >
      {word.word}
    </span>
  )
}
