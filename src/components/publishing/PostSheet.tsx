'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { AlertTriangle, ArrowUpRight, CalendarClock, Check, ChevronLeft, ChevronRight, Copy, Film, Loader2, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { PlatformLogo } from '@/components/landing/PlatformLogo'
import { Dialog, DialogPortal } from '@/components/ui/dialog'
import { getPublishingStatus } from '@/lib/publishing-status'
import { PLATFORM_LABEL } from '@/lib/social-labels'
import { cn } from '@/lib/utils'
import type { PublishingAction } from '@/lib/publishing-client'
import type { PublishingJobSummary } from '@/types/publishing'
import type { Clip } from '@/types/database'

const DAY_MS = 86_400_000

/**
 * Ein Beitrag aus dem Kalender — für sich, nicht als Umweg in die Bibliothek.
 *
 * Links das Video, so wie es rausgeht (sobald es gerendert ist), rechts alles,
 * was an diesem einen Post hängt: wann, wohin, wie weit er ist, mit welchem
 * Text, und was jetzt zu tun ist. Zur Bibliothek führt nur noch ein kleiner
 * Link — wer bearbeiten will, geht bewusst dorthin.
 */
export function PostSheet({ jobs, order, jobId, clipFor, busy, onRun, onNavigate, onClose }: {
  /** Alle Aufträge: Ein gerade abgebrochener bleibt offen, obwohl er aus der Queue fällt. */
  jobs: PublishingJobSummary[]
  /** Reihenfolge wie in der Liste — zum Blättern. */
  order: PublishingJobSummary[]
  jobId: string | null
  clipFor: (job: PublishingJobSummary) => Clip | undefined
  busy: string | null
  onRun: (entries: PublishingJobSummary[], action: PublishingAction, key: string) => void
  onNavigate: (id: string) => void
  onClose: () => void
}) {
  const job = jobId ? jobs.find((candidate) => candidate.id === jobId) : undefined
  return (
    <Dialog open={Boolean(job)} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogPortal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm duration-200 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
        {job ? (
          <SheetBody
            key={job.id}
            job={job}
            clip={clipFor(job)}
            order={order}
            busy={busy}
            onRun={onRun}
            onNavigate={onNavigate}
            onClose={onClose}
          />
        ) : null}
      </DialogPortal>
    </Dialog>
  )
}

