'use client'

import Link from 'next/link'
import { ClipThumbnail } from '@/components/clips/ClipThumbnail'
import { outputFormatCssAspect } from '@/lib/output-format'
import { cn } from '@/lib/utils'
import type { Clip } from '@/types/database'
import type { OutputFormat } from '@/types/workspace'

function scoreTone(score: number): string {
  if (score >= 90) return 'text-emerald-500 dark:text-[#22c55e]'
  if (score >= 70) return 'text-amber-600 dark:text-amber-400'
  return 'text-foreground/55 dark:text-zinc-300'
}

/**
 * Clip in der Übersicht — schlank wie in der Clip-Bibliothek, ohne Glas-Kachel.
 *
 * Hover: anheben, Zoom und Lichtstreif — wie bei den Projektkarten. Die
 * ganze Karte ist der Link, ein eigener „Öffnen"-Knopf darauf wäre doppelt.
 */
export function RecentClipCard({
  clip,
  previewSrc,
  sourceAspect,
  href,
  className,
  outputFormat = '9:16',
}: {
  clip: Clip
  previewSrc?: string | null
  sourceAspect?: number
  href: string
  className?: string
  outputFormat?: OutputFormat
}) {
  const duration = Math.round(clip.end_seconds - clip.start_seconds)

  return (
    <Link
      href={href}
      className={cn(
        'group block w-[156px] shrink-0 snap-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl',
        className,
      )}
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-xl',
          'ring-1 ring-black/[0.06] dark:ring-white/10',
          'transition-[transform,box-shadow,ring-color] duration-500 ease-[var(--ease-spring)]',
          'group-hover:-translate-y-2 group-hover:scale-[1.02]',
          'group-hover:shadow-[0_28px_56px_-18px_rgb(0_0_0/0.55)] dark:group-hover:shadow-[0_28px_60px_-16px_rgb(0_0_0/0.85)]',
          'group-hover:ring-black/15 dark:group-hover:ring-white/25',
        )}
        style={{ aspectRatio: outputFormatCssAspect(outputFormat) }}
      >
        <div className="absolute inset-0 duration-700 ease-[var(--ease-out-quint)] will-change-transform transition-transform group-hover:scale-[1.08]">
          <ClipThumbnail
            clip={clip}
            previewSrc={previewSrc}
            sourceAspect={sourceAspect}
            outputFormat={outputFormat}
            captionSize={13}
            showScore={false}
            showCaption={false}
            sizes="156px"
          />
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent opacity-0 transition-opacity duration-500 ease-[var(--ease-out-quint)] group-hover:opacity-100"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-y-8 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/18 to-transparent opacity-0 transition-[transform,opacity] duration-700 ease-[var(--ease-out-quint)] group-hover:translate-x-[280%] group-hover:opacity-100"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
      </div>

      <div className="mt-2.5 px-0.5">
        <p className="line-clamp-2 text-sm leading-snug font-medium text-foreground/90 transition-colors duration-300 group-hover:text-foreground">
          {clip.title}
        </p>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span
            className={cn('font-display text-xl font-semibold tracking-tight tabular-nums', scoreTone(clip.virality_score))}
            title="Viralitäts-Score"
          >
            {clip.virality_score}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{duration}s</span>
        </div>
      </div>
    </Link>
  )
}
