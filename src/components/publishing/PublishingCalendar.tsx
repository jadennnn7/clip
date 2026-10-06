'use client'

import React, { useState, useSyncExternalStore } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, CalendarClock, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { PlatformLogo } from '@/components/landing/PlatformLogo'
import { PostSheet } from '@/components/publishing/PostSheet'
import { PLATFORM_LABEL } from '@/lib/social-labels'
import { getPublishingStatus } from '@/lib/publishing-status'
import type { PublishingAction } from '@/lib/publishing-client'
import type { PublishingJobSummary } from '@/types/publishing'
import type { Clip, SocialPlatform } from '@/types/database'
import { cn } from '@/lib/utils'

/** Veröffentlicht oder abgebrochen: nichts mehr zu tun. */
const DONE_STATUSES: PublishingJobSummary['status'][] = ['published', 'cancelled']
const RECENT_LIMIT = 10
const DAY_MS = 86_400_000

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function fromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** Die Woche beginnt am Montag. */
function startOfWeek(date: Date) {
  return addDays(date, -((date.getDay() + 6) % 7))
}

function isoWeek(date: Date) {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7))
  return Math.ceil(((day.getTime() - Date.UTC(day.getUTCFullYear(), 0, 1)) / DAY_MS + 1) / 7)
}

/** „Heute", „Morgen", „Gestern" — sonst null. Gerundet, weil Umstellungstage 23 oder 25 Stunden haben. */
function relativeDay(date: Date, today: Date) {
  const diff = Math.round((fromKey(dayKey(date)).getTime() - today.getTime()) / DAY_MS)
  return diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : diff === -1 ? 'Gestern' : null
}

function scoreTone(score: number) {
  if (score >= 90) return 'text-emerald-500 dark:text-[#22c55e]'
  if (score >= 70) return 'text-amber-600 dark:text-amber-400'
  return 'text-foreground/70'
}

/**
 * Der heutige Tag aus der Uhr des Browsers. Auf dem Server null: Dessen
 * Zeitzone ist nicht die des Nutzers, und um Mitternacht widersprächen sich
 * Server- und Client-Render.
 */
const noSubscribe = () => () => {}
function useToday() {
  const key = useSyncExternalStore(noSubscribe, () => dayKey(new Date()), () => null)
  return key ? fromKey(key) : null
}

type Counts = Map<string, { planned: number; published: number }>

export interface PublishingCalendarProps {
  jobs: PublishingJobSummary[]
  clips: Clip[]
  loading: boolean
  /** Publishing erreichbar und eingerichtet — sonst zeigt `notice` den Grund, und die leere Queue entfällt. */
  ready: boolean
  notice?: React.ReactNode
  busy: string | null
  onRun: (entries: PublishingJobSummary[], action: PublishingAction, key: string) => void
}

/**
 * Kalender der Veröffentlichungen: oben die Woche auf einen Blick, darunter
 * die Queue nach Tagen — dieselben Aufträge, die der Worker abarbeitet — und
 * die zuletzt veröffentlichten Clips.
 */
