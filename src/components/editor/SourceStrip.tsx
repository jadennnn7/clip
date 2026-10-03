'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import type { WaveformData } from '@/types/editor'
import { cn } from '@/lib/utils'
import { IconButton } from './controls'

type DragTarget = 'start' | 'end' | 'scrub' | null

const HANDLE_HIT_PX = 12

/** Kontext links und rechts der Auswahl im eingepassten Modus. */
const FIT_PADDING_RATIO = 0.25

interface SourceStripProps {
  waveform: WaveformData
  /** Grenzen des aktiven Clips, in Sekunden der QUELLE. */
  trimStart: number
  trimEnd: number
  /** Herausgeschnittene Bereiche innerhalb des Clips, ebenfalls Quellsekunden. */
  gaps?: Array<[number, number]>
  /** Playhead-Position, ebenfalls in Quellsekunden. */
  currentTime: number
  onSeek: (sourceSeconds: number) => void
  onTrimChange: (start: number, end: number) => void
  className?: string
}

/**
 * Das ganze Quellvideo als Streifen — wo der Clip im Material liegt.
 *
 * Die Timeline darüber zeigt den fertigen Clip; hier sieht man, was davor
 * und danach kommt, und kann den Clip über seine bisherigen Grenzen hinaus
 * verlängern. Herausgeschnittene Stellen sind schraffiert.
 *
 * Zwei Ansichten, umschaltbar: die ganze Quelle oder eingepasst auf den Clip
 * plus etwas Kontext — ein 30-Sekunden-Clip in einer zehnminütigen Quelle
 * nähme sonst gerade fünf Prozent der Breite ein.
 *
 * Gezeichnet wird auf Canvas statt mit DOM-Elementen: Bei 1.800 Stützstellen
 * wären das 1.800 divs, die bei jedem Resize neu layoutet werden müssten.
 */
