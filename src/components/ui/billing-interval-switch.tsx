'use client'

import { useId } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import type { BillingInterval } from '@/lib/stripe/plans'

const OPTIONS: { value: BillingInterval; label: string }[] = [
  { value: 'month', label: 'Monatlich' },
  { value: 'year', label: 'Jährlich' },
]

/**
 * Monatlich / Jährlich. Die gewählte Seite trägt den blauen Tropfen der
 * Hauptaktion, der beim Wechsel hinüberfedert; die Ersparnis steht direkt im
 * Jährlich-Knopf. Landing-Page und Abo-Seite nutzen denselben Schalter, die
 * Fläche dahinter bestimmt der Aufrufer (`className`).
 */
export function BillingIntervalSwitch({
  value,
  onChange,
  savingPercent,
  size = 'default',
  className,
  pillClassName,
}: {
  value: BillingInterval
  onChange: (value: BillingInterval) => void
  savingPercent: number
  size?: 'default' | 'sm'
  className?: string
  /** Zusatz für den Tropfen, z. B. `liquid-brand` auf der Landing-Page. */
  pillClassName?: string
}) {
  // Eigene layoutId je Schalter, sonst flöge der Tropfen zwischen zwei
  // Schaltern auf derselben Seite hin und her.
  const layoutId = useId()

  return (
    <div role="radiogroup" aria-label="Abrechnung" className={cn('relative inline-flex items-center gap-1 rounded-full p-1', className)}>
      {OPTIONS.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex items-center rounded-full font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring/60',
              size === 'sm' ? 'h-8 px-3.5 text-xs' : 'h-10 px-4 text-sm sm:h-11 sm:px-6',
              active ? 'text-white' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {active ? (
              // Rahmen und Tropfen getrennt: `.landing-root .liquid-brand`
              // setzt `position: relative` und schlüge sonst `absolute`.
              <motion.span
                layoutId={layoutId}
                aria-hidden
                className="absolute inset-0"
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              >
                <span className={cn('liquid block size-full rounded-full', pillClassName)} />
              </motion.span>
            ) : null}
            <span className="relative flex items-center gap-2">
              {option.label}
              {option.value === 'year' ? (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[0.6875rem] leading-tight font-semibold whitespace-nowrap transition-colors duration-200',
                    active ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary ring-1 ring-primary/30 ring-inset',
                  )}
                >
                  {savingPercent}&nbsp;% sparen
                </span>
              ) : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
