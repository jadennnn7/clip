'use client'

import Link from 'next/link'
import { ArrowUpRight, CircleAlert, MoreHorizontal, Pencil, RotateCw, Scissors, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

import { cn } from '@/lib/utils'
import { startLinkImport, usePipelineProgress } from '@/lib/link-import'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { DeleteActions, useDeleteProject } from '@/components/clips/ProjectDialogs'
import type { Project, ProjectSource, ProjectStatus } from '@/types/database'
import { DEFAULT_PROJECT_SETTINGS } from '@/types/workspace'
import { EDITOR_ENABLED } from '@/lib/features'

/** Lage eines Clips im Quellvideo, in Sekunden. */
export interface ClipRange {
  start: number
  end: number
}

interface ProjectGridProps {
  projects: Project[]
  clipCounts: Record<string, number>
  /** Je Projekt die Stellen, an denen Clips geschnitten wurden. */
  clipRanges?: Record<string, ClipRange[]>
}

const SOURCE_LABEL: Record<ProjectSource, string> = {
  upload: 'Upload',
  youtube: 'YouTube',
  drive: 'Drive',
}

const BAR_COUNT = 48

const PIPELINE: ProjectStatus[] = ['downloading', 'transcribing', 'analyzing', 'reframing']

/**
 * Die Projekte als Karten mit gezeichnetem Cover.
 *
 * Neben der Shader-Bühne wirkte die frühere Textliste wie ein Anhang. Karten
 * geben jedem Projekt eine Fläche — aber keine Fotos: `thumbnail_url` ist
 * überall `null`, und ein Platzhalterbild würde Inhalt vortäuschen. Das Cover
 * zeigt stattdessen, was ein Projekt vor dem Schnitt tatsächlich ist: eine
 * Tonspur mit Dauer und Quelle.
 *
 * Fertige Projekte sind als ganze Karte verlinkt. Laufende bleiben bewusst
 * nicht anklickbar — es gibt dort noch nichts zu sehen; stattdessen zeigt ihr
 * Cover, in welchem Schritt sie stehen.
 */
export function ProjectGrid({ projects, clipCounts, clipRanges = {} }: ProjectGridProps) {
  const updateProject = useWorkspaceStore((state) => state.updateProject)
  const { remove, pendingId } = useDeleteProject()
  const [editing, setEditing] = useState<Project | null>(null)
  const [title, setTitle] = useState('')
  const [deleting, setDeleting] = useState<Project | null>(null)
  if (projects.length === 0) return <EmptyState />

  return (
    // `grid-cols-1` statt implizit: Die implizite Spalte ist `auto` breit, und
    // der einzeilig abgeschnittene Titel (`nowrap`) würde sie auf Mobilgeräten
    // über den Rand hinaus aufblähen.
    <>
    <ul className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          clipCount={clipCounts[project.id] ?? 0}
          clipRanges={clipRanges[project.id] ?? []}
          onRename={() => { setEditing(project); setTitle(project.title) }}
          onDelete={() => setDeleting(project)}
          onProcess={project.source_url && project.source_type !== 'upload' && (project.status === 'draft' || project.status === 'error')
            ? () => {
              const settings = useWorkspaceStore.getState().projectSettings[project.id] ?? DEFAULT_PROJECT_SETTINGS
              startLinkImport(project.source_url!, settings, project.id)
                .then(() => toast.success('Clips werden erstellt', { description: `„${project.title}" wird neu verarbeitet.` }))
                .catch((cause) => toast.error('Start fehlgeschlagen', { description: cause instanceof Error ? cause.message : undefined }))
            }
            : undefined}
        />
      ))}
    </ul>
    <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null) }}>
      <DialogContent>
        <DialogTitle>Projekt umbenennen</DialogTitle>
        <DialogDescription>Ein klarer Titel macht dein Projekt leichter auffindbar.</DialogDescription>
        <form onSubmit={(event) => { event.preventDefault(); if (editing && title.trim()) { updateProject(editing.id, { title: title.trim() }); setEditing(null); toast.success('Projekttitel gespeichert') } }} className="space-y-4">
          <label className="block text-xs">Projekttitel<input autoFocus required maxLength={180} className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>Abbrechen</Button><Button type="submit" disabled={!title.trim()}>Speichern</Button></div>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
      <DialogContent>
        <DialogTitle>Projekt löschen?</DialogTitle>
        <DialogDescription>„{deleting?.title}“ und die zugehörigen Clips, Planungseinträge und geplanten Veröffentlichungen werden entfernt.</DialogDescription>
        <DeleteActions
          pending={pendingId !== null}
          label="Projekt löschen"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => { if (deleting && await remove(deleting, 'Projekt gelöscht')) setDeleting(null) }}
        />
      </DialogContent>
    </Dialog>
    </>
  )
}

