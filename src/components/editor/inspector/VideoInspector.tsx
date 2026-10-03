'use client'

import React, { useState } from 'react'
import {
  AudioLines,
  Crop,
  FileText,
  FlipHorizontal2,
  Palette,
  RectangleHorizontal,
  RectangleVertical,
  RotateCcw,
  Scissors,
  Square,
  SquareSplitHorizontal,
  Trash2,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Clip, VideoLayout } from '@/types/database'
import type { OutputFormat } from '@/types/workspace'
import { useEditorStore } from '@/stores/editor-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { LOOKS } from '@/lib/overlay-presets'
import { clipOutputDuration, clipSegments, clipWindowDuration } from '@/lib/clip-export'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScoreDetails } from '@/components/clips/ScoreDetails'
import { DEFAULT_VIDEO_SETTINGS, VIDEO_LAYOUT_LABELS, resolveVideoSettings } from '../../../../remotion/overlays/defaults'
import { ColorField, Field, IconButton, InspectorSection, Segmented, SelectField, SliderField, ToggleField } from '../controls'
import { formatDuration, formatTimecode } from '../timecode'
import { splitAtPlayhead } from '../actions'

const FORMAT_OPTIONS: Array<{ value: OutputFormat; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: '9:16', label: '9:16', icon: RectangleVertical },
  { value: '1:1', label: '1:1', icon: Square },
  { value: '16:9', label: '16:9', icon: RectangleHorizontal },
]

/**
 * Das Video selbst: Format, Bildaufteilung, Farbe, Ton, Blenden, Schnitt —
 * und die Texte für die Veröffentlichung. Ist ein Abschnitt gewählt, steht
 * er obenan.
 */
