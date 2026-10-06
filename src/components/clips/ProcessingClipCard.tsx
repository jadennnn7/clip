'use client'

import Image from 'next/image'
import { CircleAlert, LoaderCircle, RotateCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useDeleteProject } from '@/components/clips/ProjectDialogs'
import { expectedClipCount, startLinkImport, usePipelineProgress } from '@/lib/link-import'
import { outputFormatCssAspect } from '@/lib/output-format'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspace-store'
import type { Project, ProjectStatus } from '@/types/database'
import { DEFAULT_PROJECT_SETTINGS, type OutputFormat } from '@/types/workspace'

/**
 * Ladezustand eines Videos, aus dem gerade Clips entstehen.
 *
 * Die Karte zeigt, was entsteht: den 9:16-Ausschnitt des Videos, gedimmt und
 * grau. Ein Lichtband fährt darüber, und wo es vorbeizieht, „entwickelt"
 * sich das Bild in Farbe (`processing-develop` in globals.css). Darüber nur
 * das Nötigste: Status, Gesamtfortschritt, der aktuelle Schritt.
 *
 * Die Bausteine (`ViewfinderBand`, `PipelineSteps`) nutzen auch die
 * Video-Karte der Bibliothek und der Kopf der Clip-Seite.
 */

const STEPS: ProjectStatus[] = ['downloading', 'transcribing', 'analyzing', 'reframing']

const STEP_LABEL: Record<ProjectStatus, string> = {
  draft: 'Entwurf',
  queued: 'Wartet auf einen freien Platz',
  downloading: 'Video wird geladen',
  transcribing: 'Sprache wird erkannt',
  analyzing: 'Die stärksten Momente werden gesucht',
  reframing: 'Sprecher werden erkannt',
  ready: 'Fertig',
  error: 'Fehlgeschlagen',
}

const SOURCE_LABEL: Record<Project['source_type'], string> = { youtube: 'YouTube', drive: 'Google Drive', upload: 'Upload' }

export function sourceLine(project: Project): string {
  const minutes = project.duration_seconds ? `${Math.max(1, Math.round(project.duration_seconds / 60))} Min` : null
  return [SOURCE_LABEL[project.source_type], minutes].filter(Boolean).join(' · ')
}

/** Stabile Pseudo-Zufallswerte je Projekt, damit nicht jede Karte dieselbe Tonspur zeigt. */
function waveformBars(seed: string, count: number): number[] {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return Array.from({ length: count }, (_, index) => {
    hash = (hash * 1103515245 + 12345) >>> 0
    const envelope = 0.55 + 0.35 * Math.sin((index / count) * Math.PI * 3 + (hash % 7))
    return Math.max(0.2, Math.min(1, envelope * (0.6 + ((hash >>> 8) % 40) / 100)))
  })
}

/** Das Quellbild als 16:9-Band, darüber der wandernde 9:16-Sucher. */
export function ViewfinderBand({ thumbnail, className }: { thumbnail: string | null; className?: string }) {
  return (
    <div className={cn('relative aspect-video w-full overflow-hidden rounded-lg bg-white/[0.04] ring-1 ring-white/10', className)}>
      {thumbnail ? (
        <>
          <Image src={thumbnail} alt="" fill unoptimized sizes="480px" className="object-cover brightness-[0.45] grayscale" />
          <Image src={thumbnail} alt="" fill unoptimized sizes="480px" className="viewfinder-reveal object-cover" />
        </>
      ) : (
        <div className="shimmer absolute inset-0" />
      )}
      <div className="viewfinder-glide absolute inset-y-0 left-0 w-[31.64%]">
        <div className="viewfinder-focus absolute inset-0 rounded-[6px]" />
        {/* Schnittmarken an den Ecken, wie im Sucher einer Kamera. */}
        <span className="absolute -top-px -left-px size-2 rounded-tl-[6px] border-t-2 border-l-2 border-white" />
        <span className="absolute -top-px -right-px size-2 rounded-tr-[6px] border-t-2 border-r-2 border-white" />
        <span className="absolute -bottom-px -left-px size-2 rounded-bl-[6px] border-b-2 border-l-2 border-white" />
        <span className="absolute -right-px -bottom-px size-2 rounded-br-[6px] border-r-2 border-b-2 border-white" />
      </div>
    </div>
  )
}

/**
 * Fortschritt über alle vier Schritte zusammen. Die Prozentzahl der Pipeline
 * gilt nur für den laufenden Schritt; „27 %" in Schritt 1 las sich wie
 * „fast ein Drittel fertig". Hier zählt jeder Schritt ein Viertel.
 */
