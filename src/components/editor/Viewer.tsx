'use client'

import React, { useRef, useState } from 'react'
import {
  Grid3x3,
  Pause,
  Play,
  Repeat,
  ScanLine,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react'
import type { Clip } from '@/types/database'
import type { OutputFormat } from '@/types/workspace'
import { FPS } from '@/types/editor'
import { cn } from '@/lib/utils'
import { clipOutputDuration } from '@/lib/clip-export'
import { useEditorStore } from '@/stores/editor-store'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CanvasOverlay } from './CanvasOverlay'
import { IconButton } from './controls'
import { OUTPUT_SIZE, PreviewPlayer } from './PreviewPlayer'
import { formatTimecode } from './timecode'

const SPEEDS = [0.25, 0.5, 1, 1.5, 2]

/**
 * Programmmonitor: das Bild, darüber die Arbeitsfläche, darunter der
 * Transport. Hilfslinien (sicherer Bereich, Raster) sind reine Anzeige —
 * sie landen nie im Video.
 */
export function Viewer({
  clip,
  videoSrc,
  mediaError,
  sourceWidth,
  sourceHeight,
  outputFormat,
  removedWords,
}: {
  clip: Clip
  videoSrc: string
  mediaError?: string
  sourceWidth: number
  sourceHeight: number
  outputFormat: OutputFormat
  removedWords: number[]
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [showSafeZone, setShowSafeZone] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [compositionWidth] = OUTPUT_SIZE[outputFormat]

  return (
    <div className="flex h-full min-w-0 flex-col bg-[oklch(0.115_0_0)]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Vorschau</span>
        <span className="rounded border border-border px-1 py-px font-mono text-[10px] text-muted-foreground">{outputFormat}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground/80">{clip.title}</span>
        <IconButton icon={ScanLine} label="Sicherer Bereich der Plattformen" onClick={() => setShowSafeZone((value) => !value)} pressed={showSafeZone} side="bottom" />
        <IconButton icon={Grid3x3} label="Drittel-Raster" onClick={() => setShowGrid((value) => !value)} pressed={showGrid} side="bottom" />
      </div>

      <div className="relative min-h-0 flex-1 p-5">
        {mediaError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <VideoOff className="size-6 text-white/50" />
            <p className="max-w-sm text-sm leading-relaxed text-white/70">{mediaError}</p>
          </div>
        ) : (
          <PreviewPlayer
            clip={clip}
            videoSrc={videoSrc}
            sourceWidth={sourceWidth}
            sourceHeight={sourceHeight}
            outputFormat={outputFormat}
            removedWords={removedWords}
            frameRef={frameRef}
            overlay={
              <CanvasOverlay
                clip={clip}
                frameRef={frameRef}
                compositionWidth={compositionWidth}
                outputFormat={outputFormat}
                showSafeZone={showSafeZone}
                showGrid={showGrid}
              />
            }
          />
        )}
      </div>

      <TransportBar clip={clip} />
    </div>
  )
}

function TransportBar({ clip }: { clip: Clip }) {
  const playheadSeconds = useEditorStore((state) => state.playheadSeconds)
  const isPlaying = useEditorStore((state) => state.isPlaying)
  const playbackRate = useEditorStore((state) => state.playbackRate)
  const loop = useEditorStore((state) => state.loop)
  const previewMuted = useEditorStore((state) => state.previewMuted)
  const setPlayhead = useEditorStore((state) => state.setPlayhead)
  const setPlaying = useEditorStore((state) => state.setPlaying)
  const setPlaybackRate = useEditorStore((state) => state.setPlaybackRate)
  const setLoop = useEditorStore((state) => state.setLoop)
  const setPreviewMuted = useEditorStore((state) => state.setPreviewMuted)
  const duration = clipOutputDuration(clip)
  const speed = Math.abs(playbackRate)

  return (
    <div className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-t px-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="font-mono text-[15px] font-medium tracking-tight tabular-nums">{formatTimecode(playheadSeconds)}</span>
        <span className="hidden font-mono text-xs text-muted-foreground tabular-nums xl:inline">/ {formatTimecode(duration)}</span>
      </div>

      <div className="flex items-center gap-0.5">
        <IconButton icon={SkipBack} label="Zum Anfang" shortcut="Pos1" onClick={() => setPlayhead(0)} />
        <IconButton icon={StepBack} label="Ein Frame zurück" shortcut="←" onClick={() => setPlayhead(playheadSeconds - 1 / FPS)} />
        <button
          type="button"
          onClick={() => setPlaying(!isPlaying)}
          aria-label={isPlaying ? 'Pause' : 'Abspielen'}
          className="liquid liquid-press mx-1.5 flex size-9 items-center justify-center rounded-full"
        >
          {isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
        </button>
        <IconButton icon={StepForward} label="Ein Frame vor" shortcut="→" onClick={() => setPlayhead(playheadSeconds + 1 / FPS)} />
        <IconButton icon={SkipForward} label="Zum Ende" shortcut="Ende" onClick={() => setPlayhead(duration)} />
      </div>

      <div className="flex items-center justify-end gap-0.5">
        <IconButton icon={Repeat} label="Wiederholen" onClick={() => setLoop(!loop)} pressed={loop} />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<button type="button" />}
            className={cn(
              'transition-ui h-7 rounded-md px-2 font-mono text-xs text-muted-foreground tabular-nums hover:bg-muted hover:text-foreground',
              speed !== 1 && 'text-foreground',
            )}
            aria-label="Wiedergabegeschwindigkeit"
          >
            {speed}×
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuRadioGroup value={String(speed)} onValueChange={(value) => setPlaybackRate(Number(value))}>
              {SPEEDS.map((rate) => (
                <DropdownMenuRadioItem key={rate} value={String(rate)} className="font-mono text-xs">{rate}×</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton icon={previewMuted ? VolumeX : Volume2} label={previewMuted ? 'Vorschau-Ton an' : 'Vorschau stumm'} onClick={() => setPreviewMuted(!previewMuted)} pressed={previewMuted} />
      </div>
    </div>
  )
}
