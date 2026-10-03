'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Clip, Overlay } from '@/types/database'
import type { OutputFormat } from '@/types/workspace'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/stores/editor-store'

/**
 * Die Arbeitsfläche über dem Vorschaubild.
 *
 * Hier wird direkt im Bild gearbeitet: anklicken wählt aus, Ziehen
 * verschiebt, die Ecken skalieren, der Griff oben dreht. Untertitel lassen
 * sich senkrecht verschieben. Dazu Hilfslinien: Mitte zum Einrasten, Drittel-
 * Raster und die Bereiche, die TikTok, Reels und Shorts mit ihrer eigenen
 * Oberfläche verdecken.
 *
 * Gemessen wird am gerenderten Bild selbst (`data-overlay-id`), nicht an einer
 * Nachbildung — der Rahmen sitzt also genau um das, was im MP4 erscheint.
 */

interface Box {
  cx: number
  cy: number
  width: number
  height: number
  rotation: number
}

type Target = { type: 'overlay'; id: string } | { type: 'captions' }

type Drag =
  | { mode: 'move'; id: string; x: number; y: number; startX: number; startY: number; moved: boolean }
  | { mode: 'scale'; id: string; scale: number; distance: number; cx: number; cy: number }
  | { mode: 'rotate'; id: string; rotation: number; angle: number; cx: number; cy: number }
  | { mode: 'captions'; positionY: number; startY: number }

const SNAP_PX = 6
const HIT_PADDING = 6

function sameBox(a: Box | null, b: Box | null) {
  if (!a || !b) return a === b
  return Math.abs(a.cx - b.cx) < 0.5 && Math.abs(a.cy - b.cy) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5 && Math.abs(a.rotation - b.rotation) < 0.05
}

function contains(box: Box, x: number, y: number) {
  const angle = (-box.rotation * Math.PI) / 180
  const dx = x - box.cx
  const dy = y - box.cy
  const localX = dx * Math.cos(angle) - dy * Math.sin(angle)
  const localY = dx * Math.sin(angle) + dy * Math.cos(angle)
  return Math.abs(localX) <= box.width / 2 + HIT_PADDING && Math.abs(localY) <= box.height / 2 + HIT_PADDING
}