/**
 * Eine Projektkarte: Cover, darunter Titel und Menü auf einer Zeile.
 *
 * Vorher stand das Menü in einer dritten Zeile unter dem Datum, getrennt vom
 * Titel, auf den es sich bezieht. Jetzt liegt es neben ihm und erscheint mit
 * Maus erst beim Überfahren — zwölf ständig sichtbare Punkte-Knöpfe sind
 * Rauschen. Auf Touch-Geräten gibt es kein Überfahren, dort bleibt es stehen. Damit Karte und
 * Menü trotzdem beide klickbar sind, ohne ineinander verschachtelt zu sein,
 * spannt der Titel-Link seine Klickfläche über die ganze Karte (`after:`), und
 * das Menü liegt eine Ebene darüber.
 */
function ProjectCard({
  project,
  clipCount,
  clipRanges,
  onRename,
  onDelete,
  onProcess,
}: {
  project: Project
  clipCount: number
  clipRanges: ClipRange[]
  onRename: () => void
  onDelete: () => void
  /** Link-Entwurf oder fehlgeschlagener Link: Verarbeitung (erneut) starten. */
  onProcess?: () => void
}) {
  const isReady = project.status === 'ready'
  return (
    // Die Karte ist eine Glaskachel, das Cover liegt darin wie ein Bild unter
    // Glas. Nur fertige Projekte heben sich beim Überfahren — laufende sind
    // nicht anklickbar und sollen es auch nicht versprechen.
    <li className="group/card relative min-w-0">
      <Cover project={project} clipRanges={clipRanges} />

      <div className="mt-2.5 flex items-start gap-1 px-0.5">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-foreground/90 transition-colors group-hover/card:text-foreground">
            {/* Jede Karte führt zur Seite des Videos — dort stehen seine
                Clips, oder der Fortschritt, solange sie noch entstehen. */}
            <Link
              href={`/dashboard/clips/${project.id}`}
              className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
            >
              {project.title}
            </Link>
          </h3>

          {project.error_message ? (
            <p className="mt-1 truncate text-xs text-destructive">{project.error_message}</p>
          ) : (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {clipCount > 0 ? (
                <>
                  {/* Zahlen in Mono: Sie fluchten dadurch über die Karten hinweg. */}
                  <span className="font-mono tabular-nums">{clipCount} Clips</span>
                  {' · '}
                </>
              ) : null}
              {new Date(project.created_at).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: 'short',
              })}
              {' · '}
              {SOURCE_LABEL[project.source_type]}
            </p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button size="icon-sm" variant="ghost" className="relative z-10 -mt-1 -mr-1 rounded-full text-muted-foreground hover:bg-foreground/[0.06] aria-expanded:bg-foreground/[0.06] dark:hover:bg-white/[0.08] pointer-fine:opacity-0 pointer-fine:group-hover/card:opacity-100 pointer-fine:focus-visible:opacity-100 pointer-fine:aria-expanded:opacity-100" />}
            aria-label={`Projektaktionen für ${project.title}`}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {EDITOR_ENABLED && isReady ? (
              <DropdownMenuItem render={<Link href={`/dashboard/projects/${project.id}`} />}>
                <Scissors />Im Editor öffnen
              </DropdownMenuItem>
            ) : null}
            {onProcess ? (
              <DropdownMenuItem onClick={onProcess}>
                {project.status === 'error' ? <><RotateCw />Erneut versuchen</> : <><Scissors />Clips erstellen</>}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={onRename}><Pencil />Umbenennen</DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive"><Trash2 />Projekt löschen</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

function Cover({ project, clipRanges }: { project: Project; clipRanges: ClipRange[] }) {
  const isReady = project.status === 'ready'
  const isFailed = project.status === 'error'
  const isWorking = !isReady && !isFailed && project.status !== 'draft'
  const seed = hashSeed(project.id)

  return (
    <div
      className={cn(
        'transition-ui relative aspect-video overflow-hidden rounded-xl bg-gradient-to-b from-neutral-100 to-neutral-200/80 ring-1 ring-black/[0.06] dark:from-neutral-800 dark:to-neutral-950 dark:ring-white/10',
        isReady && 'group-hover/card:-translate-y-1 group-hover/card:shadow-[0_18px_40px_-14px_rgb(0_0_0/0.45)] dark:group-hover/card:shadow-[0_18px_40px_-14px_rgb(0_0_0/0.65)] dark:group-hover/card:ring-white/20',
      )}
    >
      {/* Die Lichtquelle wandert je Projekt ein Stück: Neun identische Cover
          nebeneinander lesen sich wie ein Ladezustand, nicht wie neun Videos. */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at ${22 + (seed % 57)}% 0%, rgba(255,255,255,0.18), transparent 62%)`,
        }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <Waveform
        seed={seed}
        dimmed={!isReady}
        duration={project.duration_seconds}
        ranges={isReady ? clipRanges : []}
      />

      <span className="glass-chip absolute right-2 bottom-2 rounded-full px-2 py-0.5 font-mono text-[0.65rem] tabular-nums">
        {formatDuration(project.duration_seconds)}
      </span>

      {isReady ? (
        <span className="liquid transition-ui absolute top-2 right-2 flex size-8 translate-y-1 items-center justify-center rounded-full opacity-0 group-hover/card:translate-y-0 group-hover/card:opacity-100 group-has-[a:focus-visible]/card:translate-y-0 group-has-[a:focus-visible]/card:opacity-100">
          <ArrowUpRight className="size-4" />
        </span>
      ) : null}

      {isFailed ? (
        <div className="absolute inset-0 flex items-center justify-center bg-destructive/[0.08]">
          <span className="glass-chip flex size-10 items-center justify-center rounded-full">
            <CircleAlert className="size-5 text-white/90" />
          </span>
        </div>
      ) : null}

      {/* Der laufende Schritt steht auf dem Cover selbst: Dort sucht man
          zuerst, ob ein Projekt schon fertig ist. */}
      {!isReady && !isFailed ? (
        <span className="glass-chip absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full px-2.5 py-1 [&>span]:text-xs">
          <StatusBadge status={project.status} />
          <StepProgress projectId={project.id} active={isWorking} />
        </span>
      ) : null}

      {isWorking ? <PipelineTrack status={project.status} /> : null}
    </div>
  )
}

/**
 * Prozent innerhalb des laufenden Schritts — nur wo die Pipeline sie kennt
 * (Download, Umwandlung). Sonst steht nur der Schritt da.
 */
function StepProgress({ projectId, active }: { projectId: string; active: boolean }) {
  const progress = usePipelineProgress((state) => state[projectId]?.progress ?? null)
  if (!active || progress === null) return null
  return <span className="font-mono text-muted-foreground tabular-nums">{Math.round(progress * 100)} %</span>
}

/**
 * Die vier Verarbeitungsschritte als Segmente an der Unterkante.
 *
 * Bewusst Schritte statt Prozent: Die Pipeline meldet, in welchem Schritt sie
 * ist, nicht wie weit darin. Ein stufenloser Balken würde eine Genauigkeit
 * behaupten, die es nicht gibt.
 */
function PipelineTrack({ status }: { status: ProjectStatus }) {
  const current = PIPELINE.indexOf(status)

  return (
    <div
      role="img"
      aria-label={current < 0 ? 'Wartet auf den Start' : `Schritt ${current + 1} von ${PIPELINE.length}`}
      className="absolute inset-x-0 bottom-0 flex h-[3px] gap-px"
    >
      {PIPELINE.map((step, index) => (
        <span
          key={step}
          className={cn(
            'flex-1',
            index < current && 'bg-neutral-900/60 dark:bg-white/70',
            index === current && 'animate-pulse bg-neutral-900/60 dark:bg-white/70',
            index > current && 'bg-black/10 dark:bg-white/15',
          )}
        />
      ))}
    </div>
  )
}

/**
 * Gezeichnete Tonspur als Cover.
 *
 * Die Balkenhöhen sind aus der Projekt-ID abgeleitet statt zufällig: Jedes
 * Projekt behält über Seitenaufrufe hinweg sein eigenes Bild, und die Karte
 * bleibt hydrationssicher, falls sie je in einer Client-Komponente landet.
 *
 * Die Stellen, aus denen Clips geschnitten wurden, sind markiert — wie mit dem
 * Textmarker. So zeigt das Cover, was OmegaClip in diesem Video gefunden hat,
 * und nicht nur, dass es eines gibt. Ein Clip von 30 Sekunden in einer Stunde
 * wäre schmaler als ein Balken, deshalb markiert jeder Treffer mindestens
 * einen ganzen.
 */
function Waveform({
  seed,
  dimmed,
  duration,
  ranges,
}: {
  seed: number
  dimmed: boolean
  duration: number | null
  ranges: ClipRange[]
}) {
  const phase = (seed % 628) / 100

  const marked = new Array<boolean>(BAR_COUNT).fill(false)
  if (duration && duration > 0) {
    for (const range of ranges) {
      const first = Math.floor((range.start / duration) * BAR_COUNT)
      const last = Math.ceil((range.end / duration) * BAR_COUNT) - 1
      for (let i = Math.max(0, first); i <= Math.min(BAR_COUNT - 1, Math.max(first, last)); i++) {
        marked[i] = true
      }
    }
  }

  const bars = Array.from({ length: BAR_COUNT }, (_, i) => {
    const t = i / BAR_COUNT
    const envelope =
      0.5 +
      0.3 * Math.sin(t * Math.PI * 5 + phase) +
      0.2 * Math.sin(t * Math.PI * 17 + phase * 2.3)
    return Math.max(0.1, Math.min(1, envelope))
  })

  return (
    // Spalten ohne Abstand, der Abstand steckt im Innenrand: So schließen
    // benachbarte markierte Spalten zu einer durchgehenden Markierung.
    <div aria-hidden className="absolute inset-x-5 top-1/2 flex h-1/2 -translate-y-1/2">
      {bars.map((height, index) => {
        const isMarked = marked[index]
        return (
          <span
            key={index}
            className={cn(
              'flex h-full flex-1 items-center px-[1.5px]',
              // Der Textmarker in Graustufen: ein Band hinter den Balken und
              // die Balken selbst in voller Deckkraft.
              isMarked && 'bg-neutral-900/[0.07] dark:bg-white/[0.12]',
              isMarked && !marked[index - 1] && 'rounded-l-[3px]',
              isMarked && !marked[index + 1] && 'rounded-r-[3px]',
            )}
          >
            <span
              className={cn(
                'transition-ui w-full rounded-full',
                isMarked
                  ? 'bg-neutral-900 dark:bg-white'
                  : dimmed
                    ? 'bg-neutral-900 opacity-20 dark:bg-white dark:opacity-30'
                    : 'bg-neutral-900 opacity-40 group-hover/card:opacity-60 dark:bg-white dark:opacity-55 dark:group-hover/card:opacity-80',
              )}
              style={{ height: `${Math.round(height * 76)}%` }}
            />
          </span>
        )
      })}
    </div>
  )
}

function EmptyState() {
  return (
    <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
      Noch keine Projekte — wirf oben ein Video ein.
    </p>
  )
}

function hashSeed(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