export function PublishingCalendar({ jobs, clips, loading, ready, notice, busy, onRun }: PublishingCalendarProps) {
  const today = useToday()
  const [openId, setOpenId] = useState<string | null>(null)

  const queue = jobs.filter((job) => !DONE_STATUSES.includes(job.status))
    .sort((a, b) => a.publish_at.localeCompare(b.publish_at))
  const published = jobs.filter((job) => job.status === 'published')
    .sort((a, b) => b.publish_at.localeCompare(a.publish_at))
  const recent = published.slice(0, RECENT_LIMIT)

  const byDay = new Map<string, PublishingJobSummary[]>()
  for (const job of queue) {
    const key = dayKey(new Date(job.publish_at))
    byDay.set(key, [...(byDay.get(key) ?? []), job])
  }

  const counts: Counts = new Map()
  for (const job of [...queue, ...published]) {
    const key = dayKey(new Date(job.publish_at))
    const entry = counts.get(key) ?? { planned: 0, published: 0 }
    if (job.status === 'published') entry.published++
    else entry.planned++
    counts.set(key, entry)
  }

  const waiting = queue.filter((job) => job.status === 'needs_review')
  const entries = (count: number) => `${count} ${count === 1 ? 'Eintrag' : 'Einträge'}`
  const description = waiting.length > 0
    ? `${entries(queue.length)} · ${waiting.length} ${waiting.length === 1 ? 'wartet' : 'warten'} auf deine Freigabe.`
    : queue.length > 0 ? `${entries(queue.length)} offen.` : 'Keine offenen Veröffentlichungen.'

  const clipFor = (job: PublishingJobSummary) => job.clip_id ? clips.find((clip) => clip.id === job.clip_id) : undefined

  const scrollTo = (key: string) => {
    const target = document.getElementById(`day-${key}`) ?? document.getElementById('recent')
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const row = (job: PublishingJobSummary, done = false) => (
    <JobRow key={job.id} job={job} clip={clipFor(job)} done={done} today={today} busy={busy} onRun={onRun} onOpen={() => setOpenId(job.id)} />
  )

  return (
    <>
      <PageHeader
        title="Kalender"
        description={loading && !jobs.length ? 'Wird geladen …' : description}
        action={waiting.length > 0 ? (
          <Button variant="prominent" size="sm" className="rounded-full px-3.5" disabled={busy !== null} onClick={() => onRun(waiting, 'approve', 'all')}>
            Alle freigeben
          </Button>
        ) : undefined}
      />

      {notice}

      {today ? <WeekStrip today={today} counts={counts} onPick={scrollTo} /> : <div className="glass-tile h-[11.5rem] rounded-2xl" />}

      <div className="mt-10 flex flex-col gap-8">
        {loading && !jobs.length ? (
          <div role="status" aria-label="Queue wird geladen" className="glass-tile h-48 animate-pulse rounded-2xl" />
        ) : null}

        {!loading && ready && queue.length === 0 ? <EmptyQueue /> : null}

        {today ? [...byDay.entries()].map(([key, dayJobs]) => {
          const date = fromKey(key)
          const relative = relativeDay(date, today)
          const weekday = date.toLocaleDateString('de-DE', { weekday: 'long' })
          const dayMonth = date.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })
          return (
            <section key={key} id={`day-${key}`} aria-labelledby={`day-${key}-heading`} className="scroll-mt-6">
              <div className="mb-3 flex items-baseline gap-2 px-1">
                <h2 id={`day-${key}-heading`} className="text-base font-semibold tracking-tight">{relative ?? weekday}</h2>
                <span className="text-sm text-muted-foreground">{relative ? `${weekday}, ${dayMonth}` : dayMonth}</span>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {dayJobs.length} {dayJobs.length === 1 ? 'Beitrag' : 'Beiträge'}
                </span>
              </div>
              <ul className="glass-tile divide-y divide-foreground/[0.06] overflow-hidden rounded-2xl">
                {dayJobs.map((job) => row(job))}
              </ul>
            </section>
          )
        }) : null}

        {recent.length > 0 ? (
          <section id="recent" aria-labelledby="recent-heading" className="scroll-mt-6">
            <div className="mb-3 flex items-baseline gap-2 px-1">
              <h2 id="recent-heading" className="text-base font-semibold tracking-tight">Zuletzt veröffentlicht</h2>
              <span className="text-sm text-muted-foreground tabular-nums">{published.length}</span>
            </div>
            <ul className="glass-tile divide-y divide-foreground/[0.06] overflow-hidden rounded-2xl">
              {recent.map((job) => row(job, true))}
            </ul>
          </section>
        ) : null}
      </div>

      <PostSheet
        jobs={jobs}
        order={[...queue, ...recent]}
        jobId={openId}
        clipFor={clipFor}
        busy={busy}
        onRun={onRun}
        onNavigate={setOpenId}
        onClose={() => setOpenId(null)}
      />
    </>
  )
}

/**
 * Die Woche auf einen Blick. Punkte statt Zahlen: Wie voll ein Tag ist,
 * erfasst das Auge sofort; die genaue Zahl steht am Tag darunter.
 */
