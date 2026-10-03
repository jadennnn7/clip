'use client'

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { cn } from '@/lib/utils'
import type { PostAnalytics } from '@/types/analytics'
import { formatCount } from './metrics'

const HEIGHT = 240
const PAD = { top: 24, right: 14, bottom: 46, left: 46 }
/** Treffradius um jeden Punkt — ein 10-px-Punkt allein trifft niemand zuverlässig. */
const HIT_RADIUS = 24

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * Virality-Score gegen echte Aufrufe. Aufrufe logarithmisch: Ein Ausreißer
 * mit 50.000 würde sonst alle anderen Punkte an die Grundlinie drücken.
 */
export function ScoreScatter({ posts, dimmed = false }: { posts: PostAnalytics[]; dimmed?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<string | null>(null)
  const points = posts.filter((post) => post.views !== null)

  const minScore = Math.min(50, Math.floor(Math.min(...points.map((post) => post.viralityScore)) / 10) * 10)
  const maxExponent = Math.max(2, Math.ceil(Math.log10(Math.max(10, ...points.map((post) => post.views!)))))
  const plotWidth = Math.max(0, width - PAD.left - PAD.right)
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const x = (score: number) => PAD.left + ((score - minScore) / (100 - minScore)) * plotWidth
  const y = (views: number) => PAD.top + plotHeight - (Math.log10(Math.max(1, views)) / maxExponent) * plotHeight
  const xTicks = Array.from({ length: (100 - minScore) / 10 + 1 }, (_, index) => minScore + index * 10)
  const yTicks = Array.from({ length: maxExponent + 1 }, (_, index) => 10 ** index)

  const placed = points.map((post) => ({ post, cx: x(post.viralityScore), cy: y(post.views!) }))
  const current = placed.find((point) => point.post.jobId === active) ?? null

  function nearest(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const px = event.clientX - box.left
    const py = event.clientY - box.top
    let best: { id: string; distance: number } | null = null
    for (const point of placed) {
      const distance = Math.hypot(point.cx - px, point.cy - py)
      if (distance <= HIT_RADIUS && (!best || distance < best.distance)) best = { id: point.post.jobId, distance }
    }
    setActive(best?.id ?? null)
  }

  return (
    <div ref={ref} className={cn('relative transition-opacity duration-300', dimmed && 'opacity-55')}>
      {width > 0 ? (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Streudiagramm: Virality-Score und Aufrufe von ${points.length} Clips`}
          onPointerMove={nearest}
          onPointerLeave={() => setActive(null)}
          className="block overflow-visible"
        >
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-foreground/[0.07]" />
              <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px]">
                {formatCount(tick)}
              </text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <text key={tick} x={x(tick)} y={HEIGHT - 26} textAnchor="middle" className="fill-muted-foreground text-[11px]">
              {tick}
            </text>
          ))}
          <text x={PAD.left + plotWidth / 2} y={HEIGHT - 4} textAnchor="middle" className="fill-muted-foreground text-[11px]">Virality-Score</text>
          <text x={0} y={10} className="fill-muted-foreground text-[11px]">Aufrufe</text>
          <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotHeight} y2={PAD.top + plotHeight} className="stroke-foreground/15" />

          {placed.map(({ post, cx, cy }) => (
            <circle
              key={post.jobId}
              cx={cx}
              cy={cy}
              r={active === post.jobId ? 7 : 5}
              strokeWidth={2}
              className={cn(
                'stroke-[var(--ambient-base)] transition-[r,fill] duration-200',
                active === post.jobId ? 'fill-foreground' : active ? 'fill-foreground/35' : 'fill-foreground/70',
              )}
            />
          ))}
        </svg>
      ) : (
        <div style={{ height: HEIGHT }} />
      )}

      {current ? (
        <div
          role="status"
          className="glass-menu pointer-events-none absolute z-10 w-52 rounded-lg px-3 py-2.5"
          style={{
            left: current.cx,
            top: current.cy - 12,
            transform: `translate(${current.cx < width * 0.25 ? '-10%' : current.cx > width * 0.75 ? '-90%' : '-50%'}, -100%)`,
          }}
        >
          <p className="line-clamp-2 text-xs leading-snug font-medium">{current.post.title}</p>
          <div className="mt-2 flex items-baseline gap-4 border-t border-foreground/10 pt-2">
            <p><span className="text-sm font-semibold tabular-nums">{formatCount(current.post.views)}</span> <span className="text-[11px] text-muted-foreground">Aufrufe</span></p>
            <p><span className="text-sm font-semibold tabular-nums">{current.post.viralityScore}</span> <span className="text-[11px] text-muted-foreground">Score</span></p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
