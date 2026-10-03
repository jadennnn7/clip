'use client'

import Image from 'next/image'
import Link from 'next/link'
import { CircleAlert, FileVideo, MoreHorizontal, Pencil, RotateCw, Scissors, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CuttingChip, PipelineSteps, ViewfinderBand, sourceLine } from '@/components/clips/ProcessingClipCard'
import { ACTIVE_STATUSES, isLinkProject } from '@/lib/link-import'
import { cn } from '@/lib/utils'
import type { Clip, Project } from '@/types/database'

/**
 * Ein Video in der Bibliothek — die ungeschnittene Quelle, nicht ihre Clips.
 *
 * Kein Glas-Rahmen: Das Vorschaubild steht für sich (wie RecentClipCard),
 * Titel und Meta darunter. Hover hebt das Bild an, skaliert leicht und zeigt
 * eine Scheren-Affordance — premium, ohne Bubbly-Kachel.
 */
export function VideoCard({
  project,
  clips,
  delay = 0,
  onRename,
  onDelete,
  onProcess,
}: {
  project: Project
  clips: Clip[]
  delay?: number
  onRename: () => void
  onDelete: () => void
  /** Entwurf oder fehlgeschlagener Link: Verarbeitung (erneut) starten. */
  onProcess?: () => void
}) {
  const processing = isLinkProject(project) && ACTIVE_STATUSES.includes(project.status)
  const failed = project.status === 'error'
  const ranked = [...clips].sort((a, b) => b.virality_score - a.virality_score)
  const best = ranked[0]?.virality_score
  const portraitCover = project.thumbnail_url ? null : ranked.find((clip) => clip.thumbnail_url)?.thumbnail_url ?? null
  const cover = project.thumbnail_url ?? portraitCover

  const meta = processing
    ? `${sourceLine(project)} · wird geschnitten`
    : failed
      ? project.error_message ?? 'Verarbeitung fehlgeschlagen'
      : [
          sourceLine(project),
          new Date(project.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }),
          best ? `Bester Score ${best}` : clips.length === 0 ? 'Noch keine Clips' : null,
        ].filter(Boolean).join(' · ')

  const previewClips = ranked.filter((clip) => clip.thumbnail_url).slice(0, 3)

  return (
    <li
      className="rise-in group/card relative min-w-0"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={cn(
          'relative aspect-video overflow-hidden rounded-xl bg-neutral-950',
          'ring-1 ring-black/[0.06] dark:ring-white/10',
          'transition-[transform,box-shadow,ring-color] duration-500 ease-[var(--ease-spring)]',
          !processing && [
            'group-hover/card:-translate-y-2 group-hover/card:scale-[1.015]',
            'group-hover/card:shadow-[0_28px_56px_-18px_rgb(0_0_0/0.55)] dark:group-hover/card:shadow-[0_28px_60px_-16px_rgb(0_0_0/0.85)]',
            'group-hover/card:ring-black/15 dark:group-hover/card:ring-white/25',
          ],
        )}
      >
        {processing ? (
          <>
            <ViewfinderBand thumbnail={project.thumbnail_url} className="absolute inset-0 aspect-auto h-full rounded-none ring-0" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pt-12 pb-3">
              <PipelineSteps project={project} compact />
            </div>
            <CuttingChip compact className="absolute top-2.5 left-2.5" />
          </>
        ) : cover ? (
          <>
            {portraitCover ? (
              <Image src={portraitCover} alt="" fill unoptimized sizes="400px" className="scale-110 object-cover opacity-40 blur-xl" />
            ) : null}
            <Image
              src={cover}
              alt=""
              fill
              unoptimized
              sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
              className={cn(
                'duration-700 ease-[var(--ease-out-quint)] will-change-transform transition-transform group-hover/card:scale-[1.08]',
                portraitCover ? 'object-contain' : 'object-cover',
                failed && 'opacity-40 grayscale',
              )}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-neutral-800 to-neutral-950">
            <FileVideo className="size-8 text-white/25" />
          </div>
        )}

        {!processing ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/55 to-transparent" /> : null}

        {/* Hover: leicht abdunkeln + diagonales Licht, das über das Cover streicht. */}
        {!processing ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent opacity-0 transition-opacity duration-500 ease-[var(--ease-out-quint)] group-hover/card:opacity-100"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-y-8 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/18 to-transparent opacity-0 transition-[transform,opacity] duration-700 ease-[var(--ease-out-quint)] group-hover/card:translate-x-[280%] group-hover/card:opacity-100"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent opacity-0 transition-opacity duration-300 group-hover/card:opacity-100"
            />
          </>
        ) : null}

        {!processing && clips.length > 0 ? (
          <span className="absolute top-2.5 left-2.5 z-[1] flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm transition-transform duration-500 ease-[var(--ease-spring)] group-hover/card:-translate-y-0.5">
            <Scissors className="size-3" />
            {clips.length} {clips.length === 1 ? 'Clip' : 'Clips'}
          </span>
        ) : null}

        {!processing && !failed ? (
          <span
            aria-hidden
            className="liquid pointer-events-none absolute top-1/2 left-1/2 z-[1] flex -translate-x-1/2 -translate-y-1/2 scale-75 items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-semibold opacity-0 shadow-lg transition-[transform,opacity] duration-500 ease-[var(--ease-spring)] group-hover/card:scale-100 group-hover/card:opacity-100 group-focus-within/card:scale-100 group-focus-within/card:opacity-100"
          >
            <Scissors className="size-3.5" />
            Öffnen
          </span>
        ) : null}

        {failed ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="flex items-center gap-2 rounded-md bg-black/75 px-3 py-1.5 text-xs font-medium text-white">
              <CircleAlert className="size-4" />
              Fehlgeschlagen
            </span>
          </div>
        ) : null}

        {!processing && previewClips.length > 0 ? (
          <div aria-hidden className="absolute bottom-2.5 left-2.5 z-[1] flex">
            {previewClips.map((clip, index) => (
              <span
                key={clip.id}
                className={cn(
                  'relative h-11 w-[25px] overflow-hidden rounded-[4px] shadow-[0_2px_8px_rgb(0_0_0/0.5)] ring-1 ring-white/35 transition-transform duration-500 ease-[var(--ease-spring)]',
                  index === 0 ? 'ml-0' : '-ml-2',
                  index === 0 && 'group-hover/card:-translate-y-1 group-hover/card:-rotate-6',
                  index === 1 && 'group-hover/card:-translate-y-1.5',
                  index === 2 && 'group-hover/card:-translate-y-1 group-hover/card:translate-x-1.5 group-hover/card:rotate-6',
                )}
                style={{ zIndex: 3 - index }}
              >
                <Image src={clip.thumbnail_url!} alt="" fill unoptimized sizes="25px" className="object-cover" />
              </span>
            ))}
          </div>
        ) : null}

        {!processing && project.duration_seconds ? (
          <span className="absolute right-2.5 bottom-2.5 z-[1] rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white/90 tabular-nums backdrop-blur-sm transition-transform duration-500 ease-[var(--ease-spring)] group-hover/card:-translate-y-0.5 group-hover/card:bg-black/85">
            {formatDuration(project.duration_seconds)}
          </span>
        ) : null}
      </div>

      <div className="mt-2.5 flex items-start gap-1 px-0.5">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm leading-snug font-medium text-foreground/90 transition-colors duration-300 group-hover/card:text-foreground">
            <Link
              href={`/dashboard/clips/${project.id}`}
              className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
            >
              {project.title}
            </Link>
          </h3>
          <p className={cn('mt-1 truncate text-xs', failed ? 'text-destructive' : 'text-muted-foreground')}>{meta}</p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button size="icon-sm" variant="ghost" className="relative z-10 -mt-1 -mr-1 rounded-full text-muted-foreground hover:bg-foreground/[0.06] aria-expanded:bg-foreground/[0.06] pointer-fine:opacity-0 pointer-fine:group-hover/card:opacity-100 pointer-fine:focus-visible:opacity-100 pointer-fine:aria-expanded:opacity-100" />}
            aria-label={`Aktionen für ${project.title}`}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!failed && !processing ? (
              <DropdownMenuItem render={<Link href={`/dashboard/projects/${project.id}`} />}>
                <Scissors />Im Editor öffnen
              </DropdownMenuItem>
            ) : null}
            {onProcess ? (
              <DropdownMenuItem onClick={onProcess}>
                {failed ? <><RotateCw />Erneut versuchen</> : <><Scissors />Clips erstellen</>}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={onRename}><Pencil />Umbenennen</DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive"><Trash2 />Video löschen</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0')
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}