function WeekStrip({ today, counts, onPick }: { today: Date; counts: Counts; onPick: (key: string) => void }) {
  const [offset, setOffset] = useState(0)
  const start = addDays(startOfWeek(today), offset * 7)
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index))
  const end = days[6]
  const todayKey = dayKey(today)
  const range = start.getMonth() === end.getMonth()
    ? `${start.getDate()}.–${end.getDate()}. ${end.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}`
    : `${start.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <section aria-label="Wochenübersicht" className="glass-tile rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-tight">{range}</h2>
          <p className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums">KW {isoWeek(start)}</span>
            <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" />Offen</span>
            <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-foreground/30" />Veröffentlicht</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {offset !== 0 ? (
            <button type="button" onClick={() => setOffset(0)} className="control h-8 rounded-lg px-3 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              Heute
            </button>
          ) : null}
          <button type="button" aria-label="Vorherige Woche" onClick={() => setOffset(offset - 1)} className="control flex size-8 items-center justify-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" aria-label="Nächste Woche" onClick={() => setOffset(offset + 1)} className="control flex size-8 items-center justify-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <ol className="mt-5 grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((day) => {
          const key = dayKey(day)
          const { planned = 0, published = 0 } = counts.get(key) ?? {}
          const isToday = key === todayKey
          const past = day < today
          const dots = [...Array(Math.min(planned, 3)).fill('planned'), ...Array(Math.min(published, 3 - Math.min(planned, 3))).fill('published')]
          const rest = planned + published - dots.length
          const label = day.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
          return (
            <li key={key}>
              <button
                type="button"
                disabled={planned + published === 0}
                onClick={() => onPick(key)}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${label}: ${planned} offen, ${published} veröffentlicht`}
                className={cn(
                  'transition-ui flex w-full flex-col items-center gap-1.5 rounded-xl pt-2.5 pb-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 enabled:hover:bg-foreground/[0.05] disabled:cursor-default',
                  isToday && 'bg-primary/[0.08] ring-1 ring-primary/25 ring-inset enabled:hover:bg-primary/[0.12]',
                )}
              >
                <span className={cn('text-[0.6875rem] font-medium tracking-wide uppercase', isToday ? 'text-primary' : 'text-muted-foreground')}>
                  {day.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')}
                </span>
                <span className={cn('text-lg leading-none font-semibold tabular-nums', past && 'text-muted-foreground')}>{day.getDate()}</span>
                <span className="flex h-2 items-center gap-1" aria-hidden>
                  {dots.map((kind, index) => (
                    <span key={index} className={cn('size-1.5 rounded-full', kind === 'planned' ? 'bg-primary' : 'bg-foreground/30')} />
                  ))}
                  {rest > 0 ? <span className="text-[0.625rem] leading-none text-muted-foreground tabular-nums">+{rest}</span> : null}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function EmptyQueue() {
  return (
    <div className="glass-tile flex flex-col items-center rounded-2xl px-6 py-12 text-center">
      <span className="glass-lens flex size-12 items-center justify-center rounded-2xl">
        <CalendarClock className="size-5 text-primary" />
      </span>
      <h2 className="mt-5 text-base font-semibold tracking-tight">Nichts in der Queue</h2>
      <p className="mt-2 max-w-sm text-sm text-pretty text-muted-foreground">
        Veröffentliche einen Clip aus der Bibliothek — oder lass Ocuris neue Clips automatisch einplanen.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="prominent" className="rounded-full px-4" nativeButton={false} render={<Link href="/dashboard/clips" />}>
          Zur Clip-Bibliothek
        </Button>
        <Button variant="outline" className="rounded-full px-4" nativeButton={false} render={<Link href="/dashboard/connections" />}>
          Automatisierung einrichten
        </Button>
      </div>
    </div>
  )
}

function JobRow({ job, clip, done, today, busy, onRun, onOpen }: {
  job: PublishingJobSummary
  clip?: Clip
  done: boolean
  today: Date | null
  busy: string | null
  onRun: PublishingCalendarProps['onRun']
  onOpen: () => void
}) {
  const status = getPublishingStatus(job)
  const date = new Date(job.publish_at)
  const channel = job.platform ? PLATFORM_LABEL[job.platform] : 'Getrennter Kanal'
  const working = job.status === 'rendering' || job.status === 'publishing'

  return (
    <li className="transition-ui flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 hover:bg-foreground/[0.03] sm:px-5">
      {/* Die Zeile öffnet den Beitrag selbst (`PostSheet`) — nicht mehr die
          Bibliothek. Die Schnellaktionen rechts bleiben eigene Knöpfe. */}
      <button
        type="button"
        onClick={onOpen}
        className="group/open -my-1 -ml-2 flex min-w-0 flex-1 basis-64 cursor-pointer items-center gap-4 rounded-xl py-1 pl-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="block w-12 shrink-0">
          <span className="block font-mono text-sm font-medium tabular-nums">
            {date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {done ? (
            <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">
              {(today && relativeDay(date, today)) ?? date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
            </span>
          ) : null}
        </span>

        <Thumb clip={clip} platform={job.platform} />

        <span className="block min-w-0 flex-1">
          <span className="block truncate text-sm font-medium underline-offset-4 group-hover/open:underline">{job.title}</span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {job.platform ? <PlatformLogo platform={job.platform} className="size-3" /> : null}
            <span className="truncate">{[channel, job.account_username].filter(Boolean).join(' · ')}</span>
            {job.virality_score !== null ? (
              <>
                <span aria-hidden>·</span>
                <span className={cn('shrink-0 tabular-nums', scoreTone(job.virality_score))}>Score {job.virality_score}</span>
              </>
            ) : null}
          </span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground/0 transition-colors group-hover/open:text-muted-foreground" />
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span
          title={status.detail}
          className={cn('inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.04] px-2.5 py-1 text-xs font-medium whitespace-nowrap ring-1 ring-foreground/[0.08] ring-inset', status.className)}
        >
          <span className={cn('size-1.5 rounded-full bg-current', working && 'animate-pulse')} />
          {status.label}
        </span>

        {done && job.platform_post_url ? (
          <Button size="sm" variant="ghost" className="rounded-full" nativeButton={false} render={<a href={job.platform_post_url} target="_blank" rel="noreferrer" />}>
            Ansehen<ArrowUpRight className="size-3.5" />
          </Button>
        ) : null}
        {job.status === 'needs_review' ? (
          <Button size="sm" className="rounded-full px-3" disabled={busy !== null} onClick={() => onRun([job], 'approve', job.id)}>
            Freigeben
          </Button>
        ) : null}
        {job.status === 'failed' ? (
          <Button size="sm" variant="outline" className="rounded-full px-3" disabled={busy !== null} onClick={() => onRun([job], 'retry', job.id)}>
            Erneut versuchen
          </Button>
        ) : null}
        {['needs_review', 'pending', 'failed'].includes(job.status) ? (
          <Button
            size="icon-sm"
            variant="ghost"
            className="rounded-full text-muted-foreground"
            title="Auftrag abbrechen"
            aria-label={`${job.title} nicht veröffentlichen`}
            disabled={busy !== null}
            onClick={() => onRun([job], 'cancel', `cancel-${job.id}`)}
          >
            <X />
          </Button>
        ) : null}
      </div>
    </li>
  )
}

/** Hochkant wie der fertige Short; ohne Standbild das Zeichen der Plattform. */
function Thumb({ clip, platform }: { clip?: Clip; platform?: SocialPlatform }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="relative flex aspect-[9/16] w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-foreground/[0.06] ring-1 ring-foreground/10 ring-inset">
      {clip?.thumbnail_url && !failed ? (
        <Image src={clip.thumbnail_url} alt="" fill unoptimized sizes="32px" className="object-cover" onError={() => setFailed(true)} />
      ) : platform ? (
        <PlatformLogo platform={platform} className="size-3.5 text-muted-foreground" />
      ) : null}
    </span>
  )
}
