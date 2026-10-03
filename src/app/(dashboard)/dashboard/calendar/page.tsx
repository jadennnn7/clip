'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { PublishingNotice } from '@/components/publishing/PublishingNotice'
import { PLATFORM_LABEL } from '@/lib/social-labels'
import { PlatformIcon } from '@/components/social/PlatformIcon'
import { changePublishingJob, usePublishingJobs, type PublishingAction, type PublishingJobSummary } from '@/lib/publishing-client'
import { getPublishingStatus } from '@/lib/publishing-status'
import { refreshPublishingQueue } from '@/stores/publishing-queue-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { cn } from '@/lib/utils'

/** Veröffentlicht oder abgebrochen: nichts mehr zu tun. */
const DONE_STATUSES: PublishingJobSummary['status'][] = ['published', 'cancelled']
const RECENT_LIMIT = 10

function dayLabel(value: string) {
  return new Date(value).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })
}

/**
 * Die Veröffentlichungs-Queue: jeder Auftrag mit Kanal, Zeitpunkt und Status,
 * nach Tagen sortiert — dieselben Aufträge, die der Worker abarbeitet. Darunter
 * die zuletzt veröffentlichten Clips.
 */
export default function CalendarPage() {
  const { data, error, loading, refresh } = usePublishingJobs()
  const clips = useWorkspaceStore((state) => state.clips)
  const [busy, setBusy] = useState<string | null>(null)

  const jobs = data?.jobs ?? []
  const queue = jobs.filter((job) => !DONE_STATUSES.includes(job.status))
    .sort((a, b) => a.publish_at.localeCompare(b.publish_at))
  const recent = jobs.filter((job) => job.status === 'published')
    .sort((a, b) => b.publish_at.localeCompare(a.publish_at)).slice(0, RECENT_LIMIT)
  const byDay = queue.reduce<Record<string, PublishingJobSummary[]>>((groups, job) => {
    ;(groups[dayLabel(job.publish_at)] ??= []).push(job)
    return groups
  }, {})

  const waiting = queue.filter((job) => job.status === 'needs_review')
  const needsReview = waiting.length

  const run = async (entries: PublishingJobSummary[], action: PublishingAction, key: string) => {
    setBusy(key)
    try {
      // Nacheinander: Jede Freigabe stößt einen Render an.
      for (const job of entries) await changePublishingJob(job.id, action)
      if (action === 'approve') toast.success(entries.length === 1 ? 'Freigegeben — der Clip wird jetzt veröffentlicht' : `${entries.length} Clips freigegeben`)
    } catch (cause) {
      toast.error('Aktion fehlgeschlagen', { description: cause instanceof Error ? cause.message : undefined })
    } finally {
      setBusy(null)
      refresh()
      void refreshPublishingQueue()
    }
  }

  const clipHref = (job: PublishingJobSummary) => {
    const clip = job.clip_id ? clips.find((candidate) => candidate.id === job.clip_id) : undefined
    return clip ? `/dashboard/clips/${clip.project_id}?clip=${clip.id}` : null
  }

  const row = (job: PublishingJobSummary, done = false) => {
    const status = getPublishingStatus(job)
    const href = clipHref(job)
    return (
      <div key={job.id} className="transition-ui flex flex-wrap items-center gap-3 px-4 py-3.5 hover:bg-accent/40">
        <span className="w-12 shrink-0 font-mono text-sm font-medium tabular-nums">
          {new Date(job.publish_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
        </span>

        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/50">
          {job.platform ? <PlatformIcon platform={job.platform} className="size-4 text-muted-foreground" /> : null}
        </div>

        <div className="min-w-0 flex-1">
          {href ? (
            <Link href={href} className="block truncate text-sm font-medium hover:underline">{job.title}</Link>
          ) : (
            <p className="truncate text-sm font-medium">{job.title}</p>
          )}
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[job.platform ? PLATFORM_LABEL[job.platform] : 'Getrennter Kanal', job.account_username,
              job.virality_score !== null ? `Score ${job.virality_score}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>

        <span title={status.detail} className={cn('shrink-0 text-xs whitespace-nowrap', status.className)}>
          {status.label}
        </span>

        {done && job.platform_post_url ? (
          <Button size="sm" variant="ghost" nativeButton={false} render={<a href={job.platform_post_url} target="_blank" rel="noreferrer" />}>
            Ansehen <ExternalLink className="size-3.5" />
          </Button>
        ) : null}
        {job.status === 'needs_review' ? (
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => { void run([job], 'approve', job.id) }}>
            Freigeben
          </Button>
        ) : null}
        {job.status === 'failed' ? (
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => { void run([job], 'retry', job.id) }}>
            Erneut versuchen
          </Button>
        ) : null}
        {['needs_review', 'pending', 'failed'].includes(job.status) ? (
          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => { void run([job], 'cancel', `cancel-${job.id}`) }}>
            Abbrechen
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <PageHeader
          title="Veröffentlichungs-Queue"
          description={
            needsReview > 0
              ? `${queue.length} ${queue.length === 1 ? 'Eintrag' : 'Einträge'} · ${needsReview} ${needsReview === 1 ? 'wartet' : 'warten'} auf deine Freigabe.`
              : queue.length > 0 ? `${queue.length} ${queue.length === 1 ? 'Eintrag' : 'Einträge'}, alle freigegeben.` : 'Noch nichts eingeplant.'
          }
          action={needsReview > 0 ? <Button size="sm" disabled={busy !== null} onClick={() => { void run(waiting, 'approve', 'all') }}>Alle freigeben</Button> : undefined}
        />

        <PublishingNotice error={error} configured={data?.configured} detail={data?.error} onRetry={refresh} />

        {!loading && !error && data?.configured !== false && queue.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed px-5 py-16 text-center">
            <CalendarDays className="mb-4 size-8 text-muted-foreground" />
            <h2 className="text-base font-medium">Die Queue ist leer</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">Öffne einen Clip und wähle „Veröffentlichen“ — eingeplante Clips erscheinen hier nach Tagen sortiert.</p>
            <Button className="mt-5" variant="outline" nativeButton={false} render={<Link href="/dashboard/clips" />}>Zur Clip-Bibliothek</Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-7">
          {Object.entries(byDay).map(([day, entries]) => (
            <section key={day}>
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="size-3.5 text-muted-foreground" />
                <h2 className="text-sm font-medium">{day}</h2>
                <span className="text-xs text-muted-foreground">
                  {entries.length} {entries.length === 1 ? 'Beitrag' : 'Beiträge'}
                </span>
              </div>

              {/* Eine zusammenhängende Liste statt einzelner Karten: Die
                  Einträge eines Tages gehören zusammen, und fünf separate
                  Karten pro Tag zerfasern die Seite. */}
              <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
                {entries.map((job) => row(job))}
              </div>
            </section>
          ))}
        </div>

        {recent.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-medium">Zuletzt veröffentlicht</h2>
            <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
              {recent.map((job) => row(job, true))}
            </div>
          </section>
        ) : null}
      </div>
    </ScrollArea>
  )
}
