import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Die eine Kartenform der Analytics-Seite: gleicher Radius, gleiche Kopfzeile,
 * gleiche Innenabstände. Einheitlichkeit ist hier das, was seriös wirkt —
 * jede Abweichung liest sich als Zufall.
 */
export function Panel({ title, description, action, children, className, id }: {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section aria-labelledby={title ? id : undefined} className={cn('glass-tile flex min-w-0 flex-col rounded-xl', className)}>
      {title ? (
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-foreground/[0.06] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={id} className="text-sm font-medium">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}

export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: Array<{ value: T; label: ReactNode; ariaLabel?: string }>
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          aria-label={option.ariaLabel}
          onClick={() => onChange(option.value)}
          className={cn(
            'transition-ui inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            value === option.value ? 'glass-lens font-medium text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
