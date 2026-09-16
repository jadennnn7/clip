import React from 'react'
import { CalendarDays, Clock, CircleCheck, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { PLATFORM_LABEL } from '@/components/social/AccountCard'
import { PlatformIcon } from '@/components/social/PlatformIcon'
import { mockQueue, type QueueEntry } from '@/lib/mock-data'
import type { ScheduleStatus } from '@/types/database'
import { cn } from '@/lib/utils'

const STATUS_META: Record<
  ScheduleStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  needs_review: {
    label: 'Freigabe nötig',
    icon: TriangleAlert,
    className: 'text-amber-600 dark:text-amber-400',
  },
  pending: { label: 'Eingeplant', icon: Clock, className: 'text-muted-foreground' },
  publishing: { label: 'Wird gepostet', icon: Clock, className: 'text-blue-600 dark:text-blue-400' },
  published: {
    label: 'Veröffentlicht',
    icon: CircleCheck,
    className: 'text-emerald-600 dark:text-emerald-400',
  },
  failed: { label: 'Fehlgeschlagen', icon: TriangleAlert, className: 'text-destructive' },
  cancelled: { label: 'Abgebrochen', icon: TriangleAlert, className: 'text-muted-foreground' },
}

export default function CalendarPage() {
  const byDay = mockQueue.reduce<Record<string, QueueEntry[]>>((groups, entry) => {
    const day = new Date(entry.publishAt).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    })
    ;(groups[day] ??= []).push(entry)
    return groups
  }, {})

  const needsReview = mockQueue.filter((entry) => entry.status === 'needs_review').length

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <PageHeader
          title="Veröffentlichungs-Queue"
          description={
            needsReview > 0
              ? `${mockQueue.length} Einträge · ${needsReview} warten auf deine Freigabe, weil die Plattform keine Vollautomatik zulässt.`
              : `${mockQueue.length} Einträge, alle freigegeben.`
          }
          action={needsReview > 0 ? <Button size="sm">Alle freigeben</Button> : undefined}
        />

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
                {entries.map((entry) => {
                  const meta = STATUS_META[entry.status]
                  const Icon = meta.icon
                  return (
                    <div
                      key={entry.id}
                      className="transition-ui flex flex-wrap items-center gap-3 px-4 py-3.5 hover:bg-accent/40"
                    >
                      <span className="w-12 shrink-0 font-mono text-sm font-medium tabular-nums">
                        {new Date(entry.publishAt).toLocaleTimeString('de-DE', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>

                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/50">
                        <PlatformIcon
                          platform={entry.platform}
                          className="size-4 text-muted-foreground"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{entry.clipTitle}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {PLATFORM_LABEL[entry.platform]} · Score {entry.score}
                        </p>
                      </div>

                      <span
                        className={cn(
                          'flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap',
                          meta.className,
                        )}
                      >
                        <Icon className="size-3.5" />
                        {meta.label}
                      </span>

                      {entry.status === 'needs_review' ? (
                        <Button size="sm" variant="outline">
                          Freigeben
                        </Button>
                      ) : null}
                    </div>
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