function SheetBody({ job, clip, order, busy, onRun, onNavigate, onClose }: {
  job: PublishingJobSummary
  clip?: Clip
  order: PublishingJobSummary[]
  busy: string | null
  onRun: (entries: PublishingJobSummary[], action: PublishingAction, key: string) => void
  onNavigate: (id: string) => void
  onClose: () => void
}) {
  // Beim Öffnen festgehalten — „in 3 Std." soll nicht bei jedem Polling springen.
  const [now] = useState(() => Date.now())
  const [copied, setCopied] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const status = getPublishingStatus(job, now)
  const date = new Date(job.publish_at)
  const index = order.findIndex((candidate) => candidate.id === job.id)
  const previous = index > 0 ? order[index - 1] : undefined
  const next = index >= 0 && index < order.length - 1 ? order[index + 1] : undefined
  const channel = job.platform ? PLATFORM_LABEL[job.platform] : 'Getrennter Kanal'
  const tiktok = job.platform === 'tiktok'
  const working = job.status === 'rendering' || job.status === 'publishing'
  const canCancel = ['needs_review', 'pending', 'failed'].includes(job.status)
  const duration = Math.max(0, Math.round(job.clip_end_seconds - job.clip_start_seconds))

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(job.caption)
      setCopied(true)
    } catch {
      toast.error('Kopieren nicht möglich', { description: 'Markiere den Text und kopiere ihn von Hand.' })
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if ((event.target as HTMLElement).closest('input, textarea, video')) return
    const key = event.key.toLowerCase()
    if ((key === 'arrowleft' || key === 'k') && previous) onNavigate(previous.id)
    else if ((key === 'arrowright' || key === 'j') && next) onNavigate(next.id)
    else return
    event.preventDefault()
  }

  return (
    <DialogPrimitive.Popup
      // Fokus auf die Fläche statt auf den ersten Knopf — sonst scrollt die
      // gestapelte Handy-Ansicht beim Öffnen am Video vorbei.
      initialFocus={panelRef}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 outline-none duration-200 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 sm:p-6"
      aria-labelledby="post-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section ref={panelRef} tabIndex={-1} className="dark flex max-h-[calc(100vh-24px)] outline-none w-full max-w-[960px] flex-col overflow-y-auto rounded-2xl bg-background text-foreground shadow-[0_40px_120px_-16px_rgba(0,0,0,.8)] ring-1 ring-border lg:h-[min(760px,calc(100vh-48px))] lg:flex-row lg:overflow-hidden">
        {/* ── Bühne: der Post, wie er rausgeht ─────────────────────── */}
        <div className="relative isolate flex min-w-0 flex-1 items-center justify-center overflow-hidden px-6 py-8 max-lg:flex-none lg:px-10">
          {clip?.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- nur Licht, unscharf
            <img src={clip.thumbnail_url} alt="" aria-hidden className="pointer-events-none absolute inset-0 -z-10 size-full scale-125 object-cover opacity-50 blur-3xl saturate-150" />
          ) : null}
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_70%_at_50%_45%,transparent,#0e0f11_95%)]" />

          <PostPreview job={job} clip={clip} />

          {order.length > 1 && index >= 0 ? (
            <>
              <span className="pointer-events-none absolute top-5 left-5 rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white/75 tabular-nums ring-1 ring-white/10 backdrop-blur-md">
                {index + 1} <span className="text-white/40">/ {order.length}</span>
              </span>
              <StageArrow side="left" disabled={!previous} onClick={() => previous && onNavigate(previous.id)} />
              <StageArrow side="right" disabled={!next} onClick={() => next && onNavigate(next.id)} />
            </>
          ) : null}
        </div>

        {/* ── Rechts: dieser eine Beitrag ──────────────────────────── */}
        <div className="flex w-full shrink-0 flex-col border-white/[.06] bg-white/[0.015] max-lg:border-t lg:w-[380px] lg:border-l">
          <header className="px-6 pt-5">
            <div className="flex items-center justify-between gap-3">
              <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-white/[.05] px-2.5 py-1 text-xs font-medium ring-1 ring-white/[.08] ring-inset', status.className)}>
                <span className={cn('size-1.5 rounded-full bg-current', working && 'animate-pulse')} />
                {status.label}
              </span>
              <DialogPrimitive.Close
                aria-label="Schließen"
                className="-mr-2 flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
            <h2 id="post-title" className="mt-4 line-clamp-3 text-lg leading-snug font-semibold tracking-[-.01em] text-balance">{job.title}</h2>
            <p className="mt-2 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
              {job.platform ? <PlatformLogo platform={job.platform} className="size-3.5 shrink-0" /> : null}
              <span className="truncate">{[channel, job.account_username].filter(Boolean).join(' · ')}</span>
            </p>
          </header>

          {/* Auf dem Handy scrollt die ganze Fläche, nicht dieser Bereich allein. */}
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6 max-lg:flex-none max-lg:overflow-visible">
            {/* Wann */}
            <div className="flex items-center gap-3 rounded-xl bg-white/[.04] px-4 py-3 ring-1 ring-white/[.06] ring-inset">
              <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-semibold tabular-nums">{scheduleLabel(date, now)}</p>
                <p className="text-xs text-muted-foreground">
                  {[job.status === 'published' ? 'Veröffentlicht' : job.status === 'cancelled' ? 'War geplant' : 'Geplant', relativeLabel(date, now)].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>

            {/* Wie weit */}
            <Steps job={job} label={status.label} />

            {['needs_review', 'action_required', 'failed'].includes(job.status) || job.next_retry_at ? (
              <p className={cn(
                'flex gap-2.5 rounded-xl p-3 text-xs leading-relaxed',
                job.status === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/[0.08] text-amber-200/90',
              )}>
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{status.detail}</span>
              </p>
            ) : null}

            {/* Mit welchem Text */}
            <section aria-labelledby="post-caption">
              <div className="mb-2 flex items-center justify-between">
                <h3 id="post-caption" className="text-xs font-medium text-white/45">Beschreibung</h3>
                {job.caption ? (
                  <button
                    type="button"
                    onClick={() => { void copyCaption() }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-white/[.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                    {copied ? 'Kopiert' : 'Kopieren'}
                  </button>
                ) : null}
              </div>
              {job.caption ? (
                <p className="max-h-40 overflow-y-auto rounded-xl bg-white/[.03] px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground/85 ring-1 ring-white/[.06] ring-inset">
                  {job.caption}
                </p>
              ) : (
                <p className="rounded-xl border border-dashed border-white/10 px-3.5 py-3 text-xs text-muted-foreground">Ohne Beschreibung.</p>
              )}
              {tiktok && job.caption ? (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  TikTok übernimmt den Text nicht automatisch — kopier ihn und füge ihn beim Posten in der App ein.
                </p>
              ) : null}
            </section>

            {/* Eckdaten */}
            <dl className="grid grid-cols-3 gap-2 text-center">
              <Fact label="Score" value={job.virality_score !== null ? String(job.virality_score) : '–'} />
              <Fact label="Länge" value={`${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`} />
              <Fact label="Versuche" value={String(job.attempt_count)} />
            </dl>
          </div>

          <footer className="space-y-2 border-t border-border bg-background px-6 py-5 empty:hidden max-lg:sticky max-lg:bottom-0">
            <PrimaryAction job={job} channel={channel} busy={busy} copied={copied} onCopy={() => { void copyCaption() }} onRun={onRun} />
            {canCancel || clip ? <div className="flex items-center justify-between gap-2">
              {canCancel ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => onRun([job], 'cancel', `cancel-${job.id}`)}
                  className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50"
                >
                  {busy === `cancel-${job.id}` ? <Loader2 className="mr-1.5 inline size-3 animate-spin" /> : null}
                  Nicht veröffentlichen
                </button>
              ) : <span />}
              {clip ? (
                <Link
                  href={`/dashboard/clips/${clip.project_id}?clip=${clip.id}`}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  Clip in der Bibliothek<ArrowUpRight className="size-3" />
                </Link>
              ) : null}
            </div> : null}
          </footer>
        </div>
      </section>
    </DialogPrimitive.Popup>
  )
}

