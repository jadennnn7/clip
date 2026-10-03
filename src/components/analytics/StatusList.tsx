import { cn } from '@/lib/utils'
import type { QueueCount } from '@/types/analytics'
import type { PublishingStatus } from '@/types/publishing'

/**
 * Stand aller Veröffentlichungsaufträge. Farbe nur als kleiner Punkt und nur
 * dort, wo sie etwas bedeutet: ausstehend, veröffentlicht, fehlgeschlagen.
 */
const STAGES: Array<{ label: string; statuses: PublishingStatus[]; dot: string }> = [
  { label: 'Freigabe ausstehend', statuses: ['needs_review'], dot: 'bg-amber-500' },
  { label: 'Eingeplant', statuses: ['pending'], dot: 'bg-foreground/30' },
  { label: 'In Bearbeitung', statuses: ['rendering', 'publishing'], dot: 'bg-foreground/50' },
  { label: 'Veröffentlicht', statuses: ['published'], dot: 'bg-emerald-500' },
  { label: 'Hochgeladen, nicht öffentlich', statuses: ['action_required'], dot: 'bg-foreground/70' },
  { label: 'Fehlgeschlagen', statuses: ['failed'], dot: 'bg-destructive' },
]

export function StatusList({ queue }: { queue: QueueCount[] }) {
  const stages = STAGES.map((stage) => ({
    ...stage,
    count: queue.filter((entry) => stage.statuses.includes(entry.status)).reduce((sum, entry) => sum + entry.count, 0),
  }))
  const total = stages.reduce((sum, stage) => sum + stage.count, 0)

  return (
    <div className="px-4 py-3 sm:px-5">
      <div aria-hidden className="mb-3 flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-foreground/[0.06]">
        {stages.filter((stage) => stage.count > 0).map((stage) => (
          <span key={stage.label} className={cn('h-full', stage.dot)} style={{ flexGrow: stage.count }} />
        ))}
      </div>
      <dl className="flex flex-col">
        {stages.map((stage) => (
          <div key={stage.label} className="flex items-center gap-2.5 py-1.5 text-[13px]">
            <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', stage.dot, stage.count === 0 && 'opacity-40')} />
            <dt className={cn('min-w-0 flex-1 truncate', stage.count === 0 && 'text-muted-foreground')}>{stage.label}</dt>
            <dd className={cn('tabular-nums', stage.count === 0 ? 'text-muted-foreground' : 'font-medium')}>{stage.count}</dd>
          </div>
        ))}
      </dl>
      {total === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">Noch keine Veröffentlichungen geplant. Kanäle wählst du beim Hinzufügen eines Videos.</p>
      ) : null}
    </div>
  )
}