export function VideoInspector({ clip, outputFormat, segmentIndex }: { clip: Clip; outputFormat: OutputFormat; segmentIndex: number | null }) {
  const setVideoSettings = useEditorStore((state) => state.setVideoSettings)
  const setOutputFormat = useWorkspaceStore((state) => state.setOutputFormat)
  const settings = resolveVideoSettings(clip.video_settings)
  const patch = (value: Partial<typeof settings>) => setVideoSettings(clip.id, value)
  const lookChanged = (['brightness', 'contrast', 'saturation', 'warmth', 'vignette'] as const).some((key) => settings[key] !== DEFAULT_VIDEO_SETTINGS[key])

  return (
    <div className="flex flex-col">
      {segmentIndex !== null ? <SegmentSection clip={clip} index={segmentIndex} /> : null}

      <InspectorSection title="Bild" icon={Crop}>
        <Field label="Format">
          <Segmented label="Ausgabeformat" value={outputFormat} options={FORMAT_OPTIONS} onChange={(format) => setOutputFormat(clip.id, format)} />
        </Field>
        <Field label="Aufteilung">
          <Segmented
            label="Bildaufteilung"
            value={settings.layout}
            options={(Object.keys(VIDEO_LAYOUT_LABELS) as VideoLayout[]).map((layout) => ({ value: layout, label: VIDEO_LAYOUT_LABELS[layout] }))}
            onChange={(layout) => patch({ layout })}
          />
        </Field>
        {settings.layout === 'fit' ? (
          <Field label="Hintergrund">
            <ColorField value={settings.background} onChange={(background) => patch({ background })} label="Hintergrundfarbe" />
          </Field>
        ) : null}
        <SliderField label="Zoom" value={settings.zoom} min={1} max={3} step={0.01} factor={100} unit="%" onChange={(zoom) => patch({ zoom })} />
        <SliderField label="Position X" value={settings.offsetX} min={-1} max={1} step={0.01} factor={100} onChange={(offsetX) => patch({ offsetX })} />
        <SliderField label="Position Y" value={settings.offsetY} min={-1} max={1} step={0.01} factor={100} onChange={(offsetY) => patch({ offsetY })} />
        <Field label="Spiegeln">
          <IconButton icon={FlipHorizontal2} label="Waagerecht spiegeln" onClick={() => patch({ flip: !settings.flip })} pressed={settings.flip} />
          <span className="text-xs text-muted-foreground">{settings.flip ? 'Gespiegelt' : 'Original'}</span>
          <Button variant="ghost" size="xs" className="ml-auto" onClick={() => patch({ zoom: 1, offsetX: 0, offsetY: 0, flip: false })}>
            <RotateCcw /> Zurücksetzen
          </Button>
        </Field>
        {settings.layout === 'fill' && clip.crop_keyframes.length > 1 ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Die automatische Kamerafahrt folgt dem Sprecher ({clip.crop_keyframes.length} Keyframes). Zoom und Position wirken zusätzlich.
          </p>
        ) : null}
      </InspectorSection>

      <InspectorSection
        title="Farbe"
        icon={Palette}
        actions={lookChanged ? <IconButton icon={RotateCcw} label="Farbe zurücksetzen" onClick={() => patch({ ...LOOKS[0].settings, look: 'original' })} /> : null}
      >
        <Field label="Look">
          <SelectField
            value={LOOKS.some((look) => look.id === settings.look) ? settings.look : 'custom'}
            options={[...LOOKS.map((look) => ({ value: look.id, label: look.label })), ...(LOOKS.some((look) => look.id === settings.look) ? [] : [{ value: 'custom', label: 'Eigener' }])]}
            onChange={(id) => {
              const look = LOOKS.find((candidate) => candidate.id === id)
              if (look) patch({ ...look.settings, look: look.id })
            }}
          />
        </Field>
        <SliderField label="Helligkeit" value={settings.brightness} min={0.5} max={1.6} step={0.01} factor={100} unit="%" onChange={(brightness) => patch({ brightness, look: 'custom' })} />
        <SliderField label="Kontrast" value={settings.contrast} min={0.5} max={1.8} step={0.01} factor={100} unit="%" onChange={(contrast) => patch({ contrast, look: 'custom' })} />
        <SliderField label="Sättigung" value={settings.saturation} min={0} max={2} step={0.01} factor={100} unit="%" onChange={(saturation) => patch({ saturation, look: 'custom' })} />
        <SliderField label="Wärme" value={settings.warmth} min={0} max={1} step={0.01} factor={100} unit="%" onChange={(warmth) => patch({ warmth, look: 'custom' })} />
        <SliderField label="Vignette" value={settings.vignette} min={0} max={1} step={0.01} factor={100} unit="%" onChange={(vignette) => patch({ vignette, look: 'custom' })} />
      </InspectorSection>

      <InspectorSection title="Audio und Blenden" icon={AudioLines}>
        <SliderField label="Lautstärke" value={settings.volume} min={0} max={1} step={0.01} factor={100} unit="%" onChange={(volume) => patch({ volume })} />
        <ToggleField label="Stumm" checked={settings.muted} onChange={(muted) => patch({ muted })} />
        <SliderField label="Einblenden" value={settings.fadeIn} min={0} max={3} step={0.1} precision={1} unit=" s" onChange={(fadeIn) => patch({ fadeIn })} />
        <SliderField label="Ausblenden" value={settings.fadeOut} min={0} max={3} step={0.1} precision={1} unit=" s" onChange={(fadeOut) => patch({ fadeOut })} />
      </InspectorSection>

      <CutSection clip={clip} />
      <PublishSection clip={clip} />
    </div>
  )
}

function SegmentSection({ clip, index }: { clip: Clip; index: number }) {
  const deleteSegment = useEditorStore((state) => state.deleteSegment)
  const segments = clipSegments(clip)
  const segment = segments[index]
  if (!segment) return null
  const absoluteStart = clip.start_seconds + segment.start
  const absoluteEnd = clip.start_seconds + segment.end
  return (
    <InspectorSection title={`Abschnitt ${index + 1} von ${segments.length}`} icon={Scissors}>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md bg-muted/50 px-2 py-1.5">
          <dt className="text-[10px] text-muted-foreground uppercase">In</dt>
          <dd className="font-mono tabular-nums">{formatTimecode(absoluteStart)}</dd>
        </div>
        <div className="rounded-md bg-muted/50 px-2 py-1.5">
          <dt className="text-[10px] text-muted-foreground uppercase">Out</dt>
          <dd className="font-mono tabular-nums">{formatTimecode(absoluteEnd)}</dd>
        </div>
        <div className="rounded-md bg-muted/50 px-2 py-1.5">
          <dt className="text-[10px] text-muted-foreground uppercase">Dauer</dt>
          <dd className="font-mono tabular-nums">{formatDuration(segment.end - segment.start)}</dd>
        </div>
      </dl>
      <p className="text-[11px] leading-relaxed text-muted-foreground">Zeiten im Quellvideo. Ziehe die Kanten in der Timeline, um den Abschnitt zu kürzen oder zu verlängern.</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={splitAtPlayhead}>
          <SquareSplitHorizontal /> Teilen
        </Button>
        <Button variant="destructive" size="sm" className="flex-1" disabled={segments.length <= 1} onClick={() => deleteSegment(clip.id, index)}>
          <Trash2 /> Entfernen
        </Button>
      </div>
    </InspectorSection>
  )
}

