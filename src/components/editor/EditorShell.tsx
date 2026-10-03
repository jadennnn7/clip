'use client'

import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { Redo2, Undo2, Download, Keyboard, ArrowLeft, Timer, Film, Clapperboard, LoaderCircle, Check, RectangleVertical, Square, RectangleHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import type { Clip, Project } from '@/types/database'
import type { WaveformData } from '@/types/editor'
import type { OutputFormat } from '@/types/workspace'
import {
  useEditorStore,
  useActiveClip,
  useRemovedWords,
  useHistoryDepth,
  undo,
  redo,
} from '@/stores/editor-store'
import { useEditorShortcuts, SHORTCUT_GROUPS } from '@/hooks/use-editor-shortcuts'
import { useStoredLayout } from '@/hooks/use-stored-layout'
import { refreshBillingUsage, useBillingUsage } from '@/stores/billing-usage-store'
import { formatCredits } from '@/lib/credit-format'
import { clipSegments, outputToSource, sourceToOutput, downloadClipExport, type ClipExportFormat } from '@/lib/clip-export'
import { TEXT_PRESETS, createText } from '@/lib/overlay-presets'
import { clipOutputDuration } from '@/lib/clip-export'
import { downloadRender, startClipRender, useRenderProgress, useRenderSync } from '@/lib/render-client'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { Button, buttonVariants } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Viewer } from './Viewer'
import { TrackTimeline } from './TrackTimeline'
import { SourceStrip } from './SourceStrip'
import { TranscriptEditor } from './TranscriptEditor'
import { LibraryPanel, ToolRail } from './LibraryPanel'
import { Inspector } from './inspector/Inspector'

interface EditorShellProps {
  project: Project
  waveform: WaveformData
  videoSrc: string
  /** Das Video ist nicht abspielbar; Transkript und Metadaten bleiben bearbeitbar. */
  mediaError?: string
  initialClipId?: string
  initialTab?: string
  /**
   * Clips, die nicht aus dem Workspace kommen — die Editor-Demo der
   * Landingpage. Änderungen daran werden nicht gespeichert, weil das Projekt
   * nicht im Workspace liegt.
   */
  initialClips?: Clip[]
  /** Öffentliche Demo ohne Konto: Zurück führt zur Landingpage, ein Guthaben gibt es nicht. */
  anonymous?: boolean
}

const EXPORT_FORMATS: { format: ClipExportFormat; label: string }[] = [
  { format: 'srt', label: 'Untertitel (SRT)' },
  { format: 'vtt', label: 'Untertitel (WebVTT)' },
  { format: 'txt', label: 'Transkript (TXT)' },
  { format: 'json', label: 'Schnittdaten (JSON)' },
]

const FORMAT_ICONS: Record<OutputFormat, React.ComponentType<{ className?: string }>> = {
  '9:16': RectangleVertical,
  '1:1': Square,
  '16:9': RectangleHorizontal,
}

/** Wie lange nach der letzten Änderung in den Workspace geschrieben wird. */
const SAVE_DEBOUNCE_MS = 600

/**
 * Der Editor als Schnittplatz.
 *
 *   ┌──────┬────────────┬──────────────────────┬─────────────┐
 *   │ Leiste│ Bibliothek │ Vorschau + Transport │  Inspector  │
 *   ├──────┴────────────┴──────────────────────┴─────────────┤
 *   │ Mehrspur-Timeline                                       │
 *   │ Quellvideo                                              │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Links holt man sich Material (Clips, Transkript, Texte, Elemente,
 * Untertitel, Effekte), in der Mitte arbeitet man am Bild, rechts stehen die
 * Eigenschaften dessen, was ausgewählt ist, unten liegt die Zeit.
 */