function usePipelineOverall(project: Project) {
  const detail = usePipelineProgress((state) => state[project.id])
  const step = STEPS.indexOf(project.status)
  const stepProgress = detail?.progress ?? null
  const overall = step >= 0 ? (step + (stepProgress ?? 0)) / STEPS.length : null
  return {
    step,
    label: detail?.message ?? STEP_LABEL[project.status],
    percent: overall === null ? null : Math.min(99, Math.round(overall * 100)),
    /** Ohne Prozentzahl des Schritts läuft ein Lichtpunkt durch sein Viertel. */
    indeterminate: step < 0 || stepProgress === null,
    overall: overall ?? 0,
  }
}

/** Ein durchgehender Balken mit feinen Marken zwischen den vier Schritten. */
function OverallBar({ project, className }: { project: Project; className?: string }) {
  const { step, overall, indeterminate } = usePipelineOverall(project)
  return (
    <div className={cn('relative h-[3px] overflow-hidden rounded-full bg-white/15', className)}>
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-white shadow-[0_0_8px_rgb(255_255_255/0.6)] transition-[width] duration-700 ease-(--ease-out-quint)"
        style={{ width: `${Math.max(3, overall * 100)}%` }}
      />
      {indeterminate ? (
        <span
          className="absolute inset-y-0 overflow-hidden"
          style={{ left: `${(Math.max(0, step) / STEPS.length) * 100}%`, width: `${100 / STEPS.length}%` }}
        >
          <span className="segment-indeterminate absolute inset-y-0 left-0 w-2/5 rounded-full bg-white/70" />
        </span>
      ) : null}
      {[1, 2, 3].map((mark) => (
        <span key={mark} className="absolute inset-y-0 w-px bg-black/60" style={{ left: `${(mark / STEPS.length) * 100}%` }} />
      ))}
    </div>
  )
}

/** Schritt, Beschreibung und Gesamtfortschritt — für dunklen Grund. */
export function PipelineSteps({ project, compact = false, className }: { project: Project; compact?: boolean; className?: string }) {
  const { step, label, percent } = usePipelineOverall(project)
  return (
    <div className={className}>
      <div className={cn('flex items-baseline justify-between gap-3 text-white/50 tabular-nums', compact ? 'text-[10px]' : 'text-[11px]')}>
        <span>{step >= 0 ? `Schritt ${step + 1} von ${STEPS.length}` : 'In der Warteschlange'}</span>
        {percent !== null ? <span className="font-medium text-white/80">{percent} %</span> : null}
      </div>
      <p className={cn('mt-1 line-clamp-2 leading-snug font-medium text-balance text-white', compact ? 'text-[11.5px]' : 'text-[13px]')}>{label}</p>
      <OverallBar project={project} className="mt-2.5" />
    </div>
  )
}

/** Tonspur mit wanderndem Abspielkopf. */
function WaveformScan({ seed, bars, className }: { seed: string; bars: number; className?: string }) {
  return (
    <div className={cn('relative shrink-0 overflow-hidden', className)}>
      <div className="flex h-full items-end gap-[2px]">
        {waveformBars(seed, bars).map((height, index) => (
          <span
            key={index}
            className="waveform-bounce flex-1 rounded-full bg-white/35"
            style={{ height: `${Math.round(height * 100)}%`, animationDelay: `${(index * 97) % 1200}ms` }}
          />
        ))}
      </div>
      <div className="playhead-scan absolute inset-0">
        <span className="absolute inset-y-0 right-0 w-px bg-white shadow-[0_0_10px_2px_rgb(255_255_255/0.55)]" />
      </div>
    </div>
  )
}

/** Der Status-Chip „Wird geschnitten" mit pulsierendem Punkt. */
export function CuttingChip({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn('glass-chip flex w-fit items-center gap-1.5 rounded-full font-medium whitespace-nowrap', compact ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]', className)}>
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-70" />
        <span className="relative inline-flex size-1.5 rounded-full bg-white" />
      </span>
      Wird geschnitten
    </span>
  )
}

