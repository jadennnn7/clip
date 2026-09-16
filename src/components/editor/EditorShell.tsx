'use client'

import React, { useCallback, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Redo2, Undo2, Download, Keyboard, ArrowLeft, Timer } from 'lucide-react'
import { toast } from 'sonner'
import type { Clip, Project } from '@/types/database'
import type { WaveformData } from '@/types/editor'
import {
  useEditorStore,
  useActiveClip,
  useRemovedWords,
  useHistoryDepth,
  undo,
  redo,
} from '@/stores/editor-store'
import { useEditorShortcuts, SHORTCUT_HELP } from '@/hooks/use-editor-shortcuts'
import { useStoredLayout } from '@/hooks/use-stored-layout'
import { mockUsage } from '@/lib/mock-data'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PreviewPlayer } from './PreviewPlayer'
import { Timeline } from './Timeline'
import { ClipList } from './ClipList'
import { TranscriptEditor } from './TranscriptEditor'
import { CaptionStylePanel } from './CaptionStylePanel'

interface EditorShellProps {
  project: Project
  clips: Clip[]
  waveform: WaveformData
  videoSrc: string
}

/** Kopfzeile eines Panels. Einheitliche Höhe hält die Spalten in einer Flucht. */
function PanelHeader({
  icon: Icon,
  title,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
      {Icon ? <Icon className="size-3.5 text-muted-foreground" /> : null}
      <span className="text-sm font-medium">{title}</span>
      {children ? <div className="ml-auto flex items-center gap-1">{children}</div> : null}
    </div>
  )
}