/**
 * Hochkant wie im Feed. Ist das Video schon gerendert, läuft genau die Datei,
 * die hochgeladen wird; sonst steht das Standbild mit dem Hinweis, wann sie
 * entsteht.
 */
function PostPreview({ job, clip }: { job: PublishingJobSummary; clip?: Clip }) {
  const [videoFailed, setVideoFailed] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const playable = job.render_key !== null && !videoFailed
  const poster = clip?.thumbnail_url && !imageFailed ? clip.thumbnail_url : undefined
  const rendering = job.status === 'rendering'

  return (
    <div className="relative aspect-[9/16] h-[min(58vh,560px)] overflow-hidden rounded-2xl bg-black shadow-[0_30px_80px_-20px_rgba(0,0,0,.9)] ring-1 ring-white/10 lg:h-full lg:max-h-[640px]">
      {playable ? (
        <video
          src={`/api/publishing/${job.id}/preview`}
          poster={poster}
          controls
          playsInline
          loop
          preload="metadata"
          onError={() => setVideoFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <>
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element -- Vorschaubild aus dem Workspace, Größe fest
            <img src={poster} alt="" onError={() => setImageFailed(true)} className="size-full object-cover opacity-80" />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Film className="size-8 text-white/20" />
            </div>
          )}
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-xl bg-black/55 px-3 py-2.5 text-[11px] leading-snug text-white/80 ring-1 ring-white/10 backdrop-blur-md">
            {rendering ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : <Film className="size-3.5 shrink-0" />}
            {rendering ? 'Das Video wird gerade erstellt …'
              : job.render_key ? 'Die Videovorschau lässt sich gerade nicht laden.'
                : job.status === 'cancelled' ? 'Wurde nicht erstellt.'
                  : 'Das Video entsteht kurz vor dem Veröffentlichen — mit dem Stand von jetzt.'}
          </div>
        </>
      )}

      {job.platform ? (
        <span className="pointer-events-none absolute top-3 left-3 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full bg-black/45 py-1 pr-2.5 pl-1.5 text-[11px] font-medium text-white/90 ring-1 ring-white/10 backdrop-blur-md">
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-white/15">
            <PlatformLogo platform={job.platform} className="size-2.5" />
          </span>
          <span className="truncate">{job.account_username ?? PLATFORM_LABEL[job.platform]}</span>
        </span>
      ) : null}
    </div>
  )
}