/** Formatgerechte Karte für Reihen und Raster, in denen gleich die Clips erscheinen. */
export function ProcessingClipCard({ project, compact = false }: { project: Project; compact?: boolean }) {
  const expected = expectedClipCount(project.duration_seconds)
  const outputFormat = useWorkspaceStore((state) => state.projectSettings[project.id]?.aspectRatio ?? '9:16')
  const { percent } = usePipelineOverall(project)

  return (
    <article
      aria-busy="true"
      aria-label={`${project.title}: wird geschnitten${percent !== null ? `, ${percent} Prozent` : ''}`}
      className={cn('rise-in min-w-0', compact ? 'w-[156px] shrink-0 snap-start' : 'glass-tile rounded-2xl p-2')}
    >
      <div
        className="relative overflow-hidden rounded-xl bg-neutral-950 ring-1 ring-black/[0.06] ring-inset dark:ring-white/10"
        style={{ aspectRatio: outputFormatCssAspect(outputFormat) }}
      >
        {/* Das künftige Clip-Bild: gedimmt und grau, im Lichtband in Farbe. */}
        {project.thumbnail_url ? (
          <>
            <Image src={project.thumbnail_url} alt="" fill unoptimized sizes="320px" className="object-cover brightness-[0.42] grayscale" />
            <Image src={project.thumbnail_url} alt="" fill unoptimized sizes="320px" className="processing-develop object-cover brightness-90" />
          </>
        ) : (
          <div className="shimmer absolute inset-0" />
        )}
        <span
          aria-hidden
          className="processing-scanline absolute inset-x-0 h-px bg-white/90 shadow-[0_0_14px_3px_rgb(255_255_255/0.45)]"
        />

        <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/60 to-transparent" />

        <CuttingChip compact={compact} className={cn('absolute', compact ? 'top-2.5 left-2.5' : 'top-3 left-3')} />

        <PipelineSteps project={project} compact={compact} className={cn('absolute inset-x-0 bottom-0', compact ? 'p-2.5' : 'p-3.5')} />
      </div>

      <div className={cn(compact ? 'mt-2.5 px-0.5 pb-1' : 'px-1.5 pb-1 pt-3')}>
        {compact ? null : <p className="truncate text-[10px] tracking-wide text-muted-foreground uppercase">{sourceLine(project)}</p>}
        <p className={cn('line-clamp-2 font-medium', compact ? 'text-sm leading-snug' : 'mt-1 min-h-10 text-sm leading-5')}>{project.title}</p>
        {compact ? null : (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {project.duration_seconds
              ? `≈ ${expected} ${expected === 1 ? 'Clip entsteht' : 'Clips entstehen'} — du kannst weiterarbeiten.`
              : 'Die Clips erscheinen hier, sobald sie fertig sind.'}
          </p>
        )}
      </div>
    </article>
  )
}

/**
 * Kopf der Clip-Seite, solange das Video noch geschnitten wird: groß, mit
 * Sucher, Tonspur und Schritten — die Seite hat sonst noch nichts zu zeigen.
 */
export function ProcessingBanner({ project }: { project: Project }) {
  const expected = expectedClipCount(project.duration_seconds)
  return (
    <section aria-busy="true" className="rise-in relative overflow-hidden rounded-2xl bg-neutral-950 p-4 ring-1 ring-white/10 sm:p-5">
      {project.thumbnail_url ? (
        <Image src={project.thumbnail_url} alt="" fill unoptimized sizes="900px" className="scale-110 object-cover opacity-25 blur-3xl grayscale" />
      ) : null}
      <div className="relative grid items-center gap-5 sm:grid-cols-[minmax(0,22rem)_1fr]">
        <div>
          <ViewfinderBand thumbnail={project.thumbnail_url} />
          <WaveformScan seed={project.id} bars={36} className="mt-3 h-7" />
        </div>
        <div className="min-w-0">
          <CuttingChip />
          <PipelineSteps project={project} className="mt-4 max-w-md" />
          <p className="mt-4 text-xs text-white/50">
            {project.duration_seconds ? `≈ ${expected} ${expected === 1 ? 'Clip entsteht' : 'Clips entstehen'}. ` : ''}
            Du kannst die Seite verlassen — die Clips erscheinen hier, sobald sie fertig sind.
          </p>
        </div>
      </div>
    </section>
  )
}