export function CanvasOverlay({
  clip,
  frameRef,
  compositionWidth,
  outputFormat,
  showSafeZone,
  showGrid,
}: {
  clip: Clip
  frameRef: React.RefObject<HTMLDivElement | null>
  compositionWidth: number
  outputFormat: OutputFormat
  showSafeZone: boolean
  showGrid: boolean
}) {
  const layerRef = useRef<HTMLDivElement>(null)
  const selection = useEditorStore((state) => state.selection)
  const select = useEditorStore((state) => state.select)
  const updateOverlay = useEditorStore((state) => state.updateOverlay)
  const setCaptionStyle = useEditorStore((state) => state.setCaptionStyle)

  const [selectedBox, setSelectedBox] = useState<Box | null>(null)
  const [hover, setHover] = useState<{ target: Target; box: Box } | null>(null)
  const [guides, setGuides] = useState<{ vertical: boolean; horizontal: boolean }>({ vertical: false, horizontal: false })
  const [dragging, setDragging] = useState(false)
  const drag = useRef<Drag | null>(null)

  // Aktuelle Werte für den Messtakt, ohne ihn bei jeder Änderung neu zu starten.
  const clipRef = useRef(clip)
  useEffect(() => { clipRef.current = clip })

  const overlayById = useCallback((id: string) => clipRef.current.overlays?.find((overlay) => overlay.id === id) ?? null, [])

  /** Rahmen eines Elements in Pixeln der Arbeitsfläche; `null`, wenn es gerade nicht im Bild ist. */
  const measure = useCallback((target: Target): Box | null => {
    const frame = frameRef.current
    const layer = layerRef.current
    if (!frame || !layer) return null
    const base = layer.getBoundingClientRect()
    if (base.width === 0) return null

    if (target.type === 'captions') {
      const element = frame.querySelector('[data-caption-layer]')
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { cx: rect.left - base.left + rect.width / 2, cy: rect.top - base.top + rect.height / 2, width: rect.width, height: rect.height, rotation: 0 }
    }

    const overlay = overlayById(target.id)
    const element = frame.querySelector(`[data-overlay-id="${CSS.escape(target.id)}"]`)
    if (!overlay || !element) return null
    if (overlay.kind === 'progress') {
      const rect = element.getBoundingClientRect()
      return { cx: rect.left - base.left + rect.width / 2, cy: rect.top - base.top + rect.height / 2, width: rect.width, height: Math.max(rect.height, 8), rotation: 0 }
    }
    // Die eigene Größe des Inhalts, ohne Transformationen — Lage, Drehung und
    // Skalierung kommen aus dem Modell. So ist der Rahmen auch während einer
    // Ein- oder Ausblendung ruhig.
    const scale = base.width / compositionWidth
    const width = overlay.kind === 'shape' ? overlay.width : (element as HTMLElement).offsetWidth
    const height = overlay.kind === 'shape' ? overlay.height : (element as HTMLElement).offsetHeight
    return {
      cx: overlay.x * base.width,
      cy: overlay.y * base.height,
      width: width * scale * overlay.scale,
      height: height * scale * overlay.scale,
      rotation: overlay.rotation,
    }
  }, [frameRef, compositionWidth, overlayById])

  // Messtakt für die Auswahl: Das Bild ändert sich mit jedem Frame.
  const selectedTarget: Target | null = selection.type === 'overlay' ? { type: 'overlay', id: selection.id } : selection.type === 'captions' ? { type: 'captions' } : null
  const selectedKey = selectedTarget ? (selectedTarget.type === 'overlay' ? selectedTarget.id : 'captions') : null
  useEffect(() => {
    if (!selectedKey) return
    const target: Target = selectedKey === 'captions' ? { type: 'captions' } : { type: 'overlay', id: selectedKey }
    let raf = 0
    const tick = () => {
      const next = measure(target)
      setSelectedBox((previous) => (sameBox(previous, next) ? previous : next))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [selectedKey, measure])

  /** Oberstes Element unter dem Zeiger — in Zeichenreihenfolge, also Untertitel zuerst. */
  const hitTest = useCallback((x: number, y: number): { target: Target; box: Box } | null => {
    const frame = frameRef.current
    if (!frame) return null
    const elements = Array.from(frame.querySelectorAll('[data-overlay-id], [data-caption-layer]')).reverse()
    for (const element of elements) {
      const id = element.getAttribute('data-overlay-id')
      const target: Target = id ? { type: 'overlay', id } : { type: 'captions' }
      const box = measure(target)
      if (box && contains(box, x, y)) return { target, box }
    }
    return null
  }, [frameRef, measure])

  const pointFrom = (event: React.PointerEvent | React.MouseEvent) => {
    const rect = layerRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const point = pointFrom(event)
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle
    const layer = event.currentTarget

    if (handle && selection.type === 'overlay' && selectedBox) {
      const overlay = overlayById(selection.id)
      if (!overlay || overlay.locked) return
      event.preventDefault()
      layer.setPointerCapture(event.pointerId)
      const { cx, cy } = selectedBox
      drag.current = handle === 'rotate'
        ? { mode: 'rotate', id: overlay.id, rotation: overlay.rotation, angle: Math.atan2(point.y - cy, point.x - cx), cx, cy }
        : { mode: 'scale', id: overlay.id, scale: overlay.scale, distance: Math.max(4, Math.hypot(point.x - cx, point.y - cy)), cx, cy }
      setDragging(true)
      return
    }

    const hit = hitTest(point.x, point.y)
    if (!hit) {
      select({ type: 'video' })
      return
    }
    event.preventDefault()
    layer.setPointerCapture(event.pointerId)
    if (hit.target.type === 'captions') {
      select({ type: 'captions' })
      drag.current = { mode: 'captions', positionY: clipRef.current.caption_style.positionY, startY: point.y }
      setDragging(true)
      return
    }
    const overlay = overlayById(hit.target.id)
    if (!overlay) return
    select({ type: 'overlay', id: overlay.id })
    if (overlay.locked || overlay.kind === 'progress') return
    drag.current = { mode: 'move', id: overlay.id, x: overlay.x, y: overlay.y, startX: point.x, startY: point.y, moved: false }
    setDragging(true)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = pointFrom(event)
    const state = drag.current
    const clipId = clipRef.current.id

    if (!state) {
      const hit = hitTest(point.x, point.y)
      setHover((previous) => {
        if (!hit) return null
        const same = previous && (previous.target.type === 'captions' ? hit.target.type === 'captions' : hit.target.type === 'overlay' && previous.target.id === hit.target.id)
        return same && sameBox(previous.box, hit.box) ? previous : hit
      })
      return
    }

    if (state.mode === 'move') {
      let dx = point.x - state.startX
      let dy = point.y - state.startY
      if (!state.moved && Math.hypot(dx, dy) < 2) return
      state.moved = true
      // Shift hält die Bewegung auf einer Achse.
      if (event.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0
        else dx = 0
      }
      let x = state.x + dx / point.width
      let y = state.y + dy / point.height
      const vertical = Math.abs(x - 0.5) * point.width < SNAP_PX
      const horizontal = Math.abs(y - 0.5) * point.height < SNAP_PX
      if (vertical) x = 0.5
      if (horizontal) y = 0.5
      setGuides((previous) => (previous.vertical === vertical && previous.horizontal === horizontal ? previous : { vertical, horizontal }))
      updateOverlay(clipId, state.id, { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) })
      return
    }

    if (state.mode === 'scale') {
      const distance = Math.hypot(point.x - state.cx, point.y - state.cy)
      updateOverlay(clipId, state.id, { scale: Number(Math.max(0.05, Math.min(10, state.scale * (distance / state.distance))).toFixed(3)) })
      return
    }

    if (state.mode === 'rotate') {
      const angle = Math.atan2(point.y - state.cy, point.x - state.cx)
      let rotation = state.rotation + ((angle - state.angle) * 180) / Math.PI
      rotation = ((((rotation + 180) % 360) + 360) % 360) - 180
      // Shift in 15°-Schritten; sonst rastet er an den Achsen ein.
      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15
      else {
        const axis = Math.round(rotation / 90) * 90
        if (Math.abs(rotation - axis) < 4) rotation = axis
      }
      updateOverlay(clipId, state.id, { rotation: Number(rotation.toFixed(1)) })
      return
    }

    if (state.mode === 'captions') {
      const positionY = Math.round(Math.max(5, Math.min(95, state.positionY + ((point.y - state.startY) / point.height) * 100)))
      if (positionY !== clipRef.current.caption_style.positionY) setCaptionStyle(clipId, { positionY })
    }
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    drag.current = null
    setDragging(false)
    setGuides({ vertical: false, horizontal: false })
  }

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const point = pointFrom(event)
    const hit = hitTest(point.x, point.y)
    if (hit?.target.type === 'overlay' && overlayById(hit.target.id)?.kind === 'text') {
      window.dispatchEvent(new CustomEvent('omegaclip:edit-text', { detail: hit.target.id }))
    }
  }

  // Im Render aus den Props, nicht über die Ref des Messtakts.
  const findOverlay = (id: string) => clip.overlays?.find((overlay) => overlay.id === id) ?? null
  const selectedOverlay: Overlay | null = selection.type === 'overlay' ? findOverlay(selection.id) : null
  // Ohne Auswahl gilt kein Rahmen — auch wenn der letzte Messwert noch steht.
  const box = selectedKey ? selectedBox : null
  const showHandles = Boolean(box && selectedOverlay && !selectedOverlay.locked && selectedOverlay.kind !== 'progress')
  const hoverIsSelected = hover && selectedTarget && (hover.target.type === 'captions' ? selectedTarget.type === 'captions' : selectedTarget.type === 'overlay' && selectedTarget.id === hover.target.id)
  const hoverLocked = hover?.target.type === 'overlay' && findOverlay(hover.target.id)?.locked

  return (
    <div
      ref={layerRef}
      className={cn('absolute inset-0 touch-none select-none', hover && !hoverLocked ? 'cursor-move' : 'cursor-default', dragging && 'cursor-grabbing')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => { if (!drag.current) setHover(null) }}
      onDoubleClick={onDoubleClick}
    >
      {showGrid ? <Grid /> : null}
      {showSafeZone ? <SafeZone format={outputFormat} /> : null}

      {guides.vertical ? <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/80 shadow-[0_0_0_0.5px_rgb(0_0_0/0.4)]" /> : null}
      {guides.horizontal ? <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/80 shadow-[0_0_0_0.5px_rgb(0_0_0/0.4)]" /> : null}

      {hover && !hoverIsSelected && !dragging ? <Frame box={hover.box} className="border border-white/55 border-dashed" /> : null}

      {box ? (
        <Frame box={box} className={cn('border border-white shadow-[0_0_0_1px_rgb(0_0_0/0.35)]', selectedOverlay?.locked && 'border-dashed')}>
          {showHandles ? (
            <>
              {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                <span
                  key={corner}
                  data-handle={corner}
                  className={cn(
                    'absolute size-2.5 rounded-[2px] border border-black/40 bg-white shadow',
                    corner.includes('n') ? '-top-[5px]' : '-bottom-[5px]',
                    corner.includes('w') ? '-left-[5px]' : '-right-[5px]',
                    corner === 'nw' || corner === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize',
                  )}
                />
              ))}
              <span className="pointer-events-none absolute -top-5 left-1/2 h-5 w-px -translate-x-1/2 bg-white/80" />
              <span
                data-handle="rotate"
                className="absolute -top-[26px] left-1/2 size-3 -translate-x-1/2 cursor-grab rounded-full border border-black/40 bg-white shadow active:cursor-grabbing"
              />
            </>
          ) : null}
        </Frame>
      ) : null}
    </div>
  )
}

