'use client'

import Link from 'next/link'
import { CalendarClock, Check, Download, Scissors } from 'lucide-react'
import { ClipThumbnail } from '@/components/clips/ClipThumbnail'
import { outputFormatCssAspect } from '@/lib/output-format'
import { cn } from '@/lib/utils'
import type { Clip } from '@/types/database'
import type { OutputFormat } from '@/types/workspace'
import type { PublishingJobSummary } from '@/types/publishing'
import { ClipPublishingStatus, type ClipPublishingEmptyState } from '@/components/publishing/ClipPublishingStatus'
import { EDITOR_ENABLED } from '@/lib/features'

const iconButton =
  'transition-ui flex size-8 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'

/**
 * Ein Clip auf der Seite seines Videos.
 *
 * Aufbau wie bei den großen Clip-Tools, weil Creator ihn von dort kennen: das
 * Hochformat-Vorschaubild, darunter groß der Score als erstes Sortierkriterium
 * des Auges, daneben die Aktionen, dann der Titel. Beim Überfahren spielt der
 * Clip selbst, ein Klick öffnet ihn auf der Bühne (`ClipSheet`).
 */
export function ClipCard({
  clip,
  favorite,
  selected,
  selecting,
  onFavorite,
  onSelect,
  onOpen,
  previewSrc,
  sourceAspect,
  outputFormat = '9:16',
  layout = 'grid',
  delay = 0,
  publishingJobs,
  publishingState,
  onPublishingChanged,
}: {
  clip: Clip
  favorite: boolean
  selected: boolean
  /** Auswahlmodus: Ein Klick auf das Bild wählt aus, statt den Editor zu öffnen. */
  selecting: boolean
  onFavorite: () => void
  onSelect: () => void
  /** Öffnet den Clip auf der Bühne. */
  onOpen: () => void
  previewSrc?: string | null
  sourceAspect?: number
  outputFormat?: OutputFormat
  layout?: 'grid' | 'list'
  delay?: number
  publishingJobs: PublishingJobSummary[]
  publishingState: ClipPublishingEmptyState
  onPublishingChanged?: () => void
}) {
  const editor = `/dashboard/projects/${clip.project_id}?clip=${clip.id}`
  const rendered = clip.render_status === 'ready' && clip.render_key

  return (
    <article
      className={cn(
        'rise-in group min-w-0',
        layout === 'list' && 'grid grid-cols-[7rem_minmax(0,1fr)] grid-rows-[auto_1fr] items-start gap-x-4 glass-tile rounded-2xl p-3 sm:grid-cols-[9rem_minmax(0,1fr)]',
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={cn(
          'transition-ui relative overflow-hidden rounded-xl ring-1 ring-black/[0.06] dark:ring-white/10',
          'group-hover:-translate-y-1 group-hover:shadow-[0_18px_40px_-14px_rgb(0_0_0/0.55)]',
          selected && 'ring-2 ring-foreground dark:ring-foreground',
          layout === 'list' && 'col-start-1 row-span-2 row-start-1 w-full',
        )}
        style={{ aspectRatio: outputFormatCssAspect(outputFormat) }}
      >
        {selecting ? (
          <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={`${clip.title} ${selected ? 'abwählen' : 'auswählen'}`} className="block size-full outline-none focus-visible:ring-3 focus-visible:ring-ring">
            <ClipThumbnail clip={clip} previewSrc={previewSrc} sourceAspect={sourceAspect} outputFormat={outputFormat} showScore={false} showDuration={false} captionSize={16} />
          </button>
        ) : (
          <button type="button" onClick={onOpen} aria-label={`Clip ansehen: ${clip.title}`} className="block size-full cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring">
            <ClipThumbnail clip={clip} previewSrc={previewSrc} sourceAspect={sourceAspect} outputFormat={outputFormat} showScore={false} showDuration={false} captionSize={16} />
          </button>
        )}
        <button
          type="button"
          aria-label={`${clip.title} ${selected ? 'abwählen' : 'auswählen'}`}
          aria-pressed={selected}
          onClick={onSelect}
          className={cn(
            'transition-ui absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-md border shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-white',
            selected ? 'border-primary bg-primary text-primary-foreground' : 'border-white/60 bg-black/30 text-transparent hover:bg-black/60',
            !selected && !selecting && 'pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100',
          )}
        >
          <Check className="size-4" />
        </button>
      </div>

      <div className={cn('flex items-center justify-between px-0.5', layout === 'grid' ? 'mt-2.5' : 'col-start-2 row-start-1')}>
        <span
          className={cn(
            'font-display text-2xl font-semibold tracking-tight tabular-nums',
            clip.virality_score >= 90 ? 'text-emerald-500 dark:text-[#22c55e]' : clip.virality_score >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground/70',
          )}
          title="Viralitäts-Score"
        >
          {clip.virality_score}
        </span>
        <div className="flex items-center gap-0.5">
          {/* Status und Freigabe stehen unten in der Karte; das Symbol führt
              zu den Kanal-Einstellungen, wo Freigabe-Queue und Auto-Publish
              gewählt werden. */}
          <Link
            href="/dashboard/connections"
            aria-label={`Veröffentlichungs-Einstellungen: ${clip.title}`}
            title="Freigabe-Queue oder Auto-Publish einstellen"
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
          >
            <CalendarClock className="size-3.5" />
          </Link>
          <a
            href={rendered ? clip.render_key! : '#'}
            download={rendered ? true : undefined}
            onClick={(e) => {
              if (!rendered) {
                e.preventDefault()
                onOpen()
              }
            }}
            aria-label={`HD herunterladen: ${clip.title}`}
            title="HD herunterladen"
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
          >
            <Download className="size-3.5" />
          </a>
          {EDITOR_ENABLED ? (
            <Link
              href={editor}
              aria-label={`Bearbeiten: ${clip.title}`}
              title="Clip bearbeiten"
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
            >
              <Scissors className="size-3.5" />
            </Link>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={selecting ? onSelect : onOpen}
        className={cn(
          'block w-full px-0.5 text-left text-[13px] leading-snug font-medium text-foreground/90 outline-none hover:text-foreground focus-visible:underline transition-colors',
          layout === 'grid' ? 'mt-1' : 'col-start-2 row-start-2 mt-2 self-start',
        )}
      >
        <span className="line-clamp-2">{clip.title}</span>
      </button>
      <div className={cn('mt-2.5 border-t border-border pt-2.5', layout === 'list' && 'col-start-2 row-start-3')}>
        <ClipPublishingStatus jobs={publishingJobs} emptyState={publishingState} compact onChanged={onPublishingChanged} />
      </div>
    </article>
  )
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const rest = (safe % 60).toString().padStart(2, '0')
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}
