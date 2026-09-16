import React from 'react'
import { cn } from '@/lib/utils'
import type { ProjectStatus } from '@/types/database'

const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; dot: string; pulse: boolean }
> = {
  draft: { label: 'Entwurf', dot: 'bg-muted-foreground/50', pulse: false },
  queued: { label: 'In Warteschlange', dot: 'bg-slate-500', pulse: false },
  downloading: { label: 'Lädt herunter', dot: 'bg-blue-500', pulse: true },
  transcribing: { label: 'Transkribiert', dot: 'bg-blue-500', pulse: true },
  analyzing: { label: 'Analysiert', dot: 'bg-violet-500', pulse: true },
  reframing: { label: 'Reframing', dot: 'bg-violet-500', pulse: true },
  ready: { label: 'Fertig', dot: 'bg-emerald-500', pulse: false },
  error: { label: 'Fehler', dot: 'bg-destructive', pulse: false },
}

/**
 * Statusanzeige als Punkt plus Text.
 *
 * Vorher eine gefüllte Pille: In einer Tabelle mit fünf Zeilen entstehen daraus
 * fünf farbige Flächen, die um Aufmerksamkeit konkurrieren, obwohl der Status
 * die zweitwichtigste Information der Zeile ist.
 *
 * Die Farbe sitzt jetzt ausschließlich auf dem Punkt, der Text bleibt in der
 * normalen Schriftfarbe. Das hält die Tabelle ruhig und erfüllt zugleich die
 * Regel, dass Statusfarben nie allein stehen — die Bedeutung steht daneben.
 */
export function StatusBadge({ status }: { status: ProjectStatus }) {
  const config = STATUS_CONFIG[status]

  return (
    <span className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
      <span className="relative flex size-2 shrink-0">
        {/* Laufende Schritte pulsieren — ohne Bewegung ist „arbeitet gerade"
            optisch nicht von „wartet" zu unterscheiden. */}
        {config.pulse ? (
          <span
            className={cn(
              'absolute inline-flex size-full animate-ping rounded-full opacity-60',
              config.dot,
            )}
          />
        ) : null}
        <span className={cn('relative inline-flex size-2 rounded-full', config.dot)} />
      </span>
      {config.label}
    </span>
  )
}
