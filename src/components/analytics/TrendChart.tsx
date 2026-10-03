'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatCount, niceTicks, TREND_METRICS, type Bucket, type TrendMetric } from './metrics'

const AXIS_WIDTH = '2.75rem'

/**
 * Säulen nach Veröffentlichungstag für eine Kennzahl. Eine Reihe, eine
 * Farbe, Hairline-Raster; Werte stehen an der Achse und im Tooltip. Ohne
 * Daten bleibt der Rahmen stehen — ein leeres Diagramm mit Achse ist
 * ehrlicher als eine Illustration.
 */
export function TrendChart({ buckets, metric, emptyTitle, emptyText, dimmed = false }: {
  buckets: Bucket[]
  metric: TrendMetric
  emptyTitle: string
  emptyText: string
  dimmed?: boolean
}) {
  const [active, setActive] = useState<number | null>(null)
  const label = TREND_METRICS.find((entry) => entry.value === metric)!.label
  const peak = Math.max(0, ...buckets.map((bucket) => bucket[metric]))
  const empty = buckets.every((bucket) => bucket.posts === 0)
  // Ohne Werte gibt es keine sinnvolle Skala: Raster ja, Beschriftung nur an der Null.
  const ticks = peak > 0 ? niceTicks(peak) : [0, 1, 2, 3, 4]
  const max = ticks[ticks.length - 1]
  // Fünf Datumsmarken, gleichmäßig verteilt, erste und letzte immer dabei.
  const tickEvery = Math.max(1, Math.ceil((buckets.length - 1) / 4))
  const current = active !== null ? buckets[active] : null
  const position = active !== null ? (active + 0.5) / buckets.length : 0
  const share = current ? current[metric] / max : 0

  return (
    <figure className={cn('transition-opacity duration-300', dimmed && 'opacity-50')}>
      <div className="relative h-60" style={{ paddingLeft: AXIS_WIDTH }}>
        {ticks.map((tick) => (
          <div
            key={tick}
            aria-hidden
            className={cn('absolute right-0 border-t', tick === 0 ? 'border-foreground/15' : 'border-foreground/[0.06]')}
            style={{ bottom: `${(tick / max) * 100}%`, left: AXIS_WIDTH }}
          >
            <span className="absolute -translate-y-1/2 pr-3 text-right text-[11px] text-muted-foreground tabular-nums" style={{ right: '100%', width: AXIS_WIDTH }}>
              {peak > 0 || tick === 0 ? formatCount(tick) : null}
            </span>
          </div>
        ))}

        <div className="absolute inset-y-0 right-0 flex items-end" style={{ left: AXIS_WIDTH }}>
          {buckets.map((bucket, index) => {
            const value = bucket[metric]
            return (
              <button
                key={bucket.start}
                type="button"
                disabled={empty}
                aria-label={`${bucket.label}: ${formatCount(value)} ${label}, ${bucket.posts} ${bucket.posts === 1 ? 'Clip' : 'Clips'} veröffentlicht`}
                onPointerEnter={() => setActive(index)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                className="relative flex h-full min-w-0 flex-1 items-end justify-center outline-none"
              >
                {active === index ? <span aria-hidden className="absolute inset-y-0 w-full bg-foreground/[0.04]" /> : null}
                {value > 0 ? (
                  <span
                    aria-hidden
                    className={cn('relative w-3/5 max-w-5 rounded-t-[3px] transition-colors', active === index ? 'bg-foreground' : 'bg-foreground/70')}
                    style={{ height: `max(${(value / max) * 100}%, 2px)` }}
                  />
                ) : null}
              </button>
            )
          })}
        </div>

        {empty ? (
          <div className="absolute inset-y-0 right-0 flex flex-col items-center justify-center px-6 text-center" style={{ left: AXIS_WIDTH }}>
            <p className="text-sm font-medium">{emptyTitle}</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">{emptyText}</p>
          </div>
        ) : null}

        {current && !empty ? (
          <div
            role="status"
            className="glass-menu pointer-events-none absolute z-10 w-44 rounded-lg px-3 py-2.5 text-xs"
            style={share > 0.6
              ? { left: `calc(${AXIS_WIDTH} + (100% - ${AXIS_WIDTH}) * ${position})`, top: `${(1 - share) * 100}%`, transform: position > 0.5 ? 'translateX(calc(-100% - 14px))' : 'translateX(14px)' }
              : { left: `calc(${AXIS_WIDTH} + (100% - ${AXIS_WIDTH}) * ${position})`, bottom: `calc(${share * 100}% + 12px)`, transform: `translateX(${position < 0.15 ? '-10%' : position > 0.85 ? '-90%' : '-50%'})` }}
          >
            <p className="text-muted-foreground">{current.label}</p>
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <span>{label}</span>
              <span className="font-semibold tabular-nums">{formatCount(current[metric])}</span>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-3 text-muted-foreground">
              <span>Veröffentlicht</span>
              <span className="tabular-nums">{current.posts}</span>
            </div>
          </div>
        ) : null}
      </div>

      <div aria-hidden className="mt-2 flex text-[11px] text-muted-foreground" style={{ paddingLeft: AXIS_WIDTH }}>
        {buckets.map((bucket, index) => {
          const last = index === buckets.length - 1
          const show = index === 0 || last || (index % tickEvery === 0 && buckets.length - 1 - index >= tickEvery / 2)
          return (
            <div key={bucket.start} className="relative h-4 min-w-0 flex-1">
              {show ? (
                <span className={cn('absolute top-0 whitespace-nowrap', index === 0 ? 'left-0' : last ? 'right-0' : 'left-1/2 -translate-x-1/2')}>
                  {bucket.tick}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </figure>
  )
}
