import React from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  /** Primäre Aktion, rechtsbündig neben dem Titel. */
  action?: React.ReactNode
  className?: string
}

/**
 * Einheitlicher Seitenkopf.
 *
 * Vorher baute jede der vier Dashboard-Seiten ihre eigene Kopfzeile — mit
 * leicht abweichenden Größen und Abständen. Drei Pixel Unterschied sieht
 * niemand bewusst, aber die Summe solcher Abweichungen ist genau das, was ein
 * Interface unfertig wirken lässt.
 */
export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-8 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-prose text-sm text-pretty text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
