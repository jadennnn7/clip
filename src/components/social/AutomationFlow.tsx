import Link from 'next/link'
import { ArrowRight, ChevronRight, Link2, Scissors, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Was nach dem nächsten Link mit den Clips passiert — über alle Kanäle zusammengefasst. */
export type AutomationState = 'none' | 'manual' | 'review' | 'auto'

const STEPS = [
  { icon: Link2, title: 'Link einfügen', text: 'Videolink oder eigene Datei.' },
  { icon: Scissors, title: 'Clips erstellen', text: 'Schnitt, Untertitel und Score übernimmt Clyp.' },
  { icon: Send, title: 'Veröffentlichen', text: 'Pro Kanal nach deiner Regel: automatisch, nach Freigabe oder gar nicht.' },
] as const

const STATE_TEXT: Record<Exclude<AutomationState, 'auto'>, string> = {
  none: 'Neue Kanäle starten in der Freigabe-Queue. Ohne dein OK geht nichts online.',
  manual: 'Clyp erstellt nur Clips. Veröffentlicht wird nichts.',
  review: 'Neue Clips warten in der Queue auf deine Freigabe.',
}

/**
 * Der Ablauf in drei Schritten und darunter, wie weit er eingerichtet ist.
 *
 * Vorher standen hier zwei Kästen mit je einem Absatz — der Ablauf und
 * „Dein erster Kanal". Beides beantwortet dieselbe Frage: Was passiert nach
 * dem Link, und was fehlt noch dafür?
 */
export function AutomationFlow({ connected, total, state }: { connected: number; total: number; state: AutomationState }) {
  return (
    <section aria-label="So arbeitet Clyp" className="glass-tile overflow-hidden rounded-[1.5rem]">
      <ol className="grid sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="relative flex gap-3.5 border-foreground/[0.06] p-5 not-last:max-sm:border-b sm:p-6 sm:not-last:border-r"
          >
            <span className="glass-lens flex size-9 shrink-0 items-center justify-center rounded-xl">
              <step.icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[0.6875rem] font-medium tracking-[0.12em] text-muted-foreground uppercase tabular-nums">
                Schritt {index + 1}
              </p>
              <p className="mt-0.5 text-sm font-medium">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-pretty text-muted-foreground">{step.text}</p>
            </div>
            {index < STEPS.length - 1 ? (
              <span
                aria-hidden
                className="absolute top-1/2 right-0 z-10 hidden size-6 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-foreground/10 sm:flex"
              >
                <ChevronRight className="size-3.5" />
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-foreground/[0.06] bg-foreground/[0.02] px-5 py-3.5 sm:px-6">
        <p className="flex items-center gap-2.5 text-sm">
          <span
            aria-hidden
            className={cn(
              'size-2 rounded-full',
              state === 'auto' ? 'bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-500/20' : connected ? 'bg-foreground/60' : 'bg-foreground/25',
            )}
          />
          <span className="font-medium tabular-nums">{connected} von {total}</span>
          <span className="text-muted-foreground">Kanälen verbunden</span>
        </p>
        {state === 'auto' ? (
          <Link
            href="/dashboard#neu"
            className="transition-ui inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            Automatik bereit · nächsten Link einfügen
            <ArrowRight className="size-3" />
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground">{STATE_TEXT[state]}</p>
        )}
      </div>
    </section>
  )
}
