'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import type { WaveformData } from '@/types/editor'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type DragTarget = 'start' | 'end' | 'scrub' | null

const HANDLE_HIT_PX = 14

/** Kontext links und rechts der Auswahl im eingepassten Modus. */
const FIT_PADDING_RATIO = 0.25

interface TimelineProps {
  waveform: WaveformData
  /** Trim-Grenzen des aktiven Clips, in Sekunden der QUELLE. */
  trimStart: number
  trimEnd: number
  /** Playhead-Position, ebenfalls in Quellsekunden. */
  currentTime: number
  onSeek: (sourceSeconds: number) => void
  onTrimChange: (start: number, end: number) => void
  className?: string
}

/**
 * Timeline mit Wellenform, Trim-Griffen und Scrubbing.
 *
 * Zwei Ansichten, umschaltbar:
 *
 * - **Übersicht** — das gesamte Quellvideo. Zeigt, wo der Clip im Material
 *   liegt.
 * - **Eingepasst** — nur die Auswahl plus etwas Kontext. Notwendig, weil ein
 *   30-Sekunden-Clip in einer zehnminütigen Quelle gerade fünf Prozent der
 *   Breite einnimmt; auf dieser Skala lässt sich nicht sinnvoll trimmen.
 *
 * Gezeichnet wird auf Canvas statt mit DOM-Elementen: Bei 1.800 Stützstellen
 * wären das 1.800 divs, die bei jedem Resize neu layoutet werden müssten.
 */
