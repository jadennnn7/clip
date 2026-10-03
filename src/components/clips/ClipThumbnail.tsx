'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ClipCover } from '@/components/clips/ClipCover'
import { cn } from '@/lib/utils'
import { formatTime } from '@/components/clips/ClipCard'
import { outputFormatAspect } from '@/lib/output-format'
import type { Clip } from '@/types/database'
import type { OutputFormat } from '@/types/workspace'

/**
 * Vorschau eines Clips aus dem echten Video.
 *
 * Das Standbild schneidet die Pipeline beim Erstellen im Ausgabeformat aus,
 * den die Kamerafahrt dort zeigt. Darüber liegt der Einstieg in genau dem
 * Untertitel-Stil des Clips, so sieht die Karte aus wie der fertige Short.
 * Beim Überfahren spielt der Clip selbst, stumm und in Schleife.
 *
 * Clips ohne Standbild (lokale Uploads, ältere Projekte) bekommen das
 * gezeichnete Cover.
 */
export function ClipThumbnail({
  clip,
  previewSrc,
  sourceAspect = 16 / 9,
  outputFormat = '9:16',
  captionSize = 18,
  showScore = true,
  showCaption = true,
  showDuration = true,
  sizes = '(min-width: 1280px) 20vw, (min-width: 640px) 33vw, 50vw',
}: {
  clip: Clip
  /** Video des Projekts; ohne Angabe gibt es keine Hover-Vorschau. */
  previewSrc?: string | null
  sourceAspect?: number
  outputFormat?: OutputFormat
  captionSize?: number
  showScore?: boolean
  /** Untertitel-Vorschau im Bild — in der Übersicht abschalten, dort wirkt sie zu laut. */
  showCaption?: boolean
  /** Dauer-Badge unten rechts — aus, wo der Player selbst eine Zeitleiste zeigt. */
  showDuration?: boolean
  sizes?: string
}) {
  const [failed, setFailed] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  if (!clip.thumbnail_url || failed) return <ClipCover clip={clip} captionSize={captionSize} bare={!showScore} showDuration={showDuration} />

  const duration = clip.end_seconds - clip.start_seconds
  return (
    <div
      className="relative size-full overflow-hidden bg-neutral-950 select-none"
      onPointerEnter={(event) => { if (previewSrc && event.pointerType === 'mouse') setPreviewing(true) }}
      onPointerLeave={() => setPreviewing(false)}
    >
      <Image
        src={clip.thumbnail_url}
        alt=""
        fill
        unoptimized
        sizes={sizes}
        className="object-cover"
        onError={() => setFailed(true)}
      />
      {previewing && previewSrc ? (
        <HoverPreview clip={clip} src={previewSrc} sourceAspect={sourceAspect} outputFormat={outputFormat} />
      ) : null}

      {showCaption ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <CaptionPreview clip={clip} size={captionSize} />
        </>
      ) : (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/50 to-transparent" />
      )}

      {showScore ? (
        <span className="glass-chip absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums">
          {clip.virality_score}
          <span className="text-[9px] font-normal text-white/60">Score</span>
        </span>
      ) : null}
      {showDuration ? (
        <span className="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[9px] text-zinc-300 tabular-nums z-10">
          00:00 {formatTime(duration)}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Die erste Untertitelzeile im Stil des Clips — Schrift, Farben, Kontur und
 * Position wie im Render, nur verkleinert. Das zweite Wort ist „gerade
 * gesprochen" hervorgehoben, wie im Player.
 */
function CaptionPreview({ clip, size }: { clip: Clip; size: number }) {
  const style = clip.caption_style
  const scale = size / style.fontSize
  const words = (clip.words.length > 0 ? clip.words.map((word) => word.word) : (clip.hook_text ?? clip.title).split(/\s+/))
    .filter(Boolean)
    .slice(0, Math.max(2, Math.min(style.wordsPerLine, 4)))

  return (
    <div
      className="pointer-events-none absolute inset-x-3 flex flex-wrap justify-center gap-x-[0.3em] text-center leading-[1.12]"
      style={{ bottom: `${Math.max(12, 100 - style.positionY)}%`, fontSize: size }}
    >
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          style={{
            fontFamily: style.fontFamily,
            fontWeight: 900,
            color: index === Math.min(1, words.length - 1) ? style.highlightColor : style.color,
            textTransform: style.uppercase ? 'uppercase' : 'none',
            WebkitTextStroke: style.strokeWidth > 0 ? `${Math.max(1, style.strokeWidth * scale)}px ${style.strokeColor}` : undefined,
            paintOrder: 'stroke fill',
          }}
        >
          {word}
        </span>
      ))}
    </div>
  )
}

/**
 * Spielt den Clip-Ausschnitt aus dem Proxy, auf das Ausgabeformat zugeschnitten.
 *
 * `object-position` in Prozent verschiebt nicht den Mittelpunkt, sondern den
 * überstehenden Rest: Bei einem breiten Bild in einer schmaleren Fläche ist nur ein
 * Anteil `visible` sichtbar, und 0 % bis 100 % verteilen `1 - visible`.
 */
function HoverPreview({
  clip,
  src,
  sourceAspect,
  outputFormat,
}: {
  clip: Clip
  src: string
  sourceAspect: number
  outputFormat: OutputFormat
}) {
  const [playing, setPlaying] = useState(false)
  const center = clip.crop_keyframes[0]?.x ?? 0.5
  const visible = Math.min(1, outputFormatAspect(outputFormat) / sourceAspect)
  const position = visible >= 1 ? 50 : Math.min(1, Math.max(0, (center - visible / 2) / (1 - visible))) * 100
  const loop = (video: HTMLVideoElement) => {
    if (video.currentTime < clip.end_seconds - 0.1) return
    video.currentTime = clip.start_seconds
    if (video.paused) void video.play().catch(() => {})
  }

  return (
    <video
      src={`${src}#t=${clip.start_seconds.toFixed(2)},${clip.end_seconds.toFixed(2)}`}
      muted
      playsInline
      autoPlay
      preload="auto"
      onPlaying={() => setPlaying(true)}
      onTimeUpdate={(event) => loop(event.currentTarget)}
      // Das Medienfragment `#t=…,end` hält den Browser am Ende an — dann von vorn.
      onPause={(event) => loop(event.currentTarget)}
      className={cn('transition-ui absolute inset-0 size-full object-cover duration-300', playing ? 'opacity-100' : 'opacity-0')}
      style={{ objectPosition: `${position}% 50%` }}
    />
  )
}
