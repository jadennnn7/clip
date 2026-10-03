'use client'

import React from 'react'
import {
  Captions,
  Clapperboard,
  Gauge,
  PanelBottom,
  PanelTop,
  Plus,
  ScrollText,
  Shapes,
  Sparkles,
  Type,
} from 'lucide-react'
import type { Clip, VideoLayout } from '@/types/database'
import { cn } from '@/lib/utils'
import { clipOutputDuration } from '@/lib/clip-export'
import { EMOJIS, LOOKS, SHAPE_PRESETS, TEXT_PRESETS, createEmoji, createProgress, createShape, createText, type ShapePreset, type TextPreset } from '@/lib/overlay-presets'
import { useEditorStore, type LibraryTab } from '@/stores/editor-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EMOJI_FONT_STACK, ensureEmojiFont, fontStack, resolveWeight } from '../../../remotion/fonts'
import { VIDEO_LAYOUT_LABELS, resolveVideoSettings, withAlpha } from '../../../remotion/overlays/defaults'
import { videoFilter } from '../../../remotion/video/VideoLayer'
import { CaptionPresetGrid } from './CaptionStylePanel'
import { ClipList } from './ClipList'
import { HookTitlePanel } from './HookTitlePanel'
import { Segmented, ToggleField } from './controls'
import { frameAt, useFrames } from './frames'
import { useFontPreviews } from './fonts-preview'

const TABS: Array<{ id: LibraryTab; label: string; icon: React.ComponentType<{ className?: string }>; title: string; hint: string }> = [
  { id: 'clips', label: 'Clips', icon: Clapperboard, title: 'Clips', hint: 'Nach Score sortiert · 1–9 wählt aus' },
  { id: 'transcript', label: 'Skript', icon: ScrollText, title: 'Transkript', hint: 'Schneiden über den Text' },
  { id: 'text', label: 'Text', icon: Type, title: 'Text', hint: 'Klicken fügt am Playhead ein' },
  { id: 'elements', label: 'Elemente', icon: Shapes, title: 'Elemente', hint: 'Formen, Emojis, Fortschritt' },
  { id: 'captions', label: 'Untertitel', icon: Captions, title: 'Untertitel', hint: 'Hook-Titel und Wort-Untertitel' },
  { id: 'effects', label: 'Effekte', icon: Sparkles, title: 'Effekte', hint: 'Looks, Aufteilung, Blenden' },
]

/** Die senkrechte Werkzeugleiste ganz links — wie in CapCut oder Resolve. */
export function ToolRail() {
  const tab = useEditorStore((state) => state.libraryTab)
  const setTab = useEditorStore((state) => state.setLibraryTab)
  return (
    <nav aria-label="Bibliothek" className="flex w-[64px] shrink-0 flex-col items-center gap-1 border-r bg-[oklch(0.125_0_0)] py-2">
      {TABS.map((item) => {
        const Icon = item.icon
        const active = item.id === tab
        return (
          <Tooltip key={item.id}>
            <TooltipTrigger
              render={<button type="button" />}
              onClick={() => setTab(item.id)}
              aria-pressed={active}
              className={cn(
                'transition-ui flex w-[54px] flex-col items-center gap-1 rounded-lg py-2 text-[10px] leading-none text-muted-foreground',
                'hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                active && 'glass-lens text-foreground',
              )}
            >
              <Icon className="size-[18px]" />
              {item.label}
            </TooltipTrigger>
            <TooltipContent side="right">{item.title}</TooltipContent>
          </Tooltip>
        )
      })}
    </nav>
  )
}

export function LibraryPanel({
  clip,
  clips,
  videoSrc,
  transcript,
}: {
  clip: Clip
  clips: Clip[]
  videoSrc: string
  transcript: React.ReactNode
}) {
  const tab = useEditorStore((state) => state.libraryTab)
  const activeClipId = useEditorStore((state) => state.activeClipId)
  const setActiveClip = useEditorStore((state) => state.setActiveClip)
  const meta = TABS.find((item) => item.id === tab)!

  return (
    <div className="flex h-full min-w-0 flex-col bg-[oklch(0.15_0_0)]">
      <div className="flex h-10 shrink-0 items-baseline gap-2 border-b px-3 pt-3">
        <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{meta.title}</span>
        <span className="truncate text-[11px] text-muted-foreground/60">{meta.hint}</span>
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'clips' ? <ClipList clips={clips} activeClipId={activeClipId} onSelect={setActiveClip} /> : null}
        {tab === 'transcript' ? transcript : null}
        {tab === 'text' ? <TextLibrary clip={clip} /> : null}
        {tab === 'elements' ? <ElementLibrary clip={clip} /> : null}
        {tab === 'captions' ? <CaptionLibrary clip={clip} /> : null}
        {tab === 'effects' ? <EffectsLibrary clip={clip} videoSrc={videoSrc} /> : null}
      </div>
    </div>
  )
}

