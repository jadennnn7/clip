'use client'

import React, { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import type { PlayerRef } from '@remotion/player'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  Download,
  Ellipsis,
  Heart,
  Pencil,
  Scissors,
  Send,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatTime } from '@/components/clips/ClipCard'
import { ClipStage, useProjectMedia } from '@/components/clips/ClipStage'
import { PublishPanel } from '@/components/clips/PublishPanel'
import { ScoreReasoning } from '@/components/clips/ScoreDetails'
import { Dialog, DialogPortal } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { clipOutputDuration, clipSegments, outputToSource, sourceToOutput } from '@/lib/clip-export'
import { cn } from '@/lib/utils'
import { jobsForClip, usePublishingQueue } from '@/stores/publishing-queue-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { EDITOR_ENABLED } from '@/lib/features'
import { FPS } from '@/types/editor'
import type { Clip, Project, TranscriptWord } from '@/types/database'

const NO_REMOVED_WORDS: number[] = []

/**
 * Die Clip-Vorschau: links der Clip, rechts das Nötigste — Score,
 * Transkript und die drei Wege weiter: veröffentlichen, bearbeiten, exportieren.
 */
export function ClipSheet({
  project,
  clips,
  projectClips,
  clipId,
  open,
  onNavigate,
  onClose,
}: {
  project: Project
  clips: Clip[]
  projectClips: Clip[]
  clipId: string | null
  open: boolean
  onNavigate: (id: string) => void
  onClose: () => void
}) {
  const clip = projectClips.find((candidate) => candidate.id === clipId)
  const media = useProjectMedia(project)

  return (
    <Dialog open={open && Boolean(clip)} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogPortal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm duration-200 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
        {clip ? (
          <SheetPopup
            clip={clip}
            project={project}
            clips={clips}
            projectClips={projectClips}
            media={media}
            onNavigate={onNavigate}
            onClose={onClose}
          />
        ) : null}
      </DialogPortal>
    </Dialog>
  )
}