export function SourceStrip({
  waveform,
  trimStart,
  trimEnd,
  gaps = [],
  currentTime,
  onSeek,
  onTrimChange,
  className,
}: SourceStripProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 40 })
  const [drag, setDrag] = useState<DragTarget>(null)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [fit, setFit] = useState(false)

  const duration = waveform.duration || 1

  const { viewStart, viewEnd } = useMemo(() => {
    if (!fit) return { viewStart: 0, viewEnd: duration }
    const selection = Math.max(0.5, trimEnd - trimStart)
    const padding = selection * FIT_PADDING_RATIO
    return {
      viewStart: Math.max(0, trimStart - padding),
      viewEnd: Math.min(duration, trimEnd + padding),
    }
  }, [fit, trimStart, trimEnd, duration])

  const viewSpan = Math.max(0.001, viewEnd - viewStart)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Ohne DPR-Skalierung ist die Wellenform auf Retina-Displays unscharf.
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.width * dpr
    canvas.height = size.height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    /*
      Gelesen werden die BASIS-Tokens (--primary), nicht die Tailwind-Aliasse
      (--color-primary): `@theme inline` löst die Aliasse einmal auf `:root`
      auf, ein `.dark` weiter unten im Baum erreicht sie nicht mehr.
    */
    const styles = getComputedStyle(canvas)
    const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback
    const insideColor = read('--primary', '#e5e5e5')
    const outsideColor = read('--muted-foreground', '#a3a3a3')
    const scrimColor = read('--background', '#0a0a0a')

    const toX = (time: number) => ((time - viewStart) / viewSpan) * size.width
    ctx.clearRect(0, 0, size.width, size.height)

    const midY = size.height / 2
    const maxBar = size.height * 0.4
    const selStartX = toX(trimStart)
    const selEndX = toX(trimEnd)

    // Ein Balken pro Spalte; mehr Stützstellen als Pixel werden zum Maximum
    // zusammengefasst, damit laute Stellen nicht verschwinden.
    const barWidth = 2
    const gap = 1
    const columns = Math.floor(size.width / (barWidth + gap))
    const totalPeaks = waveform.peaks.length
    for (let column = 0; column < columns; column++) {
      const x = column * (barWidth + gap)
      const t0 = viewStart + (x / size.width) * viewSpan
      const t1 = viewStart + ((x + barWidth + gap) / size.width) * viewSpan
      const from = Math.max(0, Math.floor((t0 / duration) * totalPeaks))
      const to = Math.min(totalPeaks, Math.max(from + 1, Math.ceil((t1 / duration) * totalPeaks)))
      let peak = 0
      for (let i = from; i < to; i++) if (waveform.peaks[i] > peak) peak = waveform.peaks[i]
      const isInside = t0 >= trimStart && t0 <= trimEnd
      ctx.fillStyle = isInside ? insideColor : outsideColor
      ctx.globalAlpha = isInside ? 0.9 : 0.45
      const barHeight = Math.max(1.5, peak * maxBar)
      ctx.fillRect(x, midY - barHeight, barWidth, barHeight * 2)
    }
    ctx.globalAlpha = 1

    // Außerhalb abdunkeln, wie jedes Schnittprogramm es tut.
    ctx.globalAlpha = 0.6
    ctx.fillStyle = scrimColor
    ctx.fillRect(0, 0, Math.max(0, selStartX), size.height)
    ctx.fillRect(selEndX, 0, Math.max(0, size.width - selEndX), size.height)

    // Geschnittene Stellen: abgedunkelt und schraffiert.
    for (const [from, to] of gaps) {
      const x0 = toX(from)
      const x1 = toX(to)
      if (x1 - x0 < 0.5) continue
      ctx.globalAlpha = 0.55
      ctx.fillStyle = scrimColor
      ctx.fillRect(x0, 0, x1 - x0, size.height)
      ctx.save()
      ctx.beginPath()
      ctx.rect(x0, 0, x1 - x0, size.height)
      ctx.clip()
      ctx.globalAlpha = 0.35
      ctx.strokeStyle = outsideColor
      ctx.lineWidth = 1
      for (let x = x0 - size.height; x < x1; x += 5) {
        ctx.beginPath()
        ctx.moveTo(x, size.height)
        ctx.lineTo(x + size.height, 0)
        ctx.stroke()
      }
      ctx.restore()
    }
    ctx.globalAlpha = 1

    // Griffe mit Klammermarken — lesbar, auch wenn die Auswahl nur wenige Pixel breit ist.
    const bracket = 7
    for (const [x, dir] of [[selStartX, 1], [selEndX, -1]] as const) {
      ctx.fillStyle = insideColor
      ctx.fillRect(x - 1, 0, 2, size.height)
      ctx.fillRect(dir > 0 ? x : x - bracket, 0, bracket, 2)
      ctx.fillRect(dir > 0 ? x : x - bracket, size.height - 2, bracket, 2)
      ctx.beginPath()
      ctx.roundRect(x - 2.5, midY - 8, 5, 16, 2.5)
      ctx.fill()
    }

    const playheadX = toX(currentTime)
    ctx.fillStyle = read('--destructive', '#ef4444')
    ctx.fillRect(playheadX - 1, 0, 2, size.height)
  }, [size, waveform, trimStart, trimEnd, gaps, currentTime, duration, viewStart, viewSpan])

  const timeFromEvent = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return viewStart
    return Math.max(0, Math.min(duration, viewStart + ((clientX - rect.left) / rect.width) * viewSpan))
  }, [duration, viewStart, viewSpan])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = event.clientX - rect.left
    const startX = ((trimStart - viewStart) / viewSpan) * rect.width
    const endX = ((trimEnd - viewStart) / viewSpan) * rect.width
    let target: DragTarget = 'scrub'
    if (Math.abs(x - startX) <= HANDLE_HIT_PX) target = 'start'
    else if (Math.abs(x - endX) <= HANDLE_HIT_PX) target = 'end'
    setDrag(target)
    event.currentTarget.setPointerCapture(event.pointerId)
    if (target === 'scrub') onSeek(timeFromEvent(event.clientX))
  }, [trimStart, trimEnd, viewStart, viewSpan, onSeek, timeFromEvent])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const time = timeFromEvent(event.clientX)
    setHoverTime(time)
    if (!drag) return
    if (drag === 'scrub') onSeek(time)
    // Mindestlänge 0,5 s, sonst kann der Clip auf null kollabieren.
    else if (drag === 'start') onTrimChange(Math.min(time, trimEnd - 0.5), trimEnd)
    else onTrimChange(trimStart, Math.max(time, trimStart + 0.5))
  }, [drag, timeFromEvent, onSeek, onTrimChange, trimStart, trimEnd])

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    setDrag(null)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <span className="w-10 shrink-0 text-right font-mono text-[10px] text-muted-foreground tabular-nums">{formatSourceTime(viewStart)}</span>
      <div
        ref={containerRef}
        className={cn(
          'well relative h-full min-w-0 flex-1 cursor-pointer touch-none rounded-md border bg-card/60 select-none',
          drag === 'start' || drag === 'end' ? 'cursor-col-resize' : null,
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setHoverTime(null)}
        role="slider"
        aria-label="Quellvideo"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        tabIndex={0}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
        {hoverTime !== null && !drag ? (
          <div
            className="pointer-events-none absolute -top-6 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 font-mono text-[10px] text-background tabular-nums"
            style={{ left: `${((hoverTime - viewStart) / viewSpan) * 100}%` }}
          >
            {formatSourceTime(hoverTime)}
          </div>
        ) : null}
      </div>
      <span className="w-10 shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">{formatSourceTime(viewEnd)}</span>
      <IconButton
        icon={fit ? Minimize2 : Maximize2}
        label={fit ? 'Ganze Quelle zeigen' : 'Auf den Clip einpassen'}
        onClick={() => setFit((value) => !value)}
        pressed={fit}
      />
    </div>
  )
}

export function formatSourceTime(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