function useInsert(clip: Clip) {
  const addOverlay = useEditorStore((state) => state.addOverlay)
  return (make: (at: number, duration: number) => Parameters<typeof addOverlay>[1]) => {
    const { playheadSeconds } = useEditorStore.getState()
    addOverlay(clip.id, make(playheadSeconds, clipOutputDuration(clip)))
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{children}</h3>
}

/** Eine Vorlage in klein — dieselben Werte wie im Video, auf Kachelgröße skaliert. */
function TextTile({ preset, onClick }: { preset: TextPreset; onClick: () => void }) {
  const template = preset.template
  const scale = 0.2
  const firstLine = template.text.split('\n').slice(0, 2).join('\n')
  // Das längste Wort muss in die Kachel passen — sonst bräche „SCHLAGZEILE“
  // mitten im Wort um. Versalien laufen breiter als Gemeine.
  const longest = Math.max(...firstLine.split(/\s+/).map((word) => word.length), 1)
  const fontSize = Math.max(10, Math.min(24, template.fontSize * scale, 124 / (longest * (template.uppercase ? 0.78 : 0.58))))
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-1.5 text-left focus-visible:outline-none"
    >
      <span className="transition-ui relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-[radial-gradient(ellipse_at_30%_20%,rgb(255_255_255/0.1),transparent_60%),linear-gradient(160deg,oklch(0.24_0_0),oklch(0.16_0_0))] p-2 group-hover:border-white/30 group-focus-visible:ring-2 group-focus-visible:ring-ring/60">
        <span
          className="max-w-full text-center leading-tight whitespace-pre-line"
          style={{
            fontFamily: fontStack(template.font),
            fontWeight: resolveWeight(template.font, template.fontWeight),
            fontStyle: template.italic ? 'italic' : 'normal',
            fontSize,
            color: template.color,
            textTransform: template.uppercase ? 'uppercase' : 'none',
            letterSpacing: `${template.letterSpacing}em`,
            textAlign: template.align,
            WebkitTextStroke: template.strokeWidth > 0 ? `${Math.max(0.6, template.strokeWidth * scale * 0.5)}px ${template.strokeColor}` : undefined,
            paintOrder: 'stroke fill',
            background: template.background ? withAlpha(template.background, template.backgroundOpacity) : undefined,
            padding: template.background ? `${template.padding * scale * 0.5}px ${template.padding * scale}px` : undefined,
            borderRadius: template.background ? Math.min(template.radius * scale, 999) : undefined,
            transform: template.rotation ? `rotate(${template.rotation}deg)` : undefined,
            textShadow: template.shadow > 0 ? '0 2px 8px rgb(0 0 0 / 0.6)' : undefined,
          }}
        >
          {firstLine}
        </span>
        <span className="transition-ui absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow group-hover:opacity-100">
          <Plus className="size-3" />
        </span>
      </span>
      <span className="px-0.5 text-xs text-muted-foreground group-hover:text-foreground">{preset.label}</span>
    </button>
  )
}

function TextLibrary({ clip }: { clip: Clip }) {
  useFontPreviews([...new Set(TEXT_PRESETS.map((preset) => preset.template.font))])
  const insert = useInsert(clip)
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-3">
        <button
          type="button"
          onClick={() => insert((at, duration) => createText(TEXT_PRESETS[2], at, duration))}
          className="transition-ui flex h-10 items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 text-sm text-muted-foreground hover:border-white/40 hover:bg-white/[0.04] hover:text-foreground"
        >
          <Type className="size-4" /> Text hinzufügen
        </button>
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-3">
          {TEXT_PRESETS.map((preset) => (
            <TextTile key={preset.id} preset={preset} onClick={() => insert((at, duration) => createText(preset, at, duration))} />
          ))}
        </div>
      </div>
    </ScrollArea>
  )
}