export function EditorShell({ project, waveform, videoSrc, mediaError, initialClipId, initialTab, initialClips, anonymous = false }: EditorShellProps) {
  const initialize = useEditorStore((state) => state.initialize)
  const setPlayhead = useEditorStore((state) => state.setPlayhead)
  const setPlaying = useEditorStore((state) => state.setPlaying)
  const setTrim = useEditorStore((state) => state.setTrim)
  const updateWordText = useEditorStore((state) => state.updateWordText)
  const addOverlay = useEditorStore((state) => state.addOverlay)

  const storeClips = useEditorStore((state) => state.clips)
  const activeClipId = useEditorStore((state) => state.activeClipId)
  const playheadSeconds = useEditorStore((state) => state.playheadSeconds)

  const workspaceLayout = useStoredLayout('omegaclip-editor-v2-workspace')
  const panelsLayout = useStoredLayout('omegaclip-editor-v2-panels')

  const activeClip = useActiveClip()
  const removedWords = useRemovedWords(activeClipId)

  const sourceDuration = project.duration_seconds ?? waveform.duration
  // Zurück zur Seite des Videos; die Demo der Landingpage hat keine.
  const backHref = anonymous ? '/' : initialClips ? '/dashboard' : `/dashboard/clips/${project.id}`
  const saveProjectClips = useWorkspaceStore((state) => state.saveProjectClips)
  const outputFormats = useWorkspaceStore((state) => state.outputFormats)
  const defaultFormat = useWorkspaceStore((state) => state.projectSettings[project.id]?.aspectRatio ?? '9:16')

  // Die Clips des Projekts einmal aus dem Workspace in den Editor laden.
  // Eine Ref statt reiner Effekt-Abhängigkeiten: Die Wellenform kommt bei
  // Link-Projekten später nach, und das darf die Bearbeitung nicht zurücksetzen.
  const loadedProject = useRef<string | null>(null)
  useEffect(() => {
    if (loadedProject.current === project.id) return
    loadedProject.current = project.id
    const workspace = useWorkspaceStore.getState()
    const projectClips = initialClips ?? workspace.clips.filter((clip) => clip.project_id === project.id)
    const removed = Object.fromEntries(projectClips.flatMap((clip) => workspace.removedWords[clip.id]?.length ? [[clip.id, workspace.removedWords[clip.id]]] : []))
    initialize(projectClips, removed, initialClipId, sourceDuration)
    // Der Reiter aus der Adresse: Transkript, Untertitel oder Metadaten.
    const editor = useEditorStore.getState()
    if (initialTab === 'captions') { editor.setLibraryTab('captions'); editor.select({ type: 'captions' }) }
    else if (initialTab === 'transcript') editor.setLibraryTab('transcript')
  }, [project.id, initialClipId, initialTab, sourceDuration, initialize, initialClips])

  // Änderungen zurück in den Workspace. Nur, wenn der Editor gerade wirklich
  // dieses Projekt hält — sonst würde `saveProjectClips` die Clips des
  // Projekts durch die eines anderen ersetzen, also löschen.
  const persist = useCallback(() => {
    const { clips, removedWords } = useEditorStore.getState()
    if (loadedProject.current !== project.id || clips.some((clip) => clip.project_id !== project.id)) return
    saveProjectClips(project.id, clips, removedWords)
  }, [project.id, saveProjectClips])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = useEditorStore.subscribe((state, previous) => {
      if (state.clips === previous.clips && state.removedWords === previous.removedWords) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = undefined; persist() }, SAVE_DEBOUNCE_MS)
    })
    return () => {
      unsubscribe()
      // Beim Verlassen nichts verlieren, was noch im Debounce hing.
      if (timer) { clearTimeout(timer); persist() }
    }
  }, [persist])

  // Beim Verlassen den Editor-State leeren. Der Store lebt auf Modulebene und
  // überdauert die Seite: Ein später geöffneter Editor würde sonst zuerst mit
  // Clip, Playhead und vor allem `isPlaying` der letzten Sitzung rendern —
  // der Player startete von selbst —, bevor `initialize` sie überschreibt.
  // Steht nach dem Speichern oben, damit `persist` noch den echten Stand sieht.
  // Die Ref wird mit zurückgesetzt: Im Strict Mode und bei Fast Refresh räumt
  // React erst auf und führt die Effekte dann erneut aus; sonst übersprünge
  // der Ladeeffekt die Neuinitialisierung und der Editor bliebe leer.
  useEffect(() => () => {
    loadedProject.current = null
    useEditorStore.getState().initialize([])
  }, [])

  /** Quellzeit (absolut) → Playhead auf der Ausgabe. */
  const handleSeekSource = useCallback(
    (sourceSeconds: number) => {
      if (!activeClip) return
      setPlayhead(sourceToOutput(clipSegments(activeClip), sourceSeconds - activeClip.start_seconds))
    },
    [activeClip, setPlayhead],
  )

  const handlers = useMemo(
    () => ({
      onSeek: (clipSeconds: number) => setPlayhead(clipSeconds),
      onTogglePlay: () => setPlaying(!useEditorStore.getState().isPlaying),
      onSetIn: () => {
        if (!activeClip) return
        const newStart = activeClip.start_seconds + outputToSource(clipSegments(activeClip), playheadSeconds)
        setTrim(activeClip.id, newStart, activeClip.end_seconds)
        toast.success('Startpunkt gesetzt')
      },
      onSetOut: () => {
        if (!activeClip) return
        const newEnd = activeClip.start_seconds + outputToSource(clipSegments(activeClip), playheadSeconds)
        setTrim(activeClip.id, activeClip.start_seconds, newEnd)
        toast.success('Endpunkt gesetzt')
      },
      onSave: () => {
        // Gespeichert wird ohnehin automatisch; ⌘S schreibt nur sofort.
        persist()
        toast.success('Änderungen gespeichert', { description: 'Im Workspace dieses Browsers.' })
      },
      onAddText: () => {
        if (!activeClip) return
        addOverlay(activeClip.id, createText(TEXT_PRESETS[0], playheadSeconds, clipOutputDuration(activeClip)))
      },
    }),
    [activeClip, playheadSeconds, setPlayhead, setPlaying, setTrim, persist, addOverlay],
  )

  useEditorShortcuts(handlers)
  useRenderSync()

  const render = useCallback(async (clipIds: string[]) => {
    const { clips, removedWords: removed } = useEditorStore.getState()
    const workspace = useWorkspaceStore.getState()
    let started = 0
    for (const id of clipIds) {
      const clip = clips.find((candidate) => candidate.id === id)
      if (!clip) continue
      try {
        await startClipRender({
          project,
          clip,
          removedWords: removed[id] ?? [],
          outputFormat: workspace.outputFormats[id] ?? workspace.projectSettings[project.id]?.aspectRatio ?? '9:16',
        })
        started++
      } catch (error) {
        toast.error('Render konnte nicht starten', { description: error instanceof Error ? error.message : undefined })
        return
      }
    }
    if (started > 0) {
      toast.success(started === 1 ? 'Render gestartet' : `${started} Renders gestartet`, {
        description: started === 1
          ? 'Der Clip wird als MP4 erzeugt. Du kannst weiter bearbeiten.'
          : 'Die Clips werden nacheinander als MP4 erzeugt. Du kannst weiter bearbeiten.',
      })
    }
  }, [project])

  const gaps = useMemo(() => {
    if (!activeClip) return []
    const segments = clipSegments(activeClip)
    return segments.slice(1).map((segment, index): [number, number] => [activeClip.start_seconds + segments[index].end, activeClip.start_seconds + segment.start]).filter(([from, to]) => to - from > 0.01)
  }, [activeClip])

  if (!activeClip) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Keine Clips vorhanden.
      </div>
    )
  }

  const outputFormat = outputFormats[activeClip.id] ?? defaultFormat
  const sourceWidth = project.width ?? 1920
  const sourceHeight = project.height ?? 1080
  const sourceTime = activeClip.start_seconds + outputToSource(clipSegments(activeClip), playheadSeconds)

  return (
    <div className="flex h-full flex-col bg-[oklch(0.11_0_0)]">
      <EditorHeader
        project={project}
        clip={activeClip}
        clips={storeClips}
        backHref={backHref}
        anonymous={anonymous}
        outputFormat={outputFormat}
        removedWords={removedWords}
        onRender={render}
      />

      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1" {...workspaceLayout}>
        <ResizablePanel id="workspace" defaultSize="62%" minSize="30%">
          <div className="flex h-full min-h-0">
            <ToolRail />
            <ResizablePanelGroup orientation="horizontal" className="min-w-0 flex-1" {...panelsLayout}>
              <ResizablePanel id="library" defaultSize="24%" minSize="15%" maxSize="42%">
                <LibraryPanel
                  clip={activeClip}
                  clips={storeClips}
                  videoSrc={videoSrc}
                  transcript={
                    <TranscriptEditor
                      clip={activeClip}
                      currentTime={playheadSeconds}
                      removedWords={removedWords}
                      onSeekSource={(seconds) => handleSeekSource(activeClip.start_seconds + seconds)}
                      onEditWord={(index, text) => updateWordText(activeClip.id, index, text)}
                    />
                  }
                />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel id="viewer" defaultSize="50%" minSize="28%">
                <Viewer
                  clip={activeClip}
                  videoSrc={videoSrc}
                  mediaError={mediaError}
                  sourceWidth={sourceWidth}
                  sourceHeight={sourceHeight}
                  outputFormat={outputFormat}
                  removedWords={removedWords}
                />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel id="inspector" defaultSize="26%" minSize="18%" maxSize="40%">
                <Inspector clip={activeClip} outputFormat={outputFormat} />
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel id="timeline" defaultSize="38%" minSize="22%">
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1">
              <TrackTimeline
                clip={activeClip}
                waveform={waveform}
                videoSrc={mediaError ? '' : videoSrc}
                sourceAspect={sourceWidth / sourceHeight}
                removedWords={removedWords}
              />
            </div>
            <div className="flex h-11 shrink-0 items-center gap-2 border-t bg-[oklch(0.13_0_0)] py-1.5 pr-2 pl-3">
              <span className="w-[74px] shrink-0 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Quelle</span>
              <SourceStrip
                className="h-full min-w-0 flex-1"
                waveform={waveform}
                trimStart={activeClip.start_seconds}
                trimEnd={activeClip.end_seconds}
                gaps={gaps}
                currentTime={sourceTime}
                onSeek={handleSeekSource}
                onTrimChange={(start, end) => setTrim(activeClip.id, start, end)}
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

function EditorHeader({
  project,
  clip,
  clips,
  backHref,
  anonymous,
  outputFormat,
  removedWords,
  onRender,
}: {
  project: Project
  clip: Clip
  clips: Clip[]
  backHref: string
  anonymous: boolean
  outputFormat: OutputFormat
  removedWords: number[]
  onRender: (clipIds: string[]) => Promise<void>
}) {
  const history = useHistoryDepth()
  const setOutputFormat = useWorkspaceStore((state) => state.setOutputFormat)
  const renderProgress = useRenderProgress((state) => state[clip.id] ?? null)
  // Das echte Guthaben; die Kopfleiste des Dashboards, die es sonst lädt, gibt es im Editor nicht.
  const usage = useBillingUsage((state) => state.usage)
  useEffect(() => { if (!anonymous) void refreshBillingUsage() }, [anonymous])
  const remainingCredits = usage ? usage.available : null
  const FormatIcon = FORMAT_ICONS[outputFormat]
  const rendering = clip.render_status === 'queued' || clip.render_status === 'rendering'

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-[oklch(0.135_0_0)] px-2.5">
      <Tooltip>
        {/* Der Trigger rendert direkt als Link — ein Button, der einen Link
            umschließt, verschachtelt zwei interaktive Elemente ineinander. */}
        <TooltipTrigger
          render={<Link href={backHref} />}
          className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
          aria-label={anonymous ? 'Zur Startseite' : 'Zurück zu den Clips'}
        >
          <ArrowLeft className="size-4" />
        </TooltipTrigger>
        <TooltipContent side="bottom">{anonymous ? 'Zur Startseite' : 'Zurück zu den Clips'}</TooltipContent>
      </Tooltip>

      <div className="mx-0.5 h-5 w-px bg-border" />

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[13px] leading-tight font-medium">{clip.title}</h1>
        <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
          {project.title} · {clips.length} Clips
        </p>
      </div>

      <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" />} onClick={undo} disabled={history.past === 0} aria-label="Rückgängig">
            <Undo2 className="size-4" />
          </TooltipTrigger>
          <TooltipContent side="bottom">Rückgängig (⌘Z) · {history.past} Schritte</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" />} onClick={redo} disabled={history.future === 0} aria-label="Wiederholen">
            <Redo2 className="size-4" />
          </TooltipTrigger>
          <TooltipContent side="bottom">Wiederholen (⌘⇧Z) · {history.future} Schritte</TooltipContent>
        </Tooltip>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 font-mono text-xs" />} aria-label="Ausgabeformat">
          <FormatIcon className="size-3.5" />
          {outputFormat}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Ausgabeformat</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={outputFormat} onValueChange={(value) => setOutputFormat(clip.id, value as OutputFormat)}>
              {(Object.keys(FORMAT_ICONS) as OutputFormat[]).map((format) => {
                const Icon = FORMAT_ICONS[format]
                return (
                  <DropdownMenuRadioItem key={format} value={format}>
                    <Icon /> {format === '9:16' ? 'Hochkant 9:16' : format === '1:1' ? 'Quadrat 1:1' : 'Quer 16:9'}
                  </DropdownMenuRadioItem>
                )
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {remainingCredits !== null ? (
        <Tooltip>
          <TooltipTrigger render={<div />} className="hidden items-center gap-1.5 rounded-md border px-2 py-1 md:flex">
            <Timer className="size-3 text-muted-foreground" />
            <span className="text-xs font-medium tabular-nums">{formatCredits(remainingCredits)}</span>
            <span className="text-xs text-muted-foreground">Credits</span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Verbleibendes Guthaben · 1 Credit = 1 Minute Ausgangsvideo, Exporte inklusive</TooltipContent>
        </Tooltip>
      ) : null}

      <Popover>
        <PopoverTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label="Tastaturkürzel">
          <Keyboard className="size-4" />
        </PopoverTrigger>
        <PopoverContent align="end" className="max-h-[70vh] w-[26rem] overflow-y-auto">
          <p className="text-sm font-medium">Tastaturkürzel</p>
          <div className="grid grid-cols-1 gap-4">
            {SHORTCUT_GROUPS.map((group) => (
              <section key={group.title}>
                <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{group.title}</h3>
                <dl className="flex flex-col gap-1.5">
                  {group.items.map((item) => (
                    <div key={item.keys} className="flex items-baseline justify-between gap-3 text-xs">
                      <dt className="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono">{item.keys}</dt>
                      <dd className="text-right text-muted-foreground">{item.description}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="prominent" size="sm" className="ml-1 gap-1.5" />}>
          {rendering ? <LoaderCircle className="size-3.5 animate-spin" /> : clip.render_status === 'ready' ? <Check className="size-3.5" /> : <Download className="size-3.5" />}
          {rendering ? (renderProgress !== null ? `${Math.round(renderProgress * 100)} %` : 'Rendert …') : 'Exportieren'}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Video</DropdownMenuLabel>
            {clip.render_status === 'ready' && clip.render_key ? (
              <DropdownMenuItem onClick={() => downloadRender(clip.render_key!)}>
                <Download />MP4 herunterladen
              </DropdownMenuItem>
            ) : rendering ? (
              <DropdownMenuItem disabled>
                <LoaderCircle className="animate-spin" />
                {clip.render_status === 'queued' || renderProgress === null ? 'Wartet auf den Render …' : `Rendert … ${Math.round(renderProgress * 100)} %`}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => void onRender([clip.id])}>
                <Film />{clip.render_status === 'error' ? 'Render erneut versuchen' : `Video rendern (MP4, ${outputFormat})`}
              </DropdownMenuItem>
            )}
            {clips.length > 1 ? (
              <DropdownMenuItem
                disabled={clips.every((candidate) => candidate.render_status !== 'pending' && candidate.render_status !== 'error')}
                onClick={() => void onRender(clips.filter((candidate) => candidate.render_status === 'pending' || candidate.render_status === 'error').map((candidate) => candidate.id))}
              >
                <Clapperboard />Alle Clips rendern
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Untertitel und Daten</DropdownMenuLabel>
            {EXPORT_FORMATS.map(({ format, label }) => (
              <DropdownMenuItem key={format} onClick={() => downloadClipExport(clip, removedWords, format, outputFormat)}>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
