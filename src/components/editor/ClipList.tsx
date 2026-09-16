'use client'

import React, { useMemo } from 'react'
import { Loader2, CircleAlert, CircleCheck, Clock } from 'lucide-react'
import type { Clip, ClipRenderStatus } from '@/types/database'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatTimecode } from './Timeline'

/**
 * Farbe des Viralitäts-Scores.
 *
 * Die Schwelle bei 80 ist nicht willkürlich: das ist derselbe Default wie
 * `auto_publish_min_score` in der Datenbank. Ein grün markierter Clip ist also
 * genau der, den die Automatik ohne Rückfrage veröffentlichen würde.
 */
function scoreTone(score: number) {
  if (score >= 80) return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30'
  if (score >= 65) return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/30'
  return 'bg-muted text-muted-foreground ring-border'
}

const RENDER_STATUS: Record<
  ClipRenderStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  pending: { label: 'Wartet', icon: Clock, className: 'text-muted-foreground' },
  queued: { label: 'In Warteschlange', icon: Clock, className: 'text-muted-foreground' },
  rendering: { label: 'Rendert', icon: Loader2, className: 'text-blue-500 animate-spin' },
  ready: { label: 'Fertig', icon: CircleCheck, className: 'text-emerald-500' },
  error: { label: 'Fehler', icon: CircleAlert, className: 'text-destructive' },
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
      <div className="flex flex-col gap-2 p-3">
        {sorted.map((clip, index) => {
          const status = RENDER_STATUS[clip.render_status]
          const StatusIcon = status.icon
          const isActive = clip.id === activeClipId

          return (
            <button
              key={clip.id}
              type="button"
              onClick={() => onSelect(clip.id)}
              aria-current={isActive}
              className={cn(
                'group w-full rounded-lg border p-3 text-left transition-colors',
                'hover:bg-accent/60 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                isActive ? 'border-primary bg-accent' : 'border-border bg-card',
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex size-11 shrink-0 flex-col items-center justify-center rounded-md ring-1 ring-inset',
                    scoreTone(clip.virality_score),
                  )}
                >
                  <span className="text-base leading-none font-bold tabular-nums">
                    {clip.virality_score}
                  </span>
                  <span className="text-[9px] leading-none opacity-70">Score</span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm leading-snug font-medium">{clip.title}</p>

                  <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono tabular-nums">
                      {formatTimecode(clip.start_seconds)}–{formatTimecode(clip.end_seconds)}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">
                      {(clip.end_seconds - clip.start_seconds).toFixed(0)}s
                    </span>
                    <span className="ml-auto flex items-center gap-1">
                      <StatusIcon className={cn('size-3', status.className)} />
                      <span className="sr-only">{status.label}</span>
                    </span>
                  </div>

                  {clip.hashtags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {clip.hashtags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>

                <kbd className="rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
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