function ShapeTile({ preset, onClick }: { preset: ShapePreset; onClick: () => void }) {
  const template = preset.template
  const fill = template.fill ? withAlpha(template.fill, Math.max(0.35, template.fillOpacity)) : 'transparent'
  const ratio = template.width / template.height
  const width = ratio >= 1 ? 40 : 40 * ratio
  const height = ratio >= 1 ? Math.max(4, 40 / ratio) : 40
  return (
    <button type="button" onClick={onClick} className="group flex flex-col items-center gap-1.5 focus-visible:outline-none">
      <span className="transition-ui flex aspect-square w-full items-center justify-center rounded-lg border border-border bg-white/[0.03] group-hover:border-white/30 group-hover:bg-white/[0.06] group-focus-visible:ring-2 group-focus-visible:ring-ring/60">
        {template.shape === 'arrow' ? (
          <svg width="40" height="18" viewBox="0 0 40 18" aria-hidden><path d="M0 6 H26 V0 L40 9 L26 18 V12 H0 Z" fill="white" /></svg>
        ) : (
          <span
            style={{
              width,
              height: template.shape === 'line' ? 4 : height,
              background: template.fill ? fill : 'transparent',
              border: template.strokeWidth > 0 ? `2px solid ${template.stroke}` : template.fill && template.fillOpacity < 0.7 ? '1px solid rgb(255 255 255 / 0.25)' : undefined,
              borderRadius: template.shape === 'ellipse' ? '50%' : template.radius ? 6 : 1,
            }}
          />
        )}
      </span>
      <span className="text-[11px] text-muted-foreground group-hover:text-foreground">{preset.label}</span>
    </button>
  )
}

