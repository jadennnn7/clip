'use client'

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AudioLines,
  Captions,
  Copy,
  Eye,
  EyeOff,
  Film,
  Layers,
  Lock,
  Magnet,
  Maximize2,
  MousePointer2,
  Scissors,
  Shapes,
  Smile,
  SquareSplitHorizontal,
  Trash2,
  Type,
  Gauge,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { Clip, ClipSegment, Overlay } from '@/types/database'
import type { WaveformData } from '@/types/editor'
import { cn } from '@/lib/utils'
import { singleValue } from '@/lib/slider-value'
import { clipOutputDuration, clipSegments, outputCaptionWords, outputSegments, outputToSource } from '@/lib/clip-export'
import { useEditorStore } from '@/stores/editor-store'
import { Slider } from '@/components/ui/slider'
import { chunkWords } from '../../../remotion/captions/CaptionLayer'
import { SHAPE_LABELS, resolveVideoSettings } from '../../../remotion/overlays/defaults'
import { deleteSelection, duplicateSelection, splitAtPlayhead } from './actions'
import { IconButton } from './controls'
import { frameAt, useFrames } from './frames'
import { formatDuration, formatTimecode } from './timecode'

/**
 * Die Mehrspur-Timeline.
 *
 * Von oben nach unten: Overlay-Ebenen (höhere Ebene liegt im Bild oben),
 * Untertitel, Video, Audio. Alles auf der Zeitachse des fertigen Clips —
 * nach allen Schnitten. Die Spurköpfe kleben links, das Lineal oben; beides
 * über `position: sticky` in einem einzigen Scrollcontainer, damit Spuren und
 * Köpfe nie auseinanderlaufen.
 *
 * Lineal und Wellenform zeichnen nur den sichtbaren Ausschnitt auf ein Canvas,
 * das am Rand des Sichtfensters klebt. Auch bei starkem Zoom bleibt das eine
 * Leinwand in Fenstergröße statt einer von 20.000 Pixeln.
 */

const HEADER_W = 128
const RULER_H = 28
const OVERLAY_H = 30
const CAPTION_H = 26
const VIDEO_H = 54
const AUDIO_H = 40
const TAIL_PX = 200
const SNAP_PX = 8
const MAX_PPS = 640
const MIN_OVERLAY = 0.1

type Drag =
  | { kind: 'scrub' }
  | { kind: 'overlay-move'; id: string; startX: number; startY: number; start: number; end: number; lanes: number[]; lanesTop: number; moved: boolean }
  | { kind: 'overlay-trim'; id: string; edge: 'start' | 'end'; startX: number; start: number; end: number }
  | { kind: 'segment-trim'; index: number; edge: 'start' | 'end'; startX: number; segment: ClipSegment; outputStart: number; clipStart: number; clipEnd: number; first: boolean; last: boolean }