type StepState = 'done' | 'active' | 'pending' | 'warn' | 'error'

/** Vier Stationen, dieselben, die der Worker durchläuft. */
function Steps({ job, label }: { job: PublishingJobSummary; label: string }) {
  const tiktok = job.platform === 'tiktok'
  const final = job.status === 'action_required' ? label : tiktok ? 'In TikTok posten' : 'Veröffentlicht'
  const first = job.status === 'needs_review' ? 'Wartet auf Freigabe' : job.status === 'cancelled' ? 'Abgebrochen' : 'Eingeplant'
  const failedAt = job.render_key ? 2 : 1
  const states: StepState[] = (() => {
    switch (job.status) {
      case 'needs_review': return ['warn', 'pending', 'pending', 'pending']
      case 'pending': return job.next_retry_at
        ? (failedAt === 2 ? ['done', 'done', 'warn', 'pending'] : ['done', 'warn', 'pending', 'pending'])
        : ['done', 'pending', 'pending', 'pending']
      case 'rendering': return ['done', 'active', 'pending', 'pending']
      case 'publishing': return ['done', 'done', 'active', 'pending']
      case 'published': return ['done', 'done', 'done', 'done']
      case 'action_required': return ['done', 'done', 'done', 'warn']
      case 'failed': return failedAt === 2 ? ['done', 'done', 'error', 'pending'] : ['done', 'error', 'pending', 'pending']
      case 'cancelled': return ['error', 'pending', 'pending', 'pending']
    }
  })()
  const labels = [first, 'Video erstellen', tiktok ? 'In Inbox laden' : 'Hochladen', final]

  return (
    <ol aria-label="Fortschritt" className="relative">
      {labels.map((text, index) => {
        const state = states[index]
        return (
          <li key={index} className="relative flex gap-3 pb-4 last:pb-0">
            {index < labels.length - 1 ? (
              <span aria-hidden className={cn('absolute top-5 bottom-0 left-[9px] w-px', state === 'done' ? 'bg-primary/50' : 'bg-white/10')} />
            ) : null}
            <StepMark state={state} />
            <span className={cn(
              'pt-px text-sm',
              state === 'pending' ? 'text-white/35' : state === 'error' ? 'text-destructive' : state === 'warn' ? 'text-amber-400' : 'text-foreground',
              state === 'active' && 'font-medium',
            )}>
              {text}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function StepMark({ state }: { state: StepState }) {
  const base = 'relative z-10 flex size-[19px] shrink-0 items-center justify-center rounded-full'
  if (state === 'done') return <span className={cn(base, 'bg-primary text-primary-foreground')}><Check className="size-3" strokeWidth={3} /></span>
  if (state === 'active') return <span className={cn(base, 'bg-background ring-1 ring-primary/60')}><Loader2 className="size-3 animate-spin text-primary" /></span>
  if (state === 'warn') return <span className={cn(base, 'bg-amber-500/15 ring-1 ring-amber-400/60')}><span className="size-1.5 rounded-full bg-amber-400" /></span>
  if (state === 'error') return <span className={cn(base, 'bg-destructive/15 ring-1 ring-destructive/60')}><X className="size-3 text-destructive" strokeWidth={3} /></span>
  return <span className={cn(base, 'bg-background ring-1 ring-white/15')} />
}

function PrimaryAction({ job, channel, busy, copied, onCopy, onRun }: {
  job: PublishingJobSummary
  channel: string
  busy: string | null
  copied: boolean
  onCopy: () => void
  onRun: (entries: PublishingJobSummary[], action: PublishingAction, key: string) => void
}) {
  const className = 'liquid flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-[transform,filter] duration-500 ease-spring hover:brightness-110 active:scale-[0.98] active:duration-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-background'
  const spinning = busy === job.id

  if (job.status === 'needs_review') {
    return (
      <button type="button" disabled={busy !== null} onClick={() => onRun([job], 'approve', job.id)} className={className}>
        {spinning ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Freigeben und veröffentlichen
      </button>
    )
  }
  if (job.status === 'failed') {
    return (
      <button type="button" disabled={busy !== null} onClick={() => onRun([job], 'retry', job.id)} className={className}>
        {spinning ? <Loader2 className="size-4 animate-spin" /> : null}Erneut versuchen
      </button>
    )
  }
  if (job.platform_post_url) {
    return (
      <a href={job.platform_post_url} target="_blank" rel="noreferrer" className={className}>
        Auf {channel} ansehen<ArrowUpRight className="size-4" />
      </a>
    )
  }
  // Der letzte Schritt passiert in der TikTok-App — dort braucht man genau den Text.
  if (job.platform === 'tiktok' && job.status === 'action_required' && job.caption) {
    return (
      <button type="button" onClick={onCopy} className={className}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? 'Text kopiert — jetzt in TikTok posten' : 'Text für TikTok kopieren'}
      </button>
    )
  }
  return null
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[.03] px-2 py-2.5 ring-1 ring-white/[.06] ring-inset">
      <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function StageArrow({ side, disabled, onClick }: { side: 'left' | 'right'; disabled: boolean; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'left' ? 'Vorheriger Beitrag' : 'Nächster Beitrag'}
      className={cn(
        'absolute top-1/2 z-20 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white/80 ring-1 ring-white/10 backdrop-blur-md transition hover:bg-black/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:pointer-events-none disabled:opacity-0',
        side === 'left' ? 'left-4' : 'right-4',
      )}
    >
      <Icon className="size-5" />
    </button>
  )
}

/** „Heute, 18:00", „Morgen, 09:00", sonst Wochentag und Datum. */
function scheduleLabel(date: Date, now: number) {
  const time = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  const days = calendarDays(date, now)
  const day = days === 0 ? 'Heute' : days === 1 ? 'Morgen' : days === -1 ? 'Gestern'
    : date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
  return `${day}, ${time}`
}

function calendarDays(date: Date, now: number) {
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  // Gerundet, weil Umstellungstage 23 oder 25 Stunden haben.
  return Math.round((start(date) - start(new Date(now))) / DAY_MS)
}

/** „in 3 Stunden", „vor 2 Tagen" — null, wo vorn schon „Morgen"/„Gestern" steht. */
function relativeLabel(date: Date, now: number) {
  const diff = date.getTime() - now
  const abs = Math.abs(diff)
  const format = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' })
  if (abs < 60_000) return 'jetzt'
  if (abs < 3_600_000) return format.format(Math.round(diff / 60_000), 'minute')
  if (abs < DAY_MS) return format.format(Math.round(diff / 3_600_000), 'hour')
  const days = calendarDays(date, now)
  return Math.abs(days) <= 1 ? null : format.format(days, 'day')
}
