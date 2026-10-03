'use client'

import React from 'react'
import { Captions, Film, Gauge, Scissors, Shapes, Smile, Type } from 'lucide-react'
import type { Clip, Overlay } from '@/types/database'
import type { OutputFormat } from '@/types/workspace'
import { useEditorStore, useSelectedOverlay } from '@/stores/editor-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CaptionStylePanel } from '../CaptionStylePanel'
import { OverlayInspector } from './OverlayInspector'
import { VideoInspector } from './VideoInspector'

const OVERLAY_HEAD: Record<Overlay['kind'], { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  text: { icon: Type, label: 'Text' },
  shape: { icon: Shapes, label: 'Form' },
  emoji: { icon: Smile, label: 'Emoji' },
  progress: { icon: Gauge, label: 'Fortschrittsbalken' },
}

/**
 * Eigenschaften der Auswahl — was in der Timeline oder im Bild angeklickt
 * ist. Ohne Auswahl steht hier das Video selbst.
 */
export function Inspector({ clip, outputFormat }: { clip: Clip; outputFormat: OutputFormat }) {
  const selection = useEditorStore((state) => state.selection)
  const setCaptionStyle = useEditorStore((state) => state.setCaptionStyle)
  const applyCaptionPreset = useEditorStore((state) => state.applyCaptionPreset)
  const overlay = useSelectedOverlay()

  const head = overlay
    ? OVERLAY_HEAD[overlay.kind]
    : selection.type === 'captions'
      ? { icon: Captions, label: 'Untertitel' }
      : selection.type === 'segment'
        ? { icon: Scissors, label: 'Abschnitt' }
        : { icon: Film, label: 'Clip' }
  const Icon = head.icon

  return (
    <div className="flex h-full min-w-0 flex-col bg-[oklch(0.155_0_0)]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Inspector</span>
        <span className="text-[11px] text-muted-foreground/60">·</span>
        <span className="truncate text-xs font-medium">{head.label}</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {overlay ? (
          <OverlayInspector key={overlay.id} clipId={clip.id} overlay={overlay} />
        ) : selection.type === 'captions' ? (
          <CaptionStylePanel
            style={clip.caption_style}
            onChange={(patch) => setCaptionStyle(clip.id, patch)}
            onApplyPreset={(preset) => applyCaptionPreset(clip.id, preset)}
          />
        ) : (
          <VideoInspector clip={clip} outputFormat={outputFormat} segmentIndex={selection.type === 'segment' ? selection.index : null} />
        )}
      </ScrollArea>
    </div>
  )
}