/** Ein Video, dessen Verarbeitung gescheitert ist — mit Grund und Ausweg. */
export function FailedClipCard({ project }: { project: Project }) {
  const { remove, pendingId } = useDeleteProject()
  const settings = useWorkspaceStore((state) => state.projectSettings[project.id])
  const outputFormat = settings?.aspectRatio ?? '9:16'

  const retry = () => {
    if (!project.source_url) return
    startLinkImport(project.source_url, settings ?? DEFAULT_PROJECT_SETTINGS, project.id)
      .then(() => toast.success('Clips werden erstellt', { description: `„${project.title}" wird neu verarbeitet.` }))
      .catch((cause) => toast.error('Start fehlgeschlagen', { description: cause instanceof Error ? cause.message : undefined }))
  }

  return (
    <article className="rise-in min-w-0 glass-tile rounded-2xl p-2">
      <div
        className="relative overflow-hidden rounded-xl bg-neutral-950 ring-1 ring-white/10 ring-inset"
        style={{ aspectRatio: outputFormatCssAspect(outputFormat) }}
      >
        {project.thumbnail_url ? (
          <Image src={project.thumbnail_url} alt="" fill unoptimized sizes="300px" className="scale-110 object-cover opacity-30 blur-md grayscale" />
        ) : null}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center">
          <span className="glass-chip flex size-10 items-center justify-center rounded-full">
            <CircleAlert className="size-5" />
          </span>
          <p className="text-[13px] font-medium text-white">Konnte nicht geschnitten werden</p>
          <p className="line-clamp-5 text-[11px] leading-relaxed text-white/60">{project.error_message ?? 'Unbekannter Fehler.'}</p>
        </div>
      </div>
      <div className="px-1.5 pt-3 pb-1">
        <p className="truncate text-[10px] tracking-wide text-muted-foreground uppercase">{sourceLine(project)}</p>
        <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 font-medium">{project.title}</p>
        <div className="mt-3 flex items-center gap-2 border-t pt-3">
          <Button variant="outline" size="sm" className="flex-1" onClick={retry} disabled={!project.source_url}><RotateCw />Erneut</Button>
          <Button variant="ghost" size="sm" className="flex-1" disabled={pendingId !== null} aria-busy={pendingId !== null} onClick={() => { void remove(project, 'Projekt entfernt') }}>{pendingId !== null ? <LoaderCircle className="animate-spin" /> : <Trash2 />}Entfernen</Button>
        </div>
      </div>
    </article>
  )
}

/**
 * Platzhalter für einen Clip, der gleich erscheint — gebaut wie `ClipCard`:
 * im Raster ohne Rahmen, in der Liste als Glaskachel, mit Score, Titel und
 * Statuszeile an derselben Stelle. Wenn der Clip fertig ist, wechselt nur
 * der Inhalt, nicht die Form.
 */
export function GhostClipCard({
  delay = 0,
  outputFormat = '9:16',
  layout = 'grid',
}: {
  delay?: number
  outputFormat?: OutputFormat
  layout?: 'grid' | 'list'
}) {
  const bar = 'rounded-full bg-foreground/[0.07]'
  return (
    <div
      aria-hidden
      className={cn(
        'rise-in min-w-0',
        layout === 'list' && 'grid grid-cols-[7rem_minmax(0,1fr)] grid-rows-[auto_1fr] items-start gap-x-4 glass-tile rounded-2xl p-3 sm:grid-cols-[9rem_minmax(0,1fr)]',
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={cn(
          'shimmer relative rounded-xl bg-foreground/[0.04] ring-1 ring-black/[0.06] dark:ring-white/10',
          layout === 'list' && 'col-start-1 row-span-2 row-start-1 w-full',
        )}
        style={{ animationDelay: `${delay}ms`, aspectRatio: outputFormatCssAspect(outputFormat) }}
      >
        <div className="absolute top-2.5 left-2.5 h-4 w-12 rounded-full bg-foreground/[0.06]" />
        <div className="absolute inset-x-6 bottom-[26%] flex flex-col items-center gap-1.5">
          <div className={cn(bar, 'h-3 w-4/5')} />
          <div className={cn(bar, 'h-3 w-3/5')} />
        </div>
      </div>
      <div className={cn('flex h-8 items-center px-0.5', layout === 'grid' ? 'mt-2.5' : 'col-start-2 row-start-1')}>
        <div className="h-6 w-10 rounded-md bg-foreground/[0.07]" />
      </div>
      <div className={cn('space-y-1.5 px-0.5 py-1', layout === 'grid' ? 'mt-1' : 'col-start-2 row-start-2 mt-2 self-start')}>
        <div className={cn(bar, 'h-3 w-4/5')} />
        <div className={cn(bar, 'h-3 w-3/5')} />
      </div>
      <div className={cn('mt-2.5 border-t border-border pt-2.5', layout === 'list' && 'col-start-2 row-start-3')}>
        <div className={cn(bar, 'my-1 h-2.5 w-2/3')} />
      </div>
    </div>
  )
}
