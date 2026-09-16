'use client'

import React, { useCallback, useEffect, useMemo } from 'react'
import { Redo2, Undo2, Download, Keyboard, Sparkles } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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

  // --- Shortcut-Handler ----------------------------------------------------
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

  return (
    <div className="flex h-full flex-col">
      {/* --- Kopfzeile --- */}
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium">{project.title}</h1>
          <p className="text-xs text-muted-foreground">
            {storeClips.length} Clips · {Math.round(sourceDuration / 60)} Min Quellmaterial
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="ghost" size="icon" />}
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
              render={<Button variant="ghost" size="icon" />}
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
              render={<Button variant="ghost" size="icon" />}
              aria-label="Tastaturkürzel"
            >
              <Keyboard className="size-4" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <p className="mb-2 text-sm font-medium">Tastaturkürzel</p>
              <dl className="flex flex-col gap-1.5">
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

          <Button size="sm" className="ml-2 gap-1.5">
            <Download className="size-3.5" />
            Exportieren
          </Button>
        </div>
      </header>

      {/* --- Hauptbereich --- */}
      {/* react-resizable-panels v4: `orientation` statt `direction`, Größen als
          Strings mit Einheit. Persistenz bringt die Bibliothek nicht mehr mit —
          sie läuft über useStoredLayout() unten. */}
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
            <div className="shrink-0 border-t bg-background px-4 py-3">
              <div className="mb-2 flex items-center gap-3 text-xs">
                <span className="font-mono tabular-nums">
                  {formatClock(playheadSeconds)} / {formatClock(activeClip.end_seconds - activeClip.start_seconds)}
                </span>
                {isPlaying && playbackRate !== 1 ? (
                  <Badge variant="secondary" className="px-1.5 py-0 font-mono text-[10px]">
                    {playbackRate > 0 ? `${playbackRate}×` : `${Math.abs(playbackRate)}× ◀`}
                  </Badge>
                ) : null}
                <span className="ml-auto text-muted-foreground">
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
                <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
                  <Sparkles className="size-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Clips nach Viralitäts-Score</span>
                </div>
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
                <TabsList className="mx-3 mt-3 shrink-0">
                  <TabsTrigger value="transcript">Transkript</TabsTrigger>
                  <TabsTrigger value="captions">Untertitel</TabsTrigger>
                  <TabsTrigger value="meta">Metadaten</TabsTrigger>
                </TabsList>

                <TabsContent value="transcript" className="mt-2 min-h-0 flex-1">
                  <TranscriptEditor
                    clip={activeClip}
                    currentTime={playheadSeconds}
                    removedWords={removedWords}
                    onSeek={setPlayhead}
                    onToggleWord={(index) => toggleWordRemoved(activeClip.id, index)}
                    onEditWord={(index, text) => updateWordText(activeClip.id, index, text)}
                  />
                </TabsContent>

                <TabsContent value="captions" className="mt-2 min-h-0 flex-1">
                  <CaptionStylePanel
                    style={activeClip.caption_style}
                    onChange={(patch) => setCaptionStyle(activeClip.id, patch)}
                    onApplyPreset={(preset) => applyCaptionPreset(activeClip.id, preset)}
                  />
                </TabsContent>

                <TabsContent value="meta" className="mt-2 min-h-0 flex-1 overflow-auto px-3 pb-3">
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
    <dl className="flex flex-col gap-4 text-sm">
      <div>
        <dt className="mb-1 text-xs text-muted-foreground">Titel</dt>
        <dd className="font-medium">{clip.title}</dd>
      </div>
      <div>
        <dt className="mb-1 text-xs text-muted-foreground">Beschreibung</dt>
        <dd className="text-muted-foreground">{clip.description}</dd>
      </div>
      <div>
        <dt className="mb-1 text-xs text-muted-foreground">Hashtags</dt>
        <dd className="flex flex-wrap gap-1">
          {clip.hashtags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </dd>
      </div>
      {clip.score_reasoning ? (
        <div>
          <dt className="mb-1 text-xs text-muted-foreground">
            Warum dieser Clip einen Score von {clip.virality_score} hat
          </dt>
          <dd className="rounded-md border bg-muted/40 p-2.5 text-xs leading-relaxed text-muted-foreground">
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