function SheetPopup({
  clip,
  project,
  clips,
  projectClips,
  media,
  onNavigate,
  onClose,
}: {
  clip: Clip
  project: Project
  clips: Clip[]
  projectClips: Clip[]
  media: { src: string | null; pending: boolean }
  onNavigate: (id: string) => void
  onClose: () => void
}) {
  const router = useRouter()
  const favorite = useWorkspaceStore((state) => state.favoriteClipIds.includes(clip.id))
  const removedWords = useWorkspaceStore((state) => state.removedWords[clip.id] ?? NO_REMOVED_WORDS)
  const queue = usePublishingQueue((state) => state.jobs)
  const projectPublishing = useWorkspaceStore((state) => state.projectPublishing[project.id])
  const outputFormat = useWorkspaceStore((state) => state.outputFormats[clip.id] ?? state.projectSettings[project.id]?.aspectRatio ?? '9:16')
  const toggleFavorite = useWorkspaceStore((state) => state.toggleFavorite)
  const updateClip = useWorkspaceStore((state) => state.updateClip)
  const duplicateClip = useWorkspaceStore((state) => state.duplicateClip)

  const playerRef = useRef<PlayerRef>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const [playhead, setPlayhead] = useState({ clipId: clip.id, frame: 0 })
  const [editingTitleOf, setEditingTitleOf] = useState<string | null>(null)
  const [publishingOf, setPublishingOf] = useState<string | null>(null)
  const [reasoningOf, setReasoningOf] = useState<string | null>(null)

  const frame = playhead.clipId === clip.id ? playhead.frame : 0
  const editingTitle = editingTitleOf === clip.id
  const setEditingTitle = (editing: boolean) => setEditingTitleOf(editing ? clip.id : null)
  const publishing = publishingOf === clip.id
  const setPublishing = (open: boolean) => setPublishingOf(open ? clip.id : null)
  const showReasoning = reasoningOf === clip.id
  const toggleReasoning = () => setReasoningOf(showReasoning ? null : clip.id)

  const index = clips.findIndex((candidate) => candidate.id === clip.id)
  const previous = index > 0 ? clips[index - 1] : undefined
  const next = index >= 0 && index < clips.length - 1 ? clips[index + 1] : undefined
  const editorHref = `/dashboard/projects/${clip.project_id}?clip=${clip.id}`
  const rendered = clip.render_status === 'ready' && clip.render_key
  const rank = [...projectClips].sort((a, b) => b.virality_score - a.virality_score).findIndex((candidate) => candidate.id === clip.id) + 1

  const duration = clipOutputDuration(clip)

  const seek = (seconds: number) => {
    const player = playerRef.current
    if (!player) return
    player.seekTo(Math.max(0, Math.round(seconds * FPS)))
    if (!player.isPlaying()) player.play()
  }

  const toggleFavoriteWithFeedback = () => {
    toggleFavorite(clip.id)
    toast.success(favorite ? 'Aus den Favoriten entfernt' : 'Als Favorit gemerkt')
  }

  const duplicate = () => {
    const copyId = duplicateClip(clip.id)
    if (!copyId) return
    toast.success('Clip dupliziert')
    onNavigate(copyId)
  }

  const handleExport = () => {
    if (rendered && clip.render_key) {
      const a = document.createElement('a')
      a.href = clip.render_key
      a.download = `${clip.title || 'clip'}.mp4`
      a.click()
      toast.success('Download gestartet')
    } else if (EDITOR_ENABLED) {
      router.push(editorHref)
      toast.info('Öffne Editor zum Exportieren')
    } else {
      // Gerendert wird im Editor — solange er aus ist, gibt es nur fertige Exporte.
      toast.info('Noch kein Export vorhanden', { description: 'Dieser Clip wurde noch nicht gerendert.' })
    }
  }

  const formatLabel = outputFormat === '9:16' ? 'Hochformat' : outputFormat === '1:1' ? 'Quadratisch' : 'Querformat'
  const durationLabel = formatTime(duration)
  const scheduled = jobsForClip(queue ?? [], clip.id, project.trigger_run_id, projectPublishing).filter((job) => job.status !== 'cancelled')
  const statusLabel = scheduled.some((job) => job.status === 'published')
    ? 'Veröffentlicht'
    : scheduled.length ? 'In der Queue' : rendered ? 'Export bereit' : 'Entwurf'
  const hasReasoning = Boolean(clip.editorial || clip.score_reasoning)

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || editingTitle || publishing) return
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"], [role="menu"]')) return
    const key = event.key.toLowerCase()
    if ((key === 'arrowleft' || key === 'k') && previous) onNavigate(previous.id)
    else if ((key === 'arrowright' || key === 'j') && next) onNavigate(next.id)
    else if (key === ' ' && !target.closest('button, a, [role="slider"], [role="tab"]')) playerRef.current?.toggle()
    else if (key === 'f') toggleFavoriteWithFeedback()
    else if (key === 'e' && EDITOR_ENABLED) router.push(editorHref)
    else return
    event.preventDefault()
  }

  return (
    <DialogPrimitive.Popup
      initialFocus={panelRef}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 outline-none sm:p-6 duration-200 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100vh-24px)] w-full max-w-[1080px] flex-col overflow-y-auto rounded-2xl bg-background text-foreground shadow-[0_40px_120px_-16px_rgba(0,0,0,.8)] ring-1 ring-border outline-none dark lg:h-[min(780px,calc(100vh-48px))] lg:flex-row lg:overflow-hidden"
      >
        {/* Links: die Bühne, mit Blättern zwischen den Clips. Dahinter
            leuchtet der Clip selbst weich nach — wie der Ambient-Modus eines
            Players —, statt auf flachem Schwarz zu stehen. */}
        <div className="relative isolate flex min-w-0 flex-1 overflow-hidden">
          {clip.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- nur Licht, unscharf und klein ausgeliefert
            <img
              key={`ambient-${clip.id}`}
              src={clip.thumbnail_url}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 size-full scale-125 object-cover opacity-60 blur-3xl saturate-150"
            />
          ) : null}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_70%_at_50%_45%,transparent,#0e0f11_95%)]"
          />
          <ClipStage
            key={clip.id}
            clip={clip}
            src={media.src}
            pending={media.pending}
            sourceWidth={project.width ?? 1920}
            sourceHeight={project.height ?? 1080}
            outputFormat={outputFormat}
            removedWords={removedWords}
            playerRef={playerRef}
            onFrame={(nextFrame) => setPlayhead({ clipId: clip.id, frame: nextFrame })}
          />
          {clips.length > 1 && index >= 0 ? (
            <>
              <span className="pointer-events-none absolute top-5 left-5 z-30 rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white/75 tabular-nums ring-1 ring-white/10 backdrop-blur-md">
                {index + 1} <span className="text-white/40">/ {clips.length}</span>
              </span>
              <StageArrow side="left" disabled={!previous} onClick={() => previous && onNavigate(previous.id)} />
              <StageArrow side="right" disabled={!next} onClick={() => next && onNavigate(next.id)} />
            </>
          ) : null}
        </div>

        {/* Rechts: Details oder Veröffentlichen */}
        <div className="flex w-full shrink-0 flex-col border-white/[.06] bg-white/[0.015] max-lg:border-t lg:w-[390px] lg:border-l">
          {publishing ? (
            <PublishPanel
              key={clip.id}
              clip={clip}
              project={project}
              removedWords={removedWords}
              outputFormat={outputFormat}
              onBack={() => setPublishing(false)}
              onClose={onClose}
            />
          ) : (
            <>
              <header className="px-6 pb-5 pt-5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1 pt-1">
                    {editingTitle ? (
                      <TitleInput
                        initial={clip.title}
                        onDone={(title) => {
                          if (title !== null && title !== clip.title) {
                            updateClip(clip.id, { title })
                            toast.success('Titel gespeichert')
                          }
                          setEditingTitle(false)
                        }}
                      />
                    ) : (
                      <h1 id="preview-title" className="font-display text-[19px] leading-snug font-semibold tracking-[-.02em]">
                        <button
                          type="button"
                          onClick={() => setEditingTitle(true)}
                          title="Titel ändern"
                          className="group/title line-clamp-2 cursor-text rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                        >
                          {clip.title}
                          <Pencil className="mb-0.5 ml-1.5 inline size-3.5 text-white/40 opacity-0 transition group-hover/title:opacity-100" />
                        </button>
                      </h1>
                    )}
                    <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 font-mono text-white/70 tabular-nums ring-1 ring-white/[0.08] ring-inset">
                        {durationLabel}
                      </span>
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-white/70 ring-1 ring-white/[0.08] ring-inset">
                        {formatLabel}
                      </span>
                      <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ring-1 ring-inset', STATUS_TONE[statusLabel])}>
                        <span className="size-1.5 rounded-full bg-current" />
                        {statusLabel}
                      </span>
                    </p>
                  </div>
                  <div className="-mr-2 flex shrink-0 items-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label="Weitere Optionen"
                        className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                      >
                        <Ellipsis className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onClick={toggleFavoriteWithFeedback} className="cursor-pointer gap-2">
                          <Heart className={cn('size-4', favorite && 'fill-current')} /> {favorite ? 'Aus Favoriten entfernen' : 'Als Favorit merken'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={duplicate} className="cursor-pointer gap-2">
                          <CopyPlus className="size-4" /> Duplizieren
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditingTitle(true)} className="cursor-pointer gap-2">
                          <Pencil className="size-4" /> Titel ändern
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Vorschau schließen"
                      className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
              </header>

              <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-6">
                <section className="glass-tile rounded-2xl p-4">
                  <div className="flex items-center gap-4">
                    <ScoreRing value={clip.virality_score} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white">Clip-Score</p>
                      <p className="mt-0.5 text-xs text-white/50">
                        Platz {rank} von {projectClips.length}
                      </p>
                    </div>
                    {hasReasoning ? (
                      <button
                        type="button"
                        onClick={toggleReasoning}
                        aria-expanded={showReasoning}
                        className="flex shrink-0 items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-white/70 ring-1 ring-white/[0.08] transition ring-inset hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
                      >
                        Begründung
                        <ChevronDown className={cn('size-3.5 transition-transform', showReasoning && 'rotate-180')} />
                      </button>
                    ) : null}
                  </div>

                  {/* Woraus sich der Score zusammensetzt — auf einen Blick, die
                      Begründung dazu im Aufklapper. */}
                  {clip.editorial ? (
                    <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-white/[0.07] pt-3.5">
                      {([
                        ['Hook', clip.editorial.hook.score],
                        ['Flow', clip.editorial.flow.score],
                        ['Value', clip.editorial.value.score],
                      ] as const).map(([label, value]) => (
                        <div key={label}>
                          <dt className="flex items-baseline justify-between text-[11px] text-white/50">
                            {label}
                            <span className="font-medium text-white/85 tabular-nums">{value}</span>
                          </dt>
                          <dd className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  {showReasoning ? (
                    <div className="mt-4 border-t border-white/[0.07] pt-4 text-xs text-white/90">
                      <ScoreReasoning clip={clip} dark />
                    </div>
                  ) : null}
                </section>

                {clip.words && clip.words.length > 0 ? (
                  <section className="glass-tile flex min-h-[11rem] flex-1 flex-col rounded-2xl p-4 pr-2">
                    <h2 className="mb-2.5 flex items-center justify-between pr-2 text-xs font-medium text-white/55">
                      Transkript
                      <span className="font-normal text-white/35">Klick auf ein Wort springt hin</span>
                    </h2>
                    <LiveTranscript
                      words={clip.words}
                      removed={removedWords}
                      seconds={outputToSource(clipSegments(clip), frame / FPS)}
                      onSeek={(sec) => seek(sourceToOutput(clipSegments(clip), sec))}
                    />
                  </section>
                ) : null}
              </div>

              <footer className="space-y-2 border-t border-border bg-background px-6 py-5 max-lg:sticky max-lg:bottom-0 lg:bg-transparent">
                {/* Der blaue Tropfen der App: dieselbe Hauptaktion wie überall. */}
                <button
                  type="button"
                  onClick={() => setPublishing(true)}
                  className="liquid flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-[transform,filter] duration-500 ease-spring hover:brightness-110 active:scale-[0.98] active:duration-100 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0f11] focus-visible:outline-none"
                >
                  <Send className="size-4" /> Veröffentlichen
                </button>
                <div className={cn('grid gap-2', EDITOR_ENABLED ? 'grid-cols-2' : 'grid-cols-1')}>
                  {EDITOR_ENABLED ? (
                    <button
                      type="button"
                      onClick={() => router.push(editorHref)}
                      className="flex items-center justify-center gap-2 control rounded-xl px-3 py-2.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
                    >
                      <Scissors className="size-4" /> Bearbeiten
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleExport}
                    className="flex items-center justify-center gap-2 control rounded-xl px-3 py-2.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
                  >
                    <Download className="size-4" /> Exportieren
                  </button>
                </div>
              </footer>
            </>
          )}
        </div>
      </section>
    </DialogPrimitive.Popup>
  )
}

/** Farbe des Status-Chips — Grün nur für Veröffentlicht, Blau für das, was läuft. */
const STATUS_TONE: Record<string, string> = {
  Entwurf: 'bg-white/[0.06] text-white/70 ring-white/[0.08]',
  'Export bereit': 'bg-primary/15 text-primary ring-primary/30',
  'In der Queue': 'bg-primary/15 text-primary ring-primary/30',
  Veröffentlicht: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/30',
}

/**
 * Der Score als Ring, in denselben Tönen wie auf den Clip-Karten: ab 90
 * grün, ab 70 bernstein, darunter neutral.
 */
function ScoreRing({ value }: { value: number }) {
  const radius = 25
  const length = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, value))
  const tone = value >= 90 ? 'text-emerald-500 dark:text-[#22c55e]' : value >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground/70'
  return (
    <span className={cn('relative flex size-16 shrink-0 items-center justify-center', tone)}>
      <svg viewBox="0 0 60 60" aria-hidden className="absolute inset-0 size-full -rotate-90">
        <circle cx="30" cy="30" r={radius} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="4.5" />
        <circle
          cx="30"
          cy="30"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray={`${(length * clamped) / 100} ${length}`}
        />
      </svg>
      <span className="font-display text-[22px] leading-none font-semibold tabular-nums">{value}</span>
    </span>
  )
}

/** Blättern auf der Bühne — nur auf großen Bildschirmen, sonst per Wischen im Grid. */
function StageArrow({ side, disabled, onClick }: { side: 'left' | 'right'; disabled: boolean; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'left' ? 'Vorheriger Clip' : 'Nächster Clip'}
      className={cn(
        'absolute top-1/2 z-30 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/[.08] text-white/70 ring-1 ring-white/10 backdrop-blur-md transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:pointer-events-none disabled:opacity-0 sm:flex',
        side === 'left' ? 'left-4' : 'right-4',
      )}
    >
      <Icon className="size-5" />
    </button>
  )
}

/**
 * Das Eingabefeld für den Titel. Enter und das Verlassen des Felds enden
 * beide hier — der Schutz verhindert, dass das Blur nach einem Enter ein
 * zweites Mal speichert.
 */
function TitleInput({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const [draft, setDraft] = useState(initial)
  const finished = useRef(false)
  const finish = (title: string | null) => {
    if (finished.current) return
    finished.current = true
    onDone(title?.trim() || null)
  }

  return (
    <input
      autoFocus
      aria-label="Titel des Clips"
      value={draft}
      maxLength={100}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(draft)}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Enter') {
          event.preventDefault()
          finish(draft)
        } else if (event.key === 'Escape') {
          event.stopPropagation()
          event.preventDefault()
          finish(null)
        }
      }}
      className="glass-field w-full rounded-lg px-2.5 py-1.5 text-sm leading-snug font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  )
}

