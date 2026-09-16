'use client'

import React, { useMemo } from 'react'
import type { Clip, ClipRenderStatus } from '@/types/database'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatTimecode } from './Timeline'

/**
 * Farbgebung des Viralitäts-Scores.
 *
 * Die Schwelle bei 80 ist nicht willkürlich: Das ist derselbe Default wie
 * `auto_publish_min_score` in der Datenbank. Ein grün markierter Clip ist also
 * genau der, den die Automatik ohne Rückfrage veröffentlichen würde.
 */
function scoreTone(score: number) {
  if (score >= 80) {
    return 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400'
  }
  if (score >= 65) {
    return 'bg-amber-500/10 text-amber-600 ring-amber-500/25 dark:text-amber-400'
  }
  return 'bg-muted text-muted-foreground ring-border'
}

const RENDER_STATUS: Record<ClipRenderStatus, { label: string; dot: string; pulse: boolean }> = {
  pending: { label: 'Wartet', dot: 'bg-muted-foreground/40', pulse: false },
  queued: { label: 'In Warteschlange', dot: 'bg-slate-500', pulse: false },
  rendering: { label: 'Rendert', dot: 'bg-blue-500', pulse: true },
  ready: { label: 'Fertig', dot: 'bg-emerald-500', pulse: false },
  error: { label: 'Fehler', dot: 'bg-destructive', pulse: false },
}

interface ClipListProps {
  clips: Clip[]
  activeClipId: string | null
  onSelect: (clipId: string) => void
}

export function ClipList({ clips, activeClipId, onSelect }: ClipListProps) {
  // Nach Viralitäts-Score sortiert — der stärkste Clip steht oben.
  const sorted = useMemo(
    () => [...clips].sort((a, b) => b.virality_score - a.virality_score),
    [clips],
  )

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1.5 p-2">
        {sorted.map((clip, index) => {
          const status = RENDER_STATUS[clip.render_status]
          const isActive = clip.id === activeClipId

          return (
            <button
              key={clip.id}
              type="button"
              onClick={() => onSelect(clip.id)}
              aria-current={isActive}
              className={cn(
                'transition-ui group relative w-full overflow-hidden rounded-lg border p-2.5 text-left',
                'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                isActive
                  ? 'border-border bg-accent'
                  : 'border-transparent hover:border-border hover:bg-accent/50',
              )}
            >
              {/* Leiste des aktiven Clips. Sie gleitet über `scale-y`, statt
                  zu erscheinen — ein Sprung an dieser Stelle lässt die Auswahl
                  hakelig wirken. */}
              <span
                aria-hidden
                className={cn(
                  'transition-ui absolute inset-y-1 left-0 w-0.5 origin-center rounded-full bg-primary',
                  isActive ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0',
                )}
              />

              <div className="flex items-start gap-2.5 pl-1.5">
                {/*
                  Der Score ist die wichtigste Information der Karte und
                  bekommt entsprechend Gewicht. Tabellarische Ziffern sind hier
                  richtig: Die Scores stehen untereinander und sollen beim
                  Überfliegen fluchten.
                */}
                <div
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
                    scoreTone(clip.virality_score),
                  )}
                >
                  <span className="text-lg leading-none font-semibold tabular-nums">
                    {clip.virality_score}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm leading-snug font-medium">{clip.title}</p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-mono tabular-nums">
                      {formatTimecode(clip.start_seconds)}–{formatTimecode(clip.end_seconds)}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">
                      {(clip.end_seconds - clip.start_seconds).toFixed(0)}s
                    </span>

                    <span className="ml-auto flex items-center gap-1.5">
                      <span className="relative flex size-1.5">
                        {status.pulse ? (
                          <span
                            className={cn(
                              'absolute inline-flex size-full animate-ping rounded-full opacity-70',
                              status.dot,
                            )}
                          />
                        ) : null}
                        <span
                          className={cn('relative inline-flex size-1.5 rounded-full', status.dot)}
                        />
                      </span>
                      {status.label}
                    </span>
                  </div>

                  {clip.hashtags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {clip.hashtags.slice(0, 3).map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="px-1.5 py-0 text-xs font-normal"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>

                <kbd className="transition-ui mt-0.5 rounded border bg-muted px-1 font-mono text-xs text-muted-foreground opacity-0 group-hover:opacity-100">
                  {index + 1}
                </kbd>
              </div>
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}
