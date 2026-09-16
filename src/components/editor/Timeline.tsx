'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { WaveformData } from '@/types/editor'
import { cn } from '@/lib/utils'

type DragTarget = 'start' | 'end' | 'scrub' | null

const HANDLE_HIT_PX = 12

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
 * Timeline mit Wellenform, Trim-Handles und Scrubbing.
 *
 * Die Timeline zeigt immer das GESAMTE Quellvideo; der aktive Clip ist als
 * heller Bereich mit Handles darin markiert. Das ist das Modell, das Nutzer aus
 * Premiere und Final Cut kennen: die Spur ist die Quelle, die Auswahl ist der
 * Ausschnitt.
 *
 * Gezeichnet wird auf Canvas statt mit DOM-Elementen: bei 1.800 Peaks wären das
 * 1.800 divs, die bei jedem Resize neu layoutet werden müssten.
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

  const duration = waveform.duration || 1

  // --- Größe beobachten ----------------------------------------------------
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
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

    const insideColor = read('--color-primary', '#0f172a')
    const outsideColor = read('--color-muted-foreground', '#94a3b8')
    const selectionBg = read('--color-accent', '#e2e8f0')

    ctx.clearRect(0, 0, size.width, size.height)

    const midY = size.height / 2
    const maxBar = size.height * 0.44

    // Auswahlbereich hinterlegen.
    const selStartX = (trimStart / duration) * size.width
    const selEndX = (trimEnd / duration) * size.width
    ctx.globalAlpha = 0.45
    ctx.fillStyle = selectionBg
    ctx.fillRect(selStartX, 0, Math.max(1, selEndX - selStartX), size.height)
    ctx.globalAlpha = 1

    // Wellenform. Ein Balken pro Pixelspalte — mehr Peaks als Pixel werden
    // zum Maximum zusammengefasst, damit laute Stellen nicht verschwinden.
    const barWidth = 2
    const gap = 1
    const columns = Math.floor(size.width / (barWidth + gap))
    const peaksPerColumn = Math.max(1, Math.floor(waveform.peaks.length / columns))

    for (let column = 0; column < columns; column++) {
      let peak = 0
      const from = column * peaksPerColumn
      for (let i = from; i < from + peaksPerColumn && i < waveform.peaks.length; i++) {
        if (waveform.peaks[i] > peak) peak = waveform.peaks[i]
      }

      const x = column * (barWidth + gap)
      const columnTime = (x / size.width) * duration
      const isInside = columnTime >= trimStart && columnTime <= trimEnd

      ctx.fillStyle = isInside ? insideColor : outsideColor
      ctx.globalAlpha = isInside ? 0.95 : 0.3

      const barHeight = Math.max(2, peak * maxBar)
      ctx.fillRect(x, midY - barHeight, barWidth, barHeight * 2)
    }
    ctx.globalAlpha = 1

    // Trim-Handles.
    for (const x of [selStartX, selEndX]) {
      ctx.fillStyle = insideColor
      ctx.fillRect(x - 1.5, 0, 3, size.height)
      ctx.beginPath()
      ctx.roundRect(x - 5, midY - 14, 10, 28, 3)
      ctx.fill()
    }

    // Playhead.
    const playheadX = (currentTime / duration) * size.width
    ctx.fillStyle = '#ef4444'
    ctx.fillRect(playheadX - 1, 0, 2, size.height)
    ctx.beginPath()
    ctx.moveTo(playheadX - 6, 0)
    ctx.lineTo(playheadX + 6, 0)
    ctx.lineTo(playheadX, 8)
    ctx.closePath()
    ctx.fill()
  }, [size, waveform, trimStart, trimEnd, currentTime, duration])

  // --- Interaktion ---------------------------------------------------------
  const timeFromEvent = useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return 0
      const ratio = (clientX - rect.left) / rect.width
      return Math.max(0, Math.min(duration, ratio * duration))
    },
    [duration],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const x = event.clientX - rect.left
      const startX = (trimStart / duration) * rect.width
      const endX = (trimEnd / duration) * rect.width

      let target: DragTarget = 'scrub'
      if (Math.abs(x - startX) <= HANDLE_HIT_PX) target = 'start'
      else if (Math.abs(x - endX) <= HANDLE_HIT_PX) target = 'end'

      setDrag(target)
      event.currentTarget.setPointerCapture(event.pointerId)

      if (target === 'scrub') onSeek(timeFromEvent(event.clientX))
    },
    [trimStart, trimEnd, duration, onSeek, timeFromEvent],
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
    <div className={cn('flex flex-col gap-1', className)}>
      <div
        ref={containerRef}
        className={cn(
          'relative h-24 w-full cursor-pointer touch-none rounded-md border bg-card select-none',
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
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          style={{ width: '100%', height: '100%' }}
        />

        {hoverTime !== null && !drag ? (
          <div
            className="pointer-events-none absolute top-1 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 font-mono text-[10px] text-background"
            style={{ left: `${(hoverTime / duration) * 100}%` }}
          >
            {formatTimecode(hoverTime)}
          </div>
        ) : null}
      </div>

      <div className="flex justify-between px-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
        <span>0:00</span>
        <span>
          Auswahl {formatTimecode(trimStart)} – {formatTimecode(trimEnd)} (
          {(trimEnd - trimStart).toFixed(1)}s)
        </span>
        <span>{formatTimecode(duration)}</span>
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