/**
 * Das Transkript liest mit: Gesprochenes steht kräftig, das gerade
 * gesprochene Wort ist hinterlegt, Kommendes blass. Ein Klick auf ein Wort
 * springt dorthin. Im Untertitel ausgeblendete Wörter sind durchgestrichen.
 */
function LiveTranscript({
  words,
  removed,
  seconds,
  onSeek,
}: {
  words: TranscriptWord[]
  removed: number[]
  seconds: number
  onSeek: (seconds: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const removedSet = new Set(removed)
  let current = -1
  for (let i = 0; i < words.length; i++) {
    if (words[i].start <= seconds) current = i
    else break
  }

  useEffect(() => {
    const container = scrollRef.current
    const word = container?.querySelector<HTMLElement>(`[data-word="${current}"]`)
    if (!container || !word) return
    const top = word.offsetTop - container.offsetTop
    if (top < container.scrollTop || top > container.scrollTop + container.clientHeight - 40) {
      container.scrollTo({ top: Math.max(0, top - container.clientHeight / 3), behavior: 'smooth' })
    }
  }, [current])

  if (words.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/40">
        Zu diesem Clip gibt es kein Transkript.
      </p>
    )
  }

  return (
    <div ref={scrollRef} className="relative -mx-1 max-h-60 overflow-y-auto pr-2 lg:max-h-none lg:min-h-0 lg:flex-1">
      <p className="text-[14px] leading-[1.75] text-pretty">
        {words.map((word, index) => (
          <button
            key={index}
            type="button"
            tabIndex={-1}
            data-word={index}
            onClick={() => onSeek(word.start)}
            className={cn(
              'rounded-[5px] px-[0.18em] py-px transition-[color,background-color] duration-150',
              index === current
                ? 'bg-primary font-medium text-primary-foreground'
                : index < current
                  ? 'text-white/45 hover:bg-white/[0.06] hover:text-white/80'
                  : 'text-white/85 hover:bg-white/[0.06] hover:text-white',
              removedSet.has(index) && 'line-through opacity-45',
            )}
          >
            {word.word}
          </button>
        ))}
      </p>
    </div>
  )
}