export function Timeline({
  waveform,
  trimStart,
  trimEnd,
  currentTime,
  onSeek,
  onTrimChange,
  className,
}: TimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 96 })
  const [drag, setDrag] = useState<DragTarget>(null)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [fit, setFit] = useState(false)

  const duration = waveform.duration || 1

  // Sichtfenster. Im eingepassten Modus folgt es der Auswahl, bleibt aber
  // innerhalb der Quelle — sonst entstünde am Anfang und Ende leerer Raum.
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

  // --- Größe beobachten ----------------------------------------------------
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // --- Zeichnen ------------------------------------------------------------
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

    const styles = getComputedStyle(canvas)
    const read = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback

    /*
      Gelesen werden die BASIS-Tokens (--primary), nicht die Tailwind-Aliasse
      (--color-primary).

      `@theme inline` löst `--color-primary: var(--primary)` ein einziges Mal
      auf `:root` auf. Ein `.dark` weiter unten im Baum — wie das Editor-Layout
      es setzt — erreicht diese Aliasse nicht mehr: sie liefern dauerhaft die
      Hellmodus-Werte. Die Basis-Tokens dagegen werden von `.dark` neu
      deklariert und vererben sich normal.

      Sichtbar wurde das daran, dass die Wellenform im dunklen Editor in
      Beinahe-Schwarz auf Beinahe-Schwarz gezeichnet wurde.
    */
    const insideColor = read('--primary', '#0f172a')
    const outsideColor = read('--muted-foreground', '#94a3b8')
    const scrimColor = read('--background', '#ffffff')

    const toX = (time: number) => ((time - viewStart) / viewSpan) * size.width

    ctx.clearRect(0, 0, size.width, size.height)

    const midY = size.height / 2
    const maxBar = size.height * 0.42

    const selStartX = toX(trimStart)
    const selEndX = toX(trimEnd)

    // Wellenform. Ein Balken pro Pixelspalte — mehr Stützstellen als Pixel
    // werden zum Maximum zusammengefasst, damit laute Stellen nicht verschwinden.
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
      for (let i = from; i < to; i++) {
        if (waveform.peaks[i] > peak) peak = waveform.peaks[i]
      }

      const isInside = t0 >= trimStart && t0 <= trimEnd
      ctx.fillStyle = isInside ? insideColor : outsideColor
      ctx.globalAlpha = isInside ? 1 : 0.55

      const barHeight = Math.max(2, peak * maxBar)
      ctx.fillRect(x, midY - barHeight, barWidth, barHeight * 2)
    }
    ctx.globalAlpha = 1

    /*
      Statt die Auswahl aufzuhellen wird alles AUSSERHALB abgedunkelt — so
      handhabt es jedes Schnittprogramm. Eine aufgehellte Auswahl überstrahlt
      die Wellenform genau dort, wo man sie am genauesten sehen muss.

      Der Schleier nimmt die Hintergrundfarbe der Seite: im Hellen weiß
      (wäscht aus), im Dunklen fast schwarz (dunkelt ab). Beides dimmt.
    */
    ctx.globalAlpha = 0.6
    ctx.fillStyle = scrimColor
    ctx.fillRect(0, 0, Math.max(0, selStartX), size.height)
    ctx.fillRect(selEndX, 0, Math.max(0, size.width - selEndX), size.height)
    ctx.globalAlpha = 1

    // Trim-Griffe mit Klammermarken. Die waagerechten Marken machen die
    // Auswahl auch dann noch lesbar, wenn sie in der Übersicht nur wenige
    // Pixel breit ist.
    const bracket = 10
    for (const [x, dir] of [
      [selStartX, 1],
      [selEndX, -1],
    ] as const) {
      ctx.fillStyle = insideColor
      ctx.fillRect(x - 1, 0, 2, size.height)
      ctx.fillRect(dir > 0 ? x : x - bracket, 0, bracket, 2)
      ctx.fillRect(dir > 0 ? x : x - bracket, size.height - 2, bracket, 2)
      // Griff in der Mitte, damit klar ist, wo gezogen werden kann.
      ctx.beginPath()
      ctx.roundRect(x - 3, midY - 13, 6, 26, 3)
      ctx.fill()
    }

    // Playhead.
    const playheadX = toX(currentTime)
    ctx.fillStyle = '#ef4444'
    ctx.fillRect(playheadX - 1, 0, 2, size.height)
    ctx.beginPath()
    ctx.moveTo(playheadX - 5, 0)
    ctx.lineTo(playheadX + 5, 0)
    ctx.lineTo(playheadX, 7)
    ctx.closePath()
    ctx.fill()
  }, [size, waveform, trimStart, trimEnd, currentTime, duration, viewStart, viewEnd, viewSpan])

  // --- Interaktion ---------------------------------------------------------
  const timeFromEvent = useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return viewStart
      const ratio = (clientX - rect.left) / rect.width
      return Math.max(0, Math.min(duration, viewStart + ratio * viewSpan))
    },
    [duration, viewStart, viewSpan],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
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
    },
    [trimStart, trimEnd, viewStart, viewSpan, onSeek, timeFromEvent],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const time = timeFromEvent(event.clientX)
      setHoverTime(time)

      if (!drag) return

      if (drag === 'scrub') {
        onSeek(time)
      } else if (drag === 'start') {
        // Mindestlänge 0,5 s, sonst kann der Clip auf null kollabieren.
        onTrimChange(Math.min(time, trimEnd - 0.5), trimEnd)
      } else {
        onTrimChange(trimStart, Math.max(time, trimStart + 0.5))
      }
    },
    [drag, timeFromEvent, onSeek, onTrimChange, trimStart, trimEnd],
  )

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    setDrag(null)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        ref={containerRef}
        className={cn(
          'well transition-ui relative h-24 w-full cursor-pointer touch-none rounded-lg border bg-card select-none',
          drag === 'start' || drag === 'end' ? 'cursor-col-resize' : null,
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setHoverTime(null)}
        role="slider"
        aria-label="Timeline"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        tabIndex={0}
      >
        <canvas ref={canvasRef} className="h-full w-full" />

        {hoverTime !== null && !drag ? (
          <div
            className="pointer-events-none absolute top-1.5 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 font-mono text-xs text-background tabular-nums"
            style={{ left: `${((hoverTime - viewStart) / viewSpan) * 100}%` }}
          >
            {formatTimecode(hoverTime)}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 px-0.5 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">{formatTimecode(viewStart)}</span>

        <div className="flex items-center gap-2">
          <span className="tabular-nums">
            Auswahl {formatTimecode(trimStart)}–{formatTimecode(trimEnd)} (
            {(trimEnd - trimStart).toFixed(1)}s)
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setFit((value) => !value)}
            aria-label={fit ? 'Ganze Quelle zeigen' : 'Auf Auswahl einpassen'}
            aria-pressed={fit}
          >
            {fit ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
          </Button>
        </div>

        <span className="font-mono tabular-nums">{formatTimecode(viewEnd)}</span>
      </div>
    </div>
  )
}

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
