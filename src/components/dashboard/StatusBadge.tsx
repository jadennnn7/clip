import React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ProjectStatus } from '@/types/database'

const STATUS_CONFIG: Record<ProjectStatus, { label: string; className: string }> = {
  draft: { label: 'Entwurf', className: 'bg-muted text-muted-foreground' },
  queued: { label: 'In Warteschlange', className: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' },
  downloading: { label: 'Lädt herunter', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  transcribing: { label: 'Transkribiert', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  analyzing: { label: 'Analysiert', className: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  reframing: { label: 'Reframing', className: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  ready: { label: 'Fertig', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  error: { label: 'Fehler', className: 'bg-destructive/15 text-destructive' },
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge variant="secondary" className={cn('border-0 font-medium', config.className)}>
      {config.label}
    </Badge>
  )
}