export function EditorShell({ project, clips, waveform, videoSrc }: EditorShellProps) {
  const initialize = useEditorStore((state) => state.initialize)
  const setActiveClip = useEditorStore((state) => state.setActiveClip)
  const setPlayhead = useEditorStore((state) => state.setPlayhead)
  const setPlaying = useEditorStore((state) => state.setPlaying)
  const setTrim = useEditorStore((state) => state.setTrim)
  const setCaptionStyle = useEditorStore((state) => state.setCaptionStyle)
  const applyCaptionPreset = useEditorStore((state) => state.applyCaptionPreset)
  const toggleWordRemoved = useEditorStore((state) => state.toggleWordRemoved)
  const updateWordText = useEditorStore((state) => state.updateWordText)

  const storeClips = useEditorStore((state) => state.clips)
  const activeClipId = useEditorStore((state) => state.activeClipId)
  const playheadSeconds = useEditorStore((state) => state.playheadSeconds)
  const isPlaying = useEditorStore((state) => state.isPlaying)
  const playbackRate = useEditorStore((state) => state.playbackRate)

  const horizontalLayout = useStoredLayout('omegaclip-editor-horizontal')
  const verticalLayout = useStoredLayout('omegaclip-editor-vertical')

  const activeClip = useActiveClip()
  const removedWords = useRemovedWords(activeClipId)
  const history = useHistoryDepth()

  // Beim ersten Rendern die Mock-/Server-Daten in den Store laden. In Phase 2
  // wird hier stattdessen aus Supabase geladen — die Komponenten bleiben gleich.
  useEffect(() => {
    initialize(clips)
    // Die Historie soll nicht mit dem Initialzustand starten.
    useEditorStore.temporal.getState().clear()
  }, [clips, initialize])

  const sourceDuration = project.duration_seconds ?? waveform.duration

  const handleSeekSource = useCallback(
    (sourceSeconds: number) => {
      if (!activeClip) return
      const clipRelative = sourceSeconds - activeClip.start_seconds
      const clipDuration = activeClip.end_seconds - activeClip.start_seconds
      setPlayhead(Math.max(0, Math.min(clipRelative, clipDuration)))
    },
    [activeClip, setPlayhead],
  )

  const handlers = useMemo(
    () => ({
      onSeek: (clipSeconds: number) => setPlayhead(clipSeconds),
      onTogglePlay: () => setPlaying(!useEditorStore.getState().isPlaying),
      onSetIn: () => {
        if (!activeClip) return
        const newStart = activeClip.start_seconds + playheadSeconds
        setTrim(activeClip.id, newStart, activeClip.end_seconds)
        toast.success('Startpunkt gesetzt')
      },
      onSetOut: () => {
        if (!activeClip) return
        const newEnd = activeClip.start_seconds + playheadSeconds
        setTrim(activeClip.id, activeClip.start_seconds, newEnd)
        toast.success('Endpunkt gesetzt')
      },
      onSave: () => {
        // Phase 2: persistiert die Clips über eine Server Action nach Supabase.
        toast.success('Änderungen gespeichert', {
          description: 'In Phase 1 lokal — die Persistenz folgt mit der Pipeline.',
        })
      },
    }),
    [activeClip, playheadSeconds, setPlayhead, setPlaying, setTrim],
  )

  useEditorShortcuts(handlers)

  if (!activeClip) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Keine Clips vorhanden.
      </div>
    )
  }

  const sourceTime = activeClip.start_seconds + playheadSeconds
  const clipDuration = activeClip.end_seconds - activeClip.start_seconds
  const remainingMinutes = Math.round(
    mockUsage.renderMinutesLimit - mockUsage.renderMinutesUsed,
  )

  return (
    <div className="flex h-full flex-col">
      {/* --- Kopfzeile: trägt auch die Funktionen der App-Navigation --- */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <Tooltip>
          {/* Der Trigger rendert direkt als Link — ein Button, der einen Link
              umschließt, verschachtelt zwei interaktive Elemente ineinander. */}
          <TooltipTrigger
            render={<Link href="/dashboard" />}
            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            aria-label="Zurück zu den Projekten"
          >
            <ArrowLeft className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Zurück zu den Projekten</TooltipContent>
        </Tooltip>

        <div className="mx-1 h-5 w-px bg-border" />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm leading-tight font-medium">{project.title}</h1>
          <p className="mt-0.5 text-xs leading-tight text-muted-foreground">
            {storeClips.length} Clips · {Math.round(sourceDuration / 60)} Min Quellmaterial
          </p>
        </div>

        <Tooltip>
          <TooltipTrigger
            render={<div />}
            className="mr-1 hidden items-center gap-1.5 rounded-md border px-2 py-1 sm:flex"
          >
            <Timer className="size-3 text-muted-foreground" />
            <span className="text-xs font-medium tabular-nums">{remainingMinutes}</span>
            <span className="text-xs text-muted-foreground">Min</span>
          </TooltipTrigger>
          <TooltipContent>Verbleibende Render-Minuten</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" size="icon-sm" />}
            onClick={undo}
            disabled={history.past === 0}
            aria-label="Rückgängig"
          >
            <Undo2 className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Rückgängig (⌘Z) · {history.past} Schritte</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" size="icon-sm" />}
            onClick={redo}
            disabled={history.future === 0}
            aria-label="Wiederholen"
          >
            <Redo2 className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Wiederholen (⌘⇧Z) · {history.future} Schritte</TooltipContent>
        </Tooltip>

        <Popover>
          <PopoverTrigger
            render={<Button variant="ghost" size="icon-sm" />}
            aria-label="Tastaturkürzel"
          >
            <Keyboard className="size-4" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <p className="mb-3 text-sm font-medium">Tastaturkürzel</p>
            <dl className="flex flex-col gap-2">
              {SHORTCUT_HELP.map((item) => (
                <div key={item.keys} className="flex items-baseline justify-between gap-3 text-xs">
                  <dt className="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono">
                    {item.keys}
                  </dt>
                  <dd className="text-right text-muted-foreground">{item.description}</dd>
                </div>
              ))}
            </dl>
          </PopoverContent>
        </Popover>

        <Button size="sm" className="ml-1 gap-1.5">
          <Download className="size-3.5" />
          Exportieren
        </Button>
      </header>

      {/* --- Hauptbereich --- */}
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1"
        {...horizontalLayout}
      >
        <ResizablePanel id="preview" defaultSize="58%" minSize="35%">
          <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1">
              <PreviewPlayer
                clip={activeClip}
                videoSrc={videoSrc}
                sourceWidth={project.width ?? 1920}
                sourceHeight={project.height ?? 1080}
              />
            </div>

            {/* --- Timeline --- */}
            <div className="shrink-0 border-t bg-card/40 px-4 pt-3 pb-4">
              <div className="mb-2.5 flex items-center gap-3">
                <span className="font-mono text-sm font-medium tabular-nums">
                  {formatClock(playheadSeconds)}
                </span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  / {formatClock(clipDuration)}
                </span>
                {isPlaying && playbackRate !== 1 ? (
                  <Badge variant="secondary" className="px-1.5 py-0 font-mono text-xs">
                    {playbackRate > 0 ? `${playbackRate}×` : `${Math.abs(playbackRate)}× ◀`}
                  </Badge>
                ) : null}
                <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
                  Ziehe die Griffe, um den Clip zu trimmen
                </span>
              </div>

              <Timeline
                waveform={waveform}
                trimStart={activeClip.start_seconds}
                trimEnd={activeClip.end_seconds}
                currentTime={sourceTime}
                onSeek={handleSeekSource}
                onTrimChange={(start, end) => setTrim(activeClip.id, start, end)}
              />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel id="sidebar" defaultSize="42%" minSize="26%">
          <ResizablePanelGroup orientation="vertical" {...verticalLayout}>
            <ResizablePanel id="clips" defaultSize="46%" minSize="20%">
              <div className="flex h-full flex-col">
                <PanelHeader title="Clips">
                  <span className="text-xs text-muted-foreground">nach Score</span>
                </PanelHeader>
                <div className="min-h-0 flex-1">
                  <ClipList
                    clips={storeClips}
                    activeClipId={activeClipId}
                    onSelect={setActiveClip}
                  />
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel id="inspector" defaultSize="54%" minSize="20%">
              <Tabs defaultValue="transcript" className="flex h-full flex-col gap-0">
                <div className="flex h-11 shrink-0 items-center border-b px-3">
                  <TabsList className="h-7">
                    <TabsTrigger value="transcript" className="text-xs">
                      Transkript
                    </TabsTrigger>
                    <TabsTrigger value="captions" className="text-xs">
                      Untertitel
                    </TabsTrigger>
                    <TabsTrigger value="meta" className="text-xs">
                      Metadaten
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="transcript" className="mt-0 min-h-0 flex-1">
                  <TranscriptEditor
                    clip={activeClip}
                    currentTime={playheadSeconds}
                    removedWords={removedWords}
                    onSeek={setPlayhead}
                    onToggleWord={(index) => toggleWordRemoved(activeClip.id, index)}
                    onEditWord={(index, text) => updateWordText(activeClip.id, index, text)}
                  />
                </TabsContent>

                <TabsContent value="captions" className="mt-0 min-h-0 flex-1">
                  <CaptionStylePanel
                    style={activeClip.caption_style}
                    onChange={(patch) => setCaptionStyle(activeClip.id, patch)}
                    onApplyPreset={(preset) => applyCaptionPreset(activeClip.id, preset)}
                  />
                </TabsContent>

                <TabsContent value="meta" className="mt-0 min-h-0 flex-1 overflow-auto p-4">
                  <ClipMetadata clip={activeClip} />
                </TabsContent>
              </Tabs>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

function ClipMetadata({ clip }: { clip: Clip }) {
  return (
    <dl className="flex flex-col gap-5 text-sm">
      <div>
        <dt className="mb-1.5 text-xs text-muted-foreground">Titel</dt>
        <dd className="text-base leading-snug font-medium text-balance">{clip.title}</dd>
      </div>
      <div>
        <dt className="mb-1.5 text-xs text-muted-foreground">Beschreibung</dt>
        <dd className="leading-relaxed text-pretty text-muted-foreground">{clip.description}</dd>
      </div>
      <div>
        <dt className="mb-1.5 text-xs text-muted-foreground">Hashtags</dt>
        <dd className="flex flex-wrap gap-1">
          {clip.hashtags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs font-normal">
              {tag}
            </Badge>
          ))}
        </dd>
      </div>
      {clip.score_reasoning ? (
        <div>
          <dt className="mb-1.5 text-xs text-muted-foreground">
            Warum dieser Clip {clip.virality_score} Punkte bekommt
          </dt>
          <dd className="rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed text-pretty text-muted-foreground">
            {clip.score_reasoning}
          </dd>
        </div>
      ) : null}
    </dl>
  )
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds)
  const mins = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  const centis = Math.floor((safe % 1) * 100)
  return `${mins}:${secs.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`
}