function ElementLibrary({ clip }: { clip: Clip }) {
  const insert = useInsert(clip)
  const addOverlay = useEditorStore((state) => state.addOverlay)
  React.useEffect(() => { ensureEmojiFont() }, [])
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-5 p-3">
        <section>
          <SectionTitle>Formen</SectionTitle>
          <div className="grid grid-cols-4 gap-2">
            {SHAPE_PRESETS.map((preset) => (
              <ShapeTile key={preset.id} preset={preset} onClick={() => insert((at, duration) => createShape(preset, at, duration))} />
            ))}
          </div>
        </section>
        <section>
          <SectionTitle>Emojis</SectionTitle>
          <div className="grid grid-cols-8 gap-1">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Emoji ${emoji} einfügen`}
                onClick={() => insert((at, duration) => createEmoji(emoji, at, duration))}
                className="transition-ui flex aspect-square items-center justify-center rounded-md text-xl hover:scale-110 hover:bg-white/[0.07]"
                style={{ fontFamily: EMOJI_FONT_STACK }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </section>
        <section>
          <SectionTitle>Fortschrittsbalken</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {(['top', 'bottom'] as const).map((position) => (
              <button
                key={position}
                type="button"
                onClick={() => addOverlay(clip.id, createProgress(clipOutputDuration(clip), position))}
                className="transition-ui group flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-xs text-muted-foreground hover:border-white/30 hover:text-foreground"
              >
                <span className="relative h-9 w-6 overflow-hidden rounded-[3px] bg-white/10">
                  <span className={cn('absolute inset-x-0 h-1 bg-white/25', position === 'top' ? 'top-0' : 'bottom-0')}>
                    <span className="absolute inset-y-0 left-0 w-3/5 bg-white" />
                  </span>
                </span>
                {position === 'top' ? <PanelTop className="size-3.5" /> : <PanelBottom className="size-3.5" />}
                {position === 'top' ? 'Oben' : 'Unten'}
              </button>
            ))}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground/80">
            <Gauge className="mt-0.5 size-3 shrink-0" /> Läuft über den ganzen Clip und hält Zuschauer bis zum Ende.
          </p>
        </section>
      </div>
    </ScrollArea>
  )
}

function CaptionLibrary({ clip }: { clip: Clip }) {
  const setCaptionStyle = useEditorStore((state) => state.setCaptionStyle)
  const applyCaptionPreset = useEditorStore((state) => state.applyCaptionPreset)
  const select = useEditorStore((state) => state.select)
  const style = clip.caption_style
  const position = style.positionY < 35 ? 'top' : style.positionY < 62 ? 'middle' : 'bottom'
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-3">
        <HookTitlePanel clip={clip} />
        <div className="h-px bg-border" />
        <section className="flex flex-col gap-1">
          <SectionTitle>Untertitel</SectionTitle>
          <ToggleField label="Untertitel anzeigen" checked={style.enabled !== false} onChange={(enabled) => setCaptionStyle(clip.id, { enabled })} />
        </section>
        <section>
          <SectionTitle>Vorlagen</SectionTitle>
          <CaptionPresetGrid large active={style.preset} onApply={(preset) => { applyCaptionPreset(clip.id, preset); select({ type: 'captions' }) }} />
        </section>
        <section>
          <SectionTitle>Position</SectionTitle>
          <Segmented
            label="Position der Untertitel"
            value={position}
            options={[{ value: 'top', label: 'Oben' }, { value: 'middle', label: 'Mitte' }, { value: 'bottom', label: 'Unten' }]}
            onChange={(value) => setCaptionStyle(clip.id, { positionY: value === 'top' ? 22 : value === 'middle' ? 50 : 76 })}
          />
        </section>
        <button
          type="button"
          onClick={() => select({ type: 'captions' })}
          className="transition-ui rounded-lg border border-border px-3 py-2 text-left text-xs text-muted-foreground hover:border-white/30 hover:text-foreground"
        >
          Schrift, Farben und Animation im Inspector anpassen →
        </button>
      </div>
    </ScrollArea>
  )
}

const LAYOUT_ICONS: Record<VideoLayout, React.ReactNode> = {
  fill: <span className="block h-7 w-4 rounded-[2px] bg-white/80" />,
  fit: <span className="flex h-7 w-4 items-center rounded-[2px] bg-white/10"><span className="block h-2.5 w-4 bg-white/80" /></span>,
  'fit-blur': <span className="flex h-7 w-4 items-center rounded-[2px] bg-white/35 blur-[0.5px]"><span className="block h-2.5 w-4 bg-white" /></span>,
}

function EffectsLibrary({ clip, videoSrc }: { clip: Clip; videoSrc: string }) {
  const setVideoSettings = useEditorStore((state) => state.setVideoSettings)
  const playhead = useEditorStore((state) => state.playheadSeconds)
  const settings = resolveVideoSettings(clip.video_settings)
  // Ein Standbild für alle Looks — auf eine halbe Sekunde gerundet, damit
  // nicht jeder Frame der Wiedergabe ein neues Bild anfordert.
  const frameTime = Math.round((clip.start_seconds + playhead) * 2) / 2
  const frames = useFrames(videoSrc, [frameTime])
  const image = frameAt(frames, frameTime)

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-5 p-3">
        <section>
          <SectionTitle>Looks</SectionTitle>
          <div className="grid grid-cols-2 gap-x-2.5 gap-y-3">
            {LOOKS.map((look) => {
              const active = settings.look === look.id
              const lookSettings = { ...settings, ...look.settings }
              return (
                <button
                  key={look.id}
                  type="button"
                  onClick={() => setVideoSettings(clip.id, { ...look.settings, look: look.id })}
                  className="group flex flex-col gap-1.5 text-left focus-visible:outline-none"
                >
                  <span className={cn(
                    'transition-ui relative block aspect-video w-full overflow-hidden rounded-lg border bg-neutral-800',
                    active ? 'border-white shadow-[0_0_0_1px_white]' : 'border-border group-hover:border-white/30',
                  )}>
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Standbild aus dem Canvas.
                      <img src={image} alt="" className="h-full w-full object-cover" style={{ filter: videoFilter(lookSettings) }} />
                    ) : (
                      <span className="block h-full w-full bg-[linear-gradient(135deg,oklch(0.55_0.08_60),oklch(0.35_0.06_250))]" style={{ filter: videoFilter(lookSettings) }} />
                    )}
                    {look.settings.vignette > 0 ? (
                      <span className="absolute inset-0" style={{ background: `radial-gradient(ellipse at center, transparent ${Math.round(62 - look.settings.vignette * 30)}%, rgba(0,0,0,${0.35 + look.settings.vignette * 0.5}) 100%)` }} />
                    ) : null}
                  </span>
                  <span className={cn('px-0.5 text-xs', active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground')}>{look.label}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <SectionTitle>Bildaufteilung</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(VIDEO_LAYOUT_LABELS) as VideoLayout[]).map((layout) => (
              <button
                key={layout}
                type="button"
                onClick={() => setVideoSettings(clip.id, { layout })}
                className={cn(
                  'transition-ui flex flex-col items-center gap-1.5 rounded-lg border py-2.5 text-[11px]',
                  settings.layout === layout ? 'border-white/70 bg-white/[0.06] text-foreground' : 'border-border text-muted-foreground hover:border-white/30 hover:text-foreground',
                )}
              >
                {LAYOUT_ICONS[layout]}
                {VIDEO_LAYOUT_LABELS[layout]}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <SectionTitle>Blenden</SectionTitle>
          <ToggleField label="Aus Schwarz einblenden" hint="0,5 s am Anfang" checked={settings.fadeIn > 0} onChange={(on) => setVideoSettings(clip.id, { fadeIn: on ? 0.5 : 0 })} />
          <ToggleField label="Nach Schwarz ausblenden" hint="0,5 s am Ende" checked={settings.fadeOut > 0} onChange={(on) => setVideoSettings(clip.id, { fadeOut: on ? 0.5 : 0 })} />
        </section>

        <section>
          <SectionTitle>Zoom</SectionTitle>
          <Segmented
            label="Zoom"
            value={String(settings.zoom)}
            options={[{ value: '1', label: '100 %' }, { value: '1.15', label: '115 %' }, { value: '1.3', label: '130 %' }, { value: '1.5', label: '150 %' }]}
            onChange={(value) => setVideoSettings(clip.id, { zoom: Number(value) })}
          />
        </section>
      </div>
    </ScrollArea>
  )
}
