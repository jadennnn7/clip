import React from 'react'
import { CalendarDays, Clock, CircleCheck, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PLATFORM_LABEL } from '@/components/social/AccountCard'
import type { ScheduleStatus, SocialPlatform } from '@/types/database'

interface QueueEntry {
  id: string
  clipTitle: string
  score: number
  platform: SocialPlatform
  publishAt: string
  status: ScheduleStatus
}

// Phase 2: SELECT aus posting_schedules JOIN clips JOIN social_accounts,
// gefiltert über RLS auf den eingeloggten Nutzer.
const queue: QueueEntry[] = [
  {
    id: 'ps-1',
    clipTitle: 'Der wahre Grund, warum 90% aller Creator aufgeben',
    score: 94,
    platform: 'youtube',
    publishAt: '2026-09-15T17:00:00.000Z',
    status: 'pending',
  },
  {
    id: 'ps-2',
    clipTitle: 'Der wahre Grund, warum 90% aller Creator aufgeben',
    score: 94,
    platform: 'tiktok',
    publishAt: '2026-09-15T19:30:00.000Z',
    status: 'needs_review',
  },
  {
    id: 'ps-3',
    clipTitle: 'Diese eine Frage hat mein Business verändert',
    score: 88,
    platform: 'youtube',
    publishAt: '2026-09-16T12:00:00.000Z',
    status: 'pending',
  },
  {
    id: 'ps-4',
    clipTitle: 'Warum dein Content niemanden erreicht',
    score: 83,
    platform: 'instagram',
    publishAt: '2026-09-14T18:00:00.000Z',
    status: 'published',
  },
  {
    id: 'ps-5',
    clipTitle: 'Der teuerste Fehler meiner Selbstständigkeit',
    score: 79,
    platform: 'youtube',
    publishAt: '2026-09-14T09:00:00.000Z',
    status: 'failed',
  },
]

const STATUS_META: Record<
  ScheduleStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  needs_review: {
    label: 'Freigabe nötig',
    icon: TriangleAlert,
    className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  pending: { label: 'Eingeplant', icon: Clock, className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  publishing: { label: 'Wird gepostet', icon: Clock, className: 'bg-blue-500/15 text-blue-600' },
  published: {
    label: 'Veröffentlicht',
    icon: CircleCheck,
    className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  failed: { label: 'Fehlgeschlagen', icon: TriangleAlert, className: 'bg-destructive/15 text-destructive' },
  cancelled: { label: 'Abgebrochen', icon: TriangleAlert, className: 'bg-muted text-muted-foreground' },
}

export default function CalendarPage() {
  const byDay = queue.reduce<Record<string, QueueEntry[]>>((groups, entry) => {
    const day = new Date(entry.publishAt).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    })
    ;(groups[day] ??= []).push(entry)
    return groups
  }, {})

  const needsReview = queue.filter((entry) => entry.status === 'needs_review').length

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Veröffentlichungs-Queue</h1>
            <p className="text-sm text-muted-foreground">
              {queue.length} Einträge
              {needsReview > 0 ? ` · ${needsReview} warten auf Freigabe` : null}
            </p>
          </div>
          {needsReview > 0 ? <Button size="sm">Alle freigeben</Button> : null}
        </div>

        <div className="flex flex-col gap-6">
          {Object.entries(byDay).map(([day, entries]) => (
            <section key={day}>
              <div className="mb-2 flex items-center gap-2">
                <CalendarDays className="size-3.5 text-muted-foreground" />
                <h2 className="text-sm font-medium">{day}</h2>
              </div>

              <div className="flex flex-col gap-2">
                {entries.map((entry) => {
                  const meta = STATUS_META[entry.status]
                  const Icon = meta.icon
                  return (
                    <Card key={entry.id}>
                      <CardContent className="flex flex-wrap items-center gap-3 py-3">
                        <span className="w-12 shrink-0 font-mono text-sm tabular-nums">
                          {new Date(entry.publishAt).toLocaleTimeString('de-DE', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{entry.clipTitle}</p>
                          <p className="text-xs text-muted-foreground">
                            {PLATFORM_LABEL[entry.platform]} · Score {entry.score}
                          </p>
                        </div>

                        <Badge variant="secondary" className={`gap-1 border-0 ${meta.className}`}>
                          <Icon className="size-3" />
                          {meta.label}
                        </Badge>

                        {entry.status === 'needs_review' ? (
                          <Button size="sm" variant="outline">
                            Freigeben
                          </Button>
                        ) : null}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </ScrollArea>
  )
}