function Frame({ box, className, children }: { box: Box; className?: string; children?: React.ReactNode }) {
  return (
    <div
      className={cn('pointer-events-none absolute rounded-[2px] [&_[data-handle]]:pointer-events-auto', className)}
      style={{
        left: box.cx,
        top: box.cy,
        width: box.width,
        height: box.height,
        transform: `translate(-50%, -50%) rotate(${box.rotation}deg)`,
      }}
    >
      {children}
    </div>
  )
}

function Grid() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {[1 / 3, 2 / 3].map((position) => (
        <React.Fragment key={position}>
          <div className="absolute inset-y-0 w-px bg-white/25" style={{ left: `${position * 100}%` }} />
          <div className="absolute inset-x-0 h-px bg-white/25" style={{ top: `${position * 100}%` }} />
        </React.Fragment>
      ))}
    </div>
  )
}

/**
 * Was die Plattformen verdecken. Für Hochkant die Summe aus TikTok, Reels
 * und Shorts: Kopfzeile oben, Beschreibung und Musik unten, Aktionsleiste
 * rechts. Quer und quadratisch gilt der klassische Titel-Sicherheitsrand.
 */
function SafeZone({ format }: { format: OutputFormat }) {
  const vertical = format === '9:16'
  const inset = vertical ? { top: 9, right: 15, bottom: 22, left: 6 } : { top: 5, right: 5, bottom: 5, left: 5 }
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {vertical ? (
        <>
          <div className="absolute inset-x-0 top-0 bg-black/30" style={{ height: `${inset.top}%` }} />
          <div className="absolute inset-x-0 bottom-0 bg-black/30" style={{ height: `${inset.bottom}%` }} />
          <div className="absolute right-0 bg-black/30" style={{ top: '38%', bottom: `${inset.bottom}%`, width: `${inset.right}%` }} />
        </>
      ) : null}
      <div
        className="absolute rounded-sm border border-dashed border-white/60"
        style={{ top: `${inset.top}%`, right: `${inset.right}%`, bottom: `${inset.bottom}%`, left: `${inset.left}%` }}
      >
        <span className="absolute top-1 left-1 rounded-sm bg-black/55 px-1 py-px text-[9px] font-medium tracking-wide text-white/85 uppercase">Sicherer Bereich</span>
      </div>
    </div>
  )
}