const BLADE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 1px black)"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></svg>')}") 11 11, crosshair`

function overlayIcon(overlay: Overlay) {
  switch (overlay.kind) {
    case 'text': return Type
    case 'shape': return Shapes
    case 'emoji': return Smile
    default: return Gauge
  }
}

function overlayLabel(overlay: Overlay) {
  if (overlay.kind === 'text') return overlay.text.split('\n')[0] || overlay.name || 'Text'
  if (overlay.kind === 'shape') return overlay.name ?? SHAPE_LABELS[overlay.shape]
  if (overlay.kind === 'emoji') return overlay.emoji
  return overlay.name ?? 'Fortschritt'
}

export function TrackTimeline({
  clip,
  waveform,
  videoSrc,
  sourceAspect,
  removedWords,
}: {
  clip: Clip
  waveform: WaveformData
  videoSrc: string
  sourceAspect: number
  removedWords: number[]
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ left: 0, width: 0 })
  const [zoom, setZoom] = useState(1)
  const [snapLine, setSnapLine] = useState<number | null>(null)
  const [bladeAt, setBladeAt] = useState<number | null>(null)
  const drag = useRef<Drag | null>(null)
  const zoomAnchor = useRef<{ time: number; offset: number } | null>(null)

  const playheadSeconds = useEditorStore((state) => state.playheadSeconds)
  const isPlaying = useEditorStore((state) => state.isPlaying)
  const selection = useEditorStore((state) => state.selection)
  const tool = useEditorStore((state) => state.tool)
  const snapping = useEditorStore((state) => state.snapping)
  const setTool = useEditorStore((state) => state.setTool)
  const setSnapping = useEditorStore((state) => state.setSnapping)
  const select = useEditorStore((state) => state.select)
  const setPlayhead = useEditorStore((state) => state.setPlayhead)
  const setPlaying = useEditorStore((state) => state.setPlaying)

  // --- Abgeleitete Zeitachse -------------------------------------------------
  const duration = clipOutputDuration(clip)
  const segments = useMemo(() => clipSegments(clip), [clip])
  const placed = useMemo(() => outputSegments(segments), [segments])
  const overlays = useMemo(() => clip.overlays ?? [], [clip.overlays])
  const settings = resolveVideoSettings(clip.video_settings)
  const captionsOn = clip.caption_style.enabled !== false
  const chunks = useMemo(
    () => chunkWords(outputCaptionWords(clip, removedWords), clip.caption_style),
    [clip, removedWords],
  )
  const timelineEnd = Math.max(duration, ...overlays.map((overlay) => overlay.end), 1)
  const fitPps = Math.max(2, (viewport.width - HEADER_W - 48) / timelineEnd)
  const pps = Math.min(MAX_PPS, fitPps * zoom)
  const maxZoom = Math.max(1, MAX_PPS / fitPps)
  const laneWidth = timelineEnd * pps + TAIL_PX
  const maxTrack = overlays.reduce((max, overlay) => Math.max(max, overlay.track), -1)
  // Oben immer eine freie Ebene — dorthin zieht man, um eine neue anzulegen.
  // Während des Ziehens bleibt die Aufteilung stehen: Sonst käme beim
  // Betreten der freien Ebene oben eine weitere hinzu, alles rutschte eine
  // Zeile nach unten, und das Element spränge unter dem Zeiger weg.
  const [frozenLanes, setFrozenLanes] = useState<number[] | null>(null)
  const computedLanes = useMemo(() => Array.from({ length: maxTrack + 2 }, (_, index) => maxTrack + 1 - index), [maxTrack])
  const laneTracks = frozenLanes ?? computedLanes

  // --- Sichtfenster ------------------------------------------------------------
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setViewport((previous) => (
        previous.left === scroller.scrollLeft && previous.width === scroller.clientWidth ? previous : { left: scroller.scrollLeft, width: scroller.clientWidth }
      )))
    }
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    return () => {
      cancelAnimationFrame(raf)
      scroller.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  // Zoom um einen Ankerpunkt: Die Zeit unter dem Zeiger bleibt, wo sie ist.
  const zoomTo = useCallback((next: number, anchorClientX?: number) => {
    const scroller = scrollerRef.current
    const clamped = Math.min(maxZoom, Math.max(1, next))
    if (scroller) {
      const rect = scroller.getBoundingClientRect()
      const offset = anchorClientX !== undefined
        ? anchorClientX - rect.left - HEADER_W
        : Math.max(0, playheadSeconds * pps - scroller.scrollLeft)
      const time = (scroller.scrollLeft + offset) / pps
      zoomAnchor.current = { time, offset }
    }
    setZoom(clamped)
  }, [maxZoom, playheadSeconds, pps])

  useLayoutEffect(() => {
    const anchor = zoomAnchor.current
    const scroller = scrollerRef.current
    if (!anchor || !scroller) return
    zoomAnchor.current = null
    scroller.scrollLeft = Math.max(0, anchor.time * pps - anchor.offset)
  }, [pps])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      zoomTo(zoom * Math.exp(-event.deltaY * 0.0025), event.clientX)
    }
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  }, [zoom, zoomTo])

  useEffect(() => {
    const onZoom = (event: Event) => {
      const direction = (event as CustomEvent<'in' | 'out' | 'fit'>).detail
      if (direction === 'fit') setZoom(1)
      else zoomTo(direction === 'in' ? zoom * 1.5 : zoom / 1.5)
    }
    window.addEventListener('omegaclip:timeline-zoom', onZoom)
    return () => window.removeEventListener('omegaclip:timeline-zoom', onZoom)
  }, [zoom, zoomTo])

  // Beim Abspielen läuft das Sichtfenster mit, sobald der Playhead den Rand erreicht.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || drag.current) return
    const visible = scroller.clientWidth - HEADER_W
    const x = playheadSeconds * pps
    if (x > scroller.scrollLeft + visible - 32) scroller.scrollLeft = x - (isPlaying ? visible * 0.15 : visible * 0.5)
    else if (x < scroller.scrollLeft) scroller.scrollLeft = Math.max(0, x - (isPlaying ? 16 : visible * 0.5))
  }, [playheadSeconds, pps, isPlaying])

  // --- Hilfen für Zeiger und Einrasten ---------------------------------------
  const timeAt = useCallback((clientX: number) => {
    const scroller = scrollerRef.current
    if (!scroller) return 0
    const rect = scroller.getBoundingClientRect()
    return (clientX - rect.left + scroller.scrollLeft - HEADER_W) / pps
  }, [pps])

  const snapPoints = useCallback((excludeId?: string) => {
    const points = [0, duration, playheadSeconds, ...placed.map((segment) => segment.outputStart)]
    for (const overlay of overlays) {
      if (overlay.id === excludeId) continue
      points.push(overlay.start, overlay.end)
    }
    return points
  }, [duration, playheadSeconds, placed, overlays])

  /** Nächster Einrastpunkt für eine oder mehrere Kanten; liefert die Korrektur. */
  const snapDelta = useCallback((times: number[], excludeId?: string): { delta: number; at: number | null } => {
    if (!snapping) return { delta: 0, at: null }
    const threshold = SNAP_PX / pps
    let best: { delta: number; at: number | null } = { delta: 0, at: null }
    let bestDistance = threshold
    for (const point of snapPoints(excludeId)) {
      for (const time of times) {
        const distance = Math.abs(point - time)
        if (distance < bestDistance) {
          bestDistance = distance
          best = { delta: point - time, at: point }
        }
      }
    }
    return best
  }, [snapping, pps, snapPoints])

  // --- Filmstreifen ------------------------------------------------------------
  const tileWidth = Math.max(40, (VIDEO_H - 4) * sourceAspect)
  const tiles = useMemo(() => {
    const result: Array<{ key: string; segment: number; left: number; width: number; time: number }> = []
    const viewStart = viewport.left
    const viewEnd = viewport.left + viewport.width
    for (const segment of placed) {
      const left = segment.outputStart * pps
      const width = (segment.outputEnd - segment.outputStart) * pps
      const first = Math.max(0, Math.floor((viewStart - left) / tileWidth))
      const last = Math.min(Math.ceil(width / tileWidth), Math.ceil((viewEnd - left) / tileWidth))
      for (let index = first; index < last; index++) {
        const offset = index * tileWidth
        const time = clip.start_seconds + segment.start + Math.min(width, offset + tileWidth / 2) / pps
        result.push({ key: `${segment.index}:${index}`, segment: segment.index, left: offset, width: Math.min(tileWidth, width - offset), time: Math.round(time * 4) / 4 })
      }
    }
    return result.slice(0, 160)
  }, [placed, pps, viewport, tileWidth, clip.start_seconds])
  const frames = useFrames(videoSrc, useMemo(() => [...new Set(tiles.map((tile) => tile.time))], [tiles]))

  // --- Ziehen ------------------------------------------------------------------
  const beginDrag = (event: React.PointerEvent, next: Drag) => {
    event.preventDefault()
    event.stopPropagation()
    scrollerRef.current?.setPointerCapture(event.pointerId)
    drag.current = next
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    const store = useEditorStore.getState()
    if (!state) {
      if (tool === 'blade') setBladeAt(Math.max(0, Math.min(duration, timeAt(event.clientX))))
      return
    }
    const time = timeAt(event.clientX)

    if (state.kind === 'scrub') {
      setPlayhead(Math.max(0, time))
      return
    }

    if (state.kind === 'overlay-move') {
      const dx = event.clientX - state.startX
      const dy = event.clientY - state.startY
      if (!state.moved && Math.hypot(dx, dy) < 3) return
      state.moved = true
      const length = state.end - state.start
      let start = Math.max(0, state.start + dx / pps)
      const snap = snapDelta([start, start + length], state.id)
      start = Math.max(0, start + snap.delta)
      setSnapLine(snap.at)
      const lane = Math.max(0, Math.min(state.lanes.length - 1, Math.floor((event.clientY - state.lanesTop) / OVERLAY_H)))
      store.placeOverlay(clip.id, state.id, { start, end: start + length, track: state.lanes[lane] })
      return
    }

    if (state.kind === 'overlay-trim') {
      const dx = (event.clientX - state.startX) / pps
      if (state.edge === 'start') {
        let start = Math.min(state.end - MIN_OVERLAY, Math.max(0, state.start + dx))
        const snap = snapDelta([start], state.id)
        start = Math.min(state.end - MIN_OVERLAY, Math.max(0, start + snap.delta))
        setSnapLine(snap.at)
        store.updateOverlay(clip.id, state.id, { start })
      } else {
        let end = Math.max(state.start + MIN_OVERLAY, state.end + dx)
        const snap = snapDelta([end], state.id)
        end = Math.max(state.start + MIN_OVERLAY, end + snap.delta)
        setSnapLine(snap.at)
        store.updateOverlay(clip.id, state.id, { end })
      }
      return
    }

    if (state.kind === 'segment-trim') {
      const dt = (event.clientX - state.startX) / pps
      if (state.edge === 'end') {
        // Die Kante liegt in der Ausgabe bei outputStart + Länge.
        const edge = state.outputStart + (state.segment.end - state.segment.start) + dt
        const snap = snapDelta([edge])
        setSnapLine(snap.at)
        const sourceEnd = state.segment.end + dt + snap.delta
        if (state.last) store.setTrim(clip.id, clip.start_seconds, state.clipStart + Math.max(state.segment.start + 0.2, sourceEnd))
        else store.trimSegment(clip.id, state.index, 'end', sourceEnd)
      } else {
        const sourceStart = state.segment.start + dt
        if (state.first) store.setTrim(clip.id, Math.min(state.clipStart + sourceStart, state.clipStart + state.segment.end - 0.2), clip.end_seconds)
        else store.trimSegment(clip.id, state.index, 'start', sourceStart)
      }
    }
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    drag.current = null
    setSnapLine(null)
    if (scrollerRef.current?.hasPointerCapture(event.pointerId)) scrollerRef.current.releasePointerCapture(event.pointerId)
    if (state?.kind === 'overlay-move') {
      setFrozenLanes(null)
      if (state.moved) useEditorStore.getState().compactTracks(clip.id)
    }
  }

  const startScrub = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    setPlaying(false)
    setPlayhead(Math.max(0, timeAt(event.clientX)))
    beginDrag(event, { kind: 'scrub' })
  }

  /** Klick auf leere Spurfläche: Playhead setzen, Auswahl aufheben. */
  const onLaneBackground = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    if (tool === 'blade') return
    select({ type: 'video' })
    startScrub(event)
  }

  const onOverlayDown = (event: React.PointerEvent, overlay: Overlay, laneIndex: number) => {
    if (event.button !== 0) return
    event.stopPropagation()
    const store = useEditorStore.getState()
    if (tool === 'blade') {
      store.splitOverlay(clip.id, overlay.id, timeAt(event.clientX))
      return
    }
    select({ type: 'overlay', id: overlay.id })
    if (overlay.locked) return
    const edge = (event.target as HTMLElement).closest<HTMLElement>('[data-edge]')?.dataset.edge as 'start' | 'end' | undefined
    if (edge) {
      beginDrag(event, { kind: 'overlay-trim', id: overlay.id, edge, startX: event.clientX, start: overlay.start, end: overlay.end })
      return
    }
    const itemTop = (event.currentTarget as HTMLElement).getBoundingClientRect().top
    const lanesTop = itemTop - laneIndex * OVERLAY_H - 3
    setFrozenLanes(laneTracks)
    beginDrag(event, { kind: 'overlay-move', id: overlay.id, startX: event.clientX, startY: event.clientY, start: overlay.start, end: overlay.end, lanes: laneTracks, lanesTop, moved: false })
  }

  const onSegmentDown = (event: React.PointerEvent, index: number) => {
    if (event.button !== 0) return
    event.stopPropagation()
    const store = useEditorStore.getState()
    if (tool === 'blade') {
      store.splitVideo(clip.id, timeAt(event.clientX))
      return
    }
    select({ type: 'segment', index })
    const edge = (event.target as HTMLElement).closest<HTMLElement>('[data-edge]')?.dataset.edge as 'start' | 'end' | undefined
    if (!edge) {
      startScrub(event)
      return
    }
    const segment = placed[index]
    beginDrag(event, {
      kind: 'segment-trim',
      index,
      edge,
      startX: event.clientX,
      segment: { start: segment.start, end: segment.end },
      outputStart: segment.outputStart,
      clipStart: clip.start_seconds,
      clipEnd: clip.end_seconds,
      first: index === 0,
      last: index === placed.length - 1,
    })
  }

  const onCaptionDown = (event: React.PointerEvent, start: number) => {
    if (event.button !== 0) return
    event.stopPropagation()
    if (tool === 'blade') return
    select({ type: 'captions' })
    setPlayhead(start)
  }

  const store = useEditorStore.getState
  const selectedOverlayId = selection.type === 'overlay' ? selection.id : null
  const hasSelection = selection.type === 'overlay' || selection.type === 'segment' || selection.type === 'captions'
  const playheadX = playheadSeconds * pps
  const beyondEnd = duration * pps

  return (
    <div className="flex h-full min-h-0 flex-col bg-[oklch(0.13_0_0)]">
      {/* --- Werkzeugleiste --- */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        <div className="flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5">
          <IconButton icon={MousePointer2} label="Auswahl" shortcut="V" onClick={() => setTool('select')} pressed={tool === 'select'} />
          <IconButton icon={Scissors} label="Klinge" shortcut="B" onClick={() => setTool('blade')} pressed={tool === 'blade'} />
        </div>
        <div className="mx-1 h-5 w-px bg-border" />
        <IconButton icon={SquareSplitHorizontal} label="Am Playhead teilen" shortcut="S" onClick={splitAtPlayhead} />
        <IconButton icon={Trash2} label="Auswahl löschen" shortcut="Entf" onClick={deleteSelection} disabled={!hasSelection} />
        <IconButton icon={Copy} label="Duplizieren" shortcut="⌘D" onClick={duplicateSelection} disabled={selection.type !== 'overlay'} />
        <div className="mx-1 h-5 w-px bg-border" />
        <IconButton icon={Magnet} label={snapping ? 'Einrasten aus' : 'Einrasten an'} shortcut="N" onClick={() => setSnapping(!snapping)} pressed={snapping} />

        <div className="ml-3 hidden min-w-0 items-center gap-2 text-xs text-muted-foreground lg:flex">
          <span className="font-mono tabular-nums">{formatDuration(duration)}</span>
          <span aria-hidden>·</span>
          <span>{segments.length} {segments.length === 1 ? 'Abschnitt' : 'Abschnitte'}</span>
          {overlays.length > 0 ? (<><span aria-hidden>·</span><span>{overlays.length} {overlays.length === 1 ? 'Element' : 'Elemente'}</span></>) : null}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <IconButton icon={ZoomOut} label="Herauszoomen" shortcut="−" onClick={() => zoomTo(zoom / 1.5)} disabled={zoom <= 1} />
          <Slider
            aria-label="Zoom der Timeline"
            className="w-28"
            min={0}
            max={1000}
            step={1}
            value={[Math.round((Math.log(zoom) / Math.log(Math.max(1.0001, maxZoom))) * 1000)]}
            onValueChange={(value) => zoomTo(Math.exp((singleValue(value) / 1000) * Math.log(Math.max(1.0001, maxZoom))))}
          />
          <IconButton icon={ZoomIn} label="Hineinzoomen" shortcut="+" onClick={() => zoomTo(zoom * 1.5)} disabled={zoom >= maxZoom} />
          <IconButton icon={Maximize2} label="Ganzen Clip zeigen" shortcut="\" onClick={() => setZoom(1)} />
        </div>
      </div>

      {/* --- Spuren --- */}
      <div
        ref={scrollerRef}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain select-none"
        style={{ cursor: tool === 'blade' ? BLADE_CURSOR : undefined }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setBladeAt(null)}
      >
        <div className="relative" style={{ width: HEADER_W + laneWidth, minHeight: '100%' }}>
          {/* Lineal */}
          <div className="sticky top-0 z-30 flex border-b bg-[oklch(0.155_0_0)]" style={{ height: RULER_H }}>
            <div className="sticky left-0 z-10 flex shrink-0 items-center border-r bg-[oklch(0.155_0_0)] px-3 font-mono text-[11px] text-muted-foreground tabular-nums" style={{ width: HEADER_W }}>
              {formatTimecode(playheadSeconds)}
            </div>
            <div className="relative cursor-text" style={{ width: laneWidth }} onPointerDown={startScrub}>
              <RulerCanvas left={viewport.left} width={Math.max(0, viewport.width - HEADER_W)} height={RULER_H} pps={pps} duration={duration} />
              <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2" style={{ left: playheadX }}>
                <div className="h-3.5 w-3 rounded-b-[3px] bg-destructive shadow-[0_1px_3px_rgb(0_0_0/0.5)] [clip-path:polygon(0_0,100%_0,100%_60%,50%_100%,0_60%)]" />
              </div>
            </div>
          </div>

          {/* Overlay-Ebenen */}
          <div className="flex border-b border-border/60">
            <div className="sticky left-0 z-20 shrink-0 border-r bg-[oklch(0.145_0_0)]" style={{ width: HEADER_W }}>
              {laneTracks.map((track, index) => (
                <TrackHead
                  key={track}
                  height={OVERLAY_H}
                  icon={Layers}
                  label={index === 0 ? 'Neue Ebene' : `Ebene ${track + 1}`}
                  muted={index === 0}
                />
              ))}
            </div>
            <div className="relative" style={{ width: laneWidth, height: laneTracks.length * OVERLAY_H }} onPointerDown={onLaneBackground}>
              {laneTracks.map((track, index) => (
                <div key={track} className={cn('absolute inset-x-0 border-b border-white/[0.04]', index % 2 === 1 && 'bg-white/[0.012]')} style={{ top: index * OVERLAY_H, height: OVERLAY_H }} />
              ))}
              {overlays.length === 0 ? (
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[11px] text-muted-foreground/60" style={{ left: Math.max(12, viewport.left + 12) }}>
                  Text, Formen und Emojis aus der Bibliothek links landen hier
                </span>
              ) : null}
              {overlays.map((overlay) => {
                const laneIndex = laneTracks.indexOf(overlay.track)
                const Icon = overlayIcon(overlay)
                const selected = overlay.id === selectedOverlayId
                return (
                  <div
                    key={overlay.id}
                    onPointerDown={(event) => onOverlayDown(event, overlay, Math.max(0, laneIndex))}
                    className={cn(
                      'group/item absolute flex items-center gap-1.5 overflow-hidden rounded-[5px] border px-2 text-[11px] leading-none',
                      tool === 'select' && !overlay.locked && 'cursor-grab active:cursor-grabbing',
                      selected
                        ? 'z-10 border-primary bg-primary text-primary-foreground shadow-[0_2px_10px_rgb(0_0_0/0.5)]'
                        : 'border-white/[0.14] bg-white/[0.09] text-foreground/90 hover:border-white/25 hover:bg-white/[0.14]',
                      overlay.hidden && 'opacity-45',
                      overlay.start >= duration && 'opacity-35',
                    )}
                    style={{ left: overlay.start * pps, width: Math.max(8, (overlay.end - overlay.start) * pps), top: Math.max(0, laneIndex) * OVERLAY_H + 3, height: OVERLAY_H - 6 }}
                    title={overlayLabel(overlay)}
                  >
                    {!overlay.locked && tool === 'select' ? <EdgeHandle edge="start" selected={selected} /> : null}
                    <Icon className="size-3 shrink-0 opacity-70" />
                    <span className="truncate">{overlayLabel(overlay)}</span>
                    {overlay.locked ? <Lock className="ml-auto size-3 shrink-0 opacity-60" /> : null}
                    {overlay.hidden ? <EyeOff className="ml-auto size-3 shrink-0 opacity-60" /> : null}
                    {!overlay.locked && tool === 'select' ? <EdgeHandle edge="end" selected={selected} /> : null}
                  </div>
                )
              })}
              <EndShade left={beyondEnd} />
            </div>
          </div>

          {/* Untertitel */}
          <div className="flex border-b border-border/60">
            <div className="sticky left-0 z-20 shrink-0 border-r bg-[oklch(0.145_0_0)]" style={{ width: HEADER_W }}>
              <TrackHead
                height={CAPTION_H}
                icon={Captions}
                label="Untertitel"
                active={selection.type === 'captions'}
                action={{
                  icon: captionsOn ? Eye : EyeOff,
                  label: captionsOn ? 'Untertitel ausblenden' : 'Untertitel einblenden',
                  onClick: () => store().setCaptionStyle(clip.id, { enabled: !captionsOn }),
                  pressed: !captionsOn,
                }}
              />
            </div>
            <div className={cn('relative', !captionsOn && 'opacity-40')} style={{ width: laneWidth, height: CAPTION_H }} onPointerDown={onLaneBackground}>
              {chunks.map((chunk, index) => (
                <div
                  key={`${chunk.start}-${index}`}
                  onPointerDown={(event) => onCaptionDown(event, chunk.start)}
                  className={cn(
                    'absolute top-[3px] flex items-center overflow-hidden rounded-[4px] border px-1.5 text-[10px] leading-none whitespace-nowrap',
                    selection.type === 'captions'
                      ? 'border-white/60 bg-white/[0.22] text-foreground'
                      : 'border-white/[0.1] bg-white/[0.06] text-muted-foreground hover:bg-white/[0.1]',
                  )}
                  style={{ left: chunk.start * pps, width: Math.max(3, (chunk.end - chunk.start) * pps - 1), height: CAPTION_H - 6 }}
                >
                  {(chunk.end - chunk.start) * pps > 24 ? <span className="truncate">{chunk.words.map((word) => word.word).join(' ')}</span> : null}
                </div>
              ))}
              {chunks.length === 0 ? <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground/60" style={{ left: Math.max(12, viewport.left + 12) }}>Kein Transkript in diesem Ausschnitt</span> : null}
              <EndShade left={beyondEnd} />
            </div>
          </div>

          {/* Video */}
          <div className="flex border-b border-border/60">
            <div className="sticky left-0 z-20 shrink-0 border-r bg-[oklch(0.145_0_0)]" style={{ width: HEADER_W }}>
              <TrackHead height={VIDEO_H} icon={Film} label="Video" active={selection.type === 'video' || selection.type === 'segment'} />
            </div>
            <div className="relative" style={{ width: laneWidth, height: VIDEO_H }} onPointerDown={onLaneBackground}>
              {placed.map((segment) => {
                const selected = selection.type === 'segment' && selection.index === segment.index
                const width = (segment.outputEnd - segment.outputStart) * pps
                const previous = placed[segment.index - 1]
                const cutBefore = previous && segment.start - previous.end > 0.01
                return (
                  <div
                    key={`${segment.index}:${segment.start}`}
                    onPointerDown={(event) => onSegmentDown(event, segment.index)}
                    className={cn(
                      'group/item absolute top-[3px] overflow-hidden rounded-[5px] bg-neutral-800',
                      selected ? 'z-10 shadow-[0_0_0_2px_white,0_4px_14px_rgb(0_0_0/0.5)]' : 'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]',
                    )}
                    style={{ left: segment.outputStart * pps + (segment.index > 0 ? 1 : 0), width: Math.max(4, width - (segment.index > 0 ? 1 : 0)), height: VIDEO_H - 6 }}
                  >
                    {tiles.filter((tile) => tile.segment === segment.index).map((tile) => {
                      const image = frameAt(frames, tile.time)
                      return (
                        <div key={tile.key} className="absolute inset-y-0 border-r border-black/40 bg-neutral-800" style={{ left: tile.left, width: tile.width }}>
                          {image ? (
                            // eslint-disable-next-line @next/next/no-img-element -- Data-URL aus dem Canvas, nichts zu optimieren.
                            <img src={image} alt="" draggable={false} className="h-full w-full object-cover opacity-85" />
                          ) : null}
                        </div>
                      )
                    })}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/30" />
                    <span className="pointer-events-none absolute top-1 left-1.5 flex items-center gap-1 text-[10px] font-medium text-white/90 [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]">
                      {width > 70 ? <Film className="size-2.5" /> : null}
                      {width > 44 ? formatDuration(segment.outputEnd - segment.outputStart) : null}
                    </span>
                    {segment.index === 0 && settings.fadeIn > 0 ? <FadeWedge side="start" width={settings.fadeIn * pps} /> : null}
                    {segment.index === placed.length - 1 && settings.fadeOut > 0 ? <FadeWedge side="end" width={settings.fadeOut * pps} /> : null}
                    {tool === 'select' ? <EdgeHandle edge="start" selected={selected} tall /> : null}
                    {tool === 'select' ? <EdgeHandle edge="end" selected={selected} tall /> : null}
                    {cutBefore ? <span className="pointer-events-none absolute top-0 left-0 h-full w-[2px] bg-white/80" /> : null}
                  </div>
                )
              })}
              {placed.slice(1).map((segment) => {
                const previous = placed[segment.index - 1]
                if (segment.start - previous.end <= 0.01) return null
                return (
                  <span
                    key={`cut-${segment.index}`}
                    title={`${formatDuration(segment.start - previous.end)} herausgeschnitten`}
                    className="pointer-events-none absolute -top-px z-20 flex size-4 -translate-x-1/2 items-center justify-center rounded-full bg-white text-neutral-950 shadow"
                    style={{ left: segment.outputStart * pps }}
                  >
                    <Scissors className="size-2.5" />
                  </span>
                )
              })}
              <EndShade left={beyondEnd} />
            </div>
          </div>

          {/* Audio */}
          <div className="flex border-b border-border/60">
            <div className="sticky left-0 z-20 shrink-0 border-r bg-[oklch(0.145_0_0)]" style={{ width: HEADER_W }}>
              <TrackHead
                height={AUDIO_H}
                icon={AudioLines}
                label="Audio"
                action={{
                  icon: settings.muted ? VolumeX : Volume2,
                  label: settings.muted ? 'Ton einschalten' : 'Ton stummschalten',
                  onClick: () => store().setVideoSettings(clip.id, { muted: !settings.muted }),
                  pressed: settings.muted,
                }}
              />
            </div>
            <div className="relative" style={{ width: laneWidth, height: AUDIO_H }} onPointerDown={onLaneBackground}>
              <WaveformCanvas
                left={viewport.left}
                width={Math.max(0, viewport.width - HEADER_W)}
                height={AUDIO_H}
                pps={pps}
                duration={duration}
                waveform={waveform}
                clipStart={clip.start_seconds}
                segments={segments}
                volume={settings.muted ? 0 : settings.volume}
                fadeIn={settings.fadeIn}
                fadeOut={settings.fadeOut}
              />
              <EndShade left={beyondEnd} />
            </div>
          </div>

          {/* Playhead, Einrastlinie, Klinge */}
          <div className="pointer-events-none absolute inset-y-0 z-[15] w-px bg-destructive shadow-[0_0_6px_rgb(0_0_0/0.6)]" style={{ left: HEADER_W + playheadX }} />
          {snapLine !== null ? <div className="pointer-events-none absolute inset-y-0 z-[16] w-px bg-white/80" style={{ left: HEADER_W + snapLine * pps, top: RULER_H }} /> : null}
          {tool === 'blade' && bladeAt !== null ? <div className="pointer-events-none absolute inset-y-0 z-[16] w-px border-l border-dashed border-white/80" style={{ left: HEADER_W + bladeAt * pps, top: RULER_H }} /> : null}
        </div>
      </div>
    </div>
  )
}

function TrackHead({
  height,
  icon: Icon,
  label,
  muted,
  active,
  action,
}: {
  height: number
  icon: React.ComponentType<{ className?: string }>
  label: string
  muted?: boolean
  active?: boolean
  action?: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; pressed?: boolean }
}) {
  return (
    <div className={cn('flex items-center gap-2 border-b border-white/[0.04] pr-1 pl-3', muted && 'opacity-50')} style={{ height }}>
      <Icon className={cn('size-3.5 shrink-0 text-muted-foreground', active && 'text-foreground')} />
      <span className={cn('min-w-0 flex-1 truncate text-[11px] text-muted-foreground', active && 'text-foreground')}>{label}</span>
      {action ? <IconButton icon={action.icon} label={action.label} onClick={action.onClick} pressed={action.pressed} className="size-6" side="right" /> : null}
    </div>
  )
}

function EdgeHandle({ edge, selected, tall }: { edge: 'start' | 'end'; selected: boolean; tall?: boolean }) {
  return (
    <span
      data-edge={edge}
      className={cn(
        'absolute inset-y-0 z-10 w-2 cursor-ew-resize',
        edge === 'start' ? 'left-0' : 'right-0',
        'after:absolute after:inset-y-1 after:w-[3px] after:rounded-full after:opacity-0 after:transition-opacity group-hover/item:after:opacity-100',
        edge === 'start' ? 'after:left-0.5' : 'after:right-0.5',
        selected ? (tall ? 'after:bg-white after:opacity-100' : 'after:bg-neutral-950/60 after:opacity-100') : 'after:bg-white/70',
      )}
    />
  )
}

function FadeWedge({ side, width }: { side: 'start' | 'end'; width: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 bg-black/55"
      style={{
        [side === 'start' ? 'left' : 'right']: 0,
        width,
        clipPath: side === 'start' ? 'polygon(0 0, 100% 0, 0 100%)' : 'polygon(0 0, 100% 0, 100% 100%)',
      }}
    />
  )
}

/** Alles nach dem Ende des Clips: sichtbar, aber erkennbar außerhalb. */
function EndShade({ left }: { left: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 right-0 bg-[repeating-linear-gradient(135deg,rgb(0_0_0/0.35)_0_6px,rgb(0_0_0/0.18)_6px_12px)]"
      style={{ left }}
    />
  )
}

// --- Leinwände für den sichtbaren Ausschnitt ----------------------------------

function useStickyCanvas(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, styles: CSSStyleDeclaration) => void) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || width <= 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    draw(ctx, getComputedStyle(canvas))
  })
  return ref
}

const RULER_STEPS = [1 / 30, 2 / 30, 5 / 30, 10 / 30, 0.5, 1, 2, 5, 10, 15, 30, 60, 120]

function RulerCanvas({ left, width, height, pps, duration }: { left: number; width: number; height: number; pps: number; duration: number }) {
  const ref = useStickyCanvas(width, height, (ctx, styles) => {
    const muted = styles.getPropertyValue('--muted-foreground').trim() || '#a3a3a3'
    const start = left / pps
    const end = (left + width) / pps
    const major = RULER_STEPS.find((step) => step * pps >= 72) ?? 120
    const minor = major >= 1 ? major / (major === 1 || major === 10 ? 10 : 5) : 1 / 30
    const minorPx = minor * pps

    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    const endX = duration * pps - left
    if (endX < width) ctx.fillRect(Math.max(0, endX), 0, width - Math.max(0, endX), height)

    ctx.strokeStyle = muted
    ctx.lineWidth = 1
    if (minorPx >= 5) {
      ctx.globalAlpha = 0.35
      ctx.beginPath()
      for (let t = Math.floor(start / minor) * minor; t <= end; t += minor) {
        const x = Math.round(t * pps - left) + 0.5
        ctx.moveTo(x, height - 5)
        ctx.lineTo(x, height)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 0.8
    ctx.beginPath()
    ctx.fillStyle = muted
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textBaseline = 'top'
    for (let t = Math.floor(start / major) * major; t <= end + major; t += major) {
      if (t < -1e-6) continue
      const x = Math.round(t * pps - left) + 0.5
      ctx.moveTo(x, height - 10)
      ctx.lineTo(x, height)
      const label = major < 1 ? formatTimecode(t) : formatTimecode(t).slice(0, 5)
      ctx.fillText(label, x + 4, 6)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  })
  return <canvas ref={ref} className="pointer-events-none sticky block" style={{ left: HEADER_W, width, height }} />
}

function WaveformCanvas({
  left,
  width,
  height,
  pps,
  duration,
  waveform,
  clipStart,
  segments,
  volume,
  fadeIn,
  fadeOut,
}: {
  left: number
  width: number
  height: number
  pps: number
  duration: number
  waveform: WaveformData
  clipStart: number
  segments: ClipSegment[]
  volume: number
  fadeIn: number
  fadeOut: number
}) {
  const ref = useStickyCanvas(width, height, (ctx, styles) => {
    const color = styles.getPropertyValue('--muted-foreground').trim() || '#a3a3a3'
    const peaks = waveform.peaks
    const total = peaks.length
    const sourceDuration = waveform.duration || 1
    const mid = height / 2
    const endX = Math.min(width, duration * pps - left)

    // Hintergrund der Spur innerhalb des Clips.
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    ctx.fillRect(0, 3, Math.max(0, endX), height - 6)

    if (total > 0) {
      ctx.fillStyle = color
      ctx.globalAlpha = volume > 0 ? 0.75 : 0.25
      for (let x = 0; x < endX; x += 2) {
        const t0 = (left + x) / pps
        const t1 = (left + x + 2) / pps
        if (t0 > duration) break
        const s0 = clipStart + outputToSource(segments, t0)
        const s1 = clipStart + outputToSource(segments, Math.min(duration, t1))
        const from = Math.max(0, Math.floor((Math.min(s0, s1) / sourceDuration) * total))
        const to = Math.min(total, Math.max(from + 1, Math.ceil((Math.max(s0, s1) / sourceDuration) * total)))
        let peak = 0
        for (let i = from; i < to; i++) if (peaks[i] > peak) peak = peaks[i]
        const bar = Math.max(1, peak * (height * 0.42) * Math.max(0.15, volume))
        ctx.fillRect(x, mid - bar, 1.4, bar * 2)
      }
      ctx.globalAlpha = 1
    }

    // Lautstärkelinie mit Blenden — wie das „Gummiband“ in Premiere.
    if (volume > 0) {
      const y = 4 + (height - 8) * (1 - volume * 0.9)
      const x0 = -left
      const x1 = duration * pps - left
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x0, fadeIn > 0 ? height - 4 : y)
      ctx.lineTo(x0 + fadeIn * pps, y)
      ctx.lineTo(x1 - fadeOut * pps, y)
      ctx.lineTo(x1, fadeOut > 0 ? height - 4 : y)
      ctx.stroke()
    }
  })
  return <canvas ref={ref} className="pointer-events-none sticky block" style={{ left: HEADER_W, width, height }} />
}