function CutSection({ clip }: { clip: Clip }) {
  const removePauses = useEditorStore((state) => state.removePauses)
  const removeFillers = useEditorStore((state) => state.removeFillers)
  const resetCuts = useEditorStore((state) => state.resetCuts)
  const [gap, setGap] = useState(0.6)
  const segments = clipSegments(clip)
  const output = clipOutputDuration(clip)
  const saved = clipWindowDuration(clip) - output
  const hasWords = clip.words.length > 0

  return (
    <InspectorSection title="Schnitt" icon={Wand2}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Badge variant="secondary" className="font-mono tabular-nums">{formatDuration(output)}</Badge>
        <span>{segments.length} {segments.length === 1 ? 'Abschnitt' : 'Abschnitte'}</span>
        {saved > 0.05 ? <span>· {formatDuration(saved)} herausgeschnitten</span> : null}
      </div>
      <SliderField label="Pause ab" value={gap} min={0.3} max={2} step={0.05} precision={2} unit=" s" onChange={setGap} />
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasWords}
          onClick={() => {
            const result = removePauses(clip.id, gap)
            toast(result.count > 0 ? `${result.count} ${result.count === 1 ? 'Pause' : 'Pausen'} entfernt` : 'Keine Pausen gefunden', {
              description: result.count > 0 ? `${result.seconds.toFixed(1)} s kürzer. Rückgängig mit ⌘Z.` : `Keine Stille länger als ${gap.toFixed(2)} s.`,
            })
          }}
        >
          Pausen entfernen
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasWords}
          onClick={() => {
            const result = removeFillers(clip.id)
            toast(result.count > 0 ? `${result.count} Füllwörter entfernt` : 'Keine Füllwörter gefunden', {
              description: result.count > 0 ? `„äh“, „ähm“ und Co. — ${result.seconds.toFixed(1)} s kürzer.` : 'Gesucht wurde nach „äh“, „ähm“, „hm“, „uh“, „um“.',
            })
          }}
        >
          Füllwörter entfernen
        </Button>
      </div>
      {segments.length > 1 ? (
        <Button variant="ghost" size="sm" onClick={() => resetCuts(clip.id)} className="justify-start text-muted-foreground">
          <RotateCcw /> Alle Schnitte im Clip zurücksetzen
        </Button>
      ) : null}
      {!hasWords ? <p className="text-[11px] text-muted-foreground">Automatische Schnitte brauchen ein Transkript.</p> : null}
    </InspectorSection>
  )
}

function PublishSection({ clip }: { clip: Clip }) {
  const updateClipMeta = useEditorStore((state) => state.updateClipMeta)
  const [hashtagDraft, setHashtagDraft] = useState<string | null>(null)
  const commitHashtags = (text: string) => {
    const hashtags = text.split(/[\s,]+/).map((tag) => tag.trim()).filter(Boolean).map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
    updateClipMeta(clip.id, { hashtags: [...new Set(hashtags)].slice(0, 30) })
    setHashtagDraft(null)
  }

  return (
    <InspectorSection title="Veröffentlichung" icon={FileText} defaultOpen={false}>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Titel</span>
        <Input value={clip.title} onChange={(event) => updateClipMeta(clip.id, { title: event.target.value })} className="h-8 text-sm" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Beschreibung</span>
        <Textarea value={clip.description} onChange={(event) => updateClipMeta(clip.id, { description: event.target.value })} rows={4} className="text-sm" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Hashtags</span>
        <Input
          value={hashtagDraft ?? clip.hashtags.join(' ')}
          onChange={(event) => setHashtagDraft(event.target.value)}
          onBlur={() => { if (hashtagDraft !== null) commitHashtags(hashtagDraft) }}
          onKeyDown={(event) => { if (event.key === 'Enter' && hashtagDraft !== null) commitHashtags(hashtagDraft) }}
          className="h-8 text-sm"
        />
      </label>
      <ScoreDetails clip={clip} />
    </InspectorSection>
  )
}
