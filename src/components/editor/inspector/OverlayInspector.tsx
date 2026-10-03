'use client'

import React, { useEffect, useRef } from 'react'
import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  CaseUpper,
  Circle,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Italic,
  Lock,
  LockOpen,
  Minus,
  MoveRight,
  PanelBottom,
  PanelTop,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  Type,
} from 'lucide-react'
import type { EmojiOverlay, Overlay, OverlayAnimation, ProgressOverlay, ShapeKind, ShapeOverlay, TextOverlay } from '@/types/database'
import { useEditorStore } from '@/stores/editor-store'
import { EMOJIS } from '@/lib/overlay-presets'
import { clipOutputDuration } from '@/lib/clip-export'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import { FONTS, FONT_CATEGORY_LABELS, FONT_KEYS, fontDefinition, fontStack, resolveWeight } from '../../../../remotion/fonts'
import { OVERLAY_ANIMATIONS, OVERLAY_ANIMATION_LABELS } from '../../../../remotion/overlays/defaults'
import { useFontPreviews } from '../fonts-preview'
import { ColorField, Field, IconButton, InspectorSection, NumberBox, Segmented, SelectField, SliderField, ToggleField } from '../controls'

const WEIGHT_LABELS: Record<number, string> = {
  100: 'Hauchdünn', 200: 'Extraleicht', 300: 'Leicht', 400: 'Normal', 500: 'Medium', 600: 'Halbfett', 700: 'Fett', 800: 'Extrafett', 900: 'Black',
}

const KIND_LABELS: Record<Overlay['kind'], string> = { text: 'Text', shape: 'Form', emoji: 'Emoji', progress: 'Fortschrittsbalken' }

/** Eigenschaften eines Overlays — Inhalt, Stil, Lage, Zeit, Animation. */
export function OverlayInspector({ clipId, overlay }: { clipId: string; overlay: Overlay }) {
  const update = useEditorStore((state) => state.updateOverlay)
  const remove = useEditorStore((state) => state.removeOverlay)
  const duplicate = useEditorStore((state) => state.duplicateOverlay)
  const moveLayer = useEditorStore((state) => state.moveOverlayLayer)
  const patch = (value: Record<string, unknown>) => update(clipId, overlay.id, value)

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 border-b px-3 py-2.5">
        <input
          aria-label="Name"
          value={overlay.name ?? ''}
          placeholder={KIND_LABELS[overlay.kind]}
          onChange={(event) => patch({ name: event.target.value })}
          className="transition-ui min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium outline-none hover:border-input focus:border-ring"
        />
        <IconButton icon={overlay.hidden ? EyeOff : Eye} label={overlay.hidden ? 'Einblenden' : 'Ausblenden'} onClick={() => patch({ hidden: !overlay.hidden })} pressed={overlay.hidden} side="bottom" />
        <IconButton icon={overlay.locked ? Lock : LockOpen} label={overlay.locked ? 'Entsperren' : 'Sperren'} onClick={() => patch({ locked: !overlay.locked })} pressed={overlay.locked} side="bottom" />
        <IconButton icon={Copy} label="Duplizieren" shortcut="⌘D" onClick={() => duplicate(clipId, overlay.id)} side="bottom" />
        <IconButton icon={Trash2} label="Löschen" shortcut="Entf" onClick={() => remove(clipId, overlay.id)} side="bottom" />
      </div>

      {overlay.kind === 'text' ? <TextSections overlay={overlay} patch={patch} /> : null}
      {overlay.kind === 'shape' ? <ShapeSection overlay={overlay} patch={patch} /> : null}
      {overlay.kind === 'emoji' ? <EmojiSection overlay={overlay} patch={patch} /> : null}
      {overlay.kind === 'progress' ? <ProgressSection overlay={overlay} patch={patch} /> : null}

      {overlay.kind !== 'progress' ? (
        <InspectorSection
          title="Transformieren"
          actions={<IconButton icon={RotateCcw} label="Zurücksetzen" onClick={() => patch({ x: 0.5, y: 0.5, scale: 1, rotation: 0 })} />}
        >
          <Field label="Position">
            <NumberBox label="X" value={overlay.x * 100} min={-50} max={150} step={0.5} precision={1} unit="%" onChange={(value) => patch({ x: value / 100 })} className="flex-1" />
            <NumberBox label="Y" value={overlay.y * 100} min={-50} max={150} step={0.5} precision={1} unit="%" onChange={(value) => patch({ y: value / 100 })} className="flex-1" />
          </Field>
          <Field label="Ausrichten">
            <div className="flex flex-1 items-center gap-0.5">
              <IconButton icon={AlignHorizontalJustifyCenter} label="Waagerecht mittig" onClick={() => patch({ x: 0.5 })} />
              <IconButton icon={AlignVerticalJustifyCenter} label="Senkrecht mittig" onClick={() => patch({ y: 0.5 })} />
              <IconButton icon={ArrowUpToLine} label="Oberes Drittel" onClick={() => patch({ y: 0.2 })} />
              <IconButton icon={ArrowDownToLine} label="Unteres Drittel" onClick={() => patch({ y: 0.8 })} />
            </div>
          </Field>
          <SliderField label="Skalierung" value={overlay.scale} min={0.1} max={4} step={0.01} factor={100} unit="%" onChange={(scale) => patch({ scale })} />
          <SliderField label="Drehung" value={overlay.rotation} min={-180} max={180} step={1} unit="°" onChange={(rotation) => patch({ rotation })} />
          <SliderField label="Deckkraft" value={overlay.opacity} min={0} max={1} step={0.01} factor={100} unit="%" onChange={(opacity) => patch({ opacity })} />
          <Field label="Ebene">
            <div className="flex flex-1 items-center gap-1.5">
              <span className="font-mono text-xs text-muted-foreground">{overlay.track + 1}</span>
              <IconButton icon={ArrowUpToLine} label="Eine Ebene nach vorn" onClick={() => moveLayer(clipId, overlay.id, 'up')} />
              <IconButton icon={ArrowDownToLine} label="Eine Ebene nach hinten" onClick={() => moveLayer(clipId, overlay.id, 'down')} />
            </div>
          </Field>
        </InspectorSection>
      ) : null}

      <TimingSection clipId={clipId} overlay={overlay} patch={patch} />

      <InspectorSection title="Animation" icon={Sparkles}>
        <Field label="Einblenden">
          <AnimationSelect value={overlay.animationIn} kind={overlay.kind} onChange={(animationIn) => patch({ animationIn })} />
        </Field>
        <Field label="Ausblenden">
          <AnimationSelect value={overlay.animationOut} kind={overlay.kind} exit onChange={(animationOut) => patch({ animationOut })} />
        </Field>
      </InspectorSection>
    </div>
  )
}

type Patch = (value: Record<string, unknown>) => void

function AnimationSelect({ value, kind, exit, onChange }: { value: OverlayAnimation; kind: Overlay['kind']; exit?: boolean; onChange: (value: OverlayAnimation) => void }) {
  // Die Schreibmaschine gibt es nur für Text und nur als Auftritt.
  const options = OVERLAY_ANIMATIONS.filter((animation) => animation !== 'typewriter' || (kind === 'text' && !exit))
  return <SelectField value={value} options={options.map((animation) => ({ value: animation, label: OVERLAY_ANIMATION_LABELS[animation] }))} onChange={onChange} />
}

function TimingSection({ clipId, overlay, patch }: { clipId: string; overlay: Overlay; patch: Patch }) {
  const playhead = useEditorStore((state) => state.playheadSeconds)
  const clipDuration = useEditorStore((state) => {
    const clip = state.clips.find((candidate) => candidate.id === clipId)
    return clip ? clipOutputDuration(clip) : 0
  })
  const length = overlay.end - overlay.start
  return (
    <InspectorSection title="Timing" icon={Clock}>
      <Field label="Start">
        <NumberBox label="Start" value={overlay.start} min={0} max={overlay.end - 0.1} step={0.1} precision={2} unit=" s" onChange={(start) => patch({ start })} className="flex-1" />
        <button type="button" onClick={() => patch({ start: Math.min(playhead, overlay.end - 0.1) })} className="transition-ui h-7 shrink-0 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">Playhead</button>
      </Field>
      <Field label="Ende">
        <NumberBox label="Ende" value={overlay.end} min={overlay.start + 0.1} step={0.1} precision={2} unit=" s" onChange={(end) => patch({ end })} className="flex-1" />
        <button type="button" onClick={() => patch({ end: Math.max(playhead, overlay.start + 0.1) })} className="transition-ui h-7 shrink-0 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">Playhead</button>
      </Field>
      <Field label="Dauer">
        <NumberBox label="Dauer" value={length} min={0.1} step={0.1} precision={2} unit=" s" onChange={(value) => patch({ end: overlay.start + value })} className="flex-1" />
        <button type="button" onClick={() => patch({ start: 0, end: clipDuration })} className="transition-ui h-7 shrink-0 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">Ganzer Clip</button>
      </Field>
    </InspectorSection>
  )
}

function TextSections({ overlay, patch }: { overlay: TextOverlay; patch: Patch }) {
  useFontPreviews()
  const textRef = useRef<HTMLTextAreaElement>(null)
  const font = fontDefinition(overlay.font)
  const weight = resolveWeight(overlay.font, overlay.fontWeight)

  // Doppelklick auf den Text im Bild springt hierher.
  useEffect(() => {
    const onEdit = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== overlay.id) return
      textRef.current?.focus()
      textRef.current?.select()
    }
    window.addEventListener('omegaclip:edit-text', onEdit)
    return () => window.removeEventListener('omegaclip:edit-text', onEdit)
  }, [overlay.id])

  return (
    <>
      <InspectorSection title="Text" icon={Type}>
        <Textarea
          ref={textRef}
          value={overlay.text}
          onChange={(event) => patch({ text: event.target.value })}
          rows={3}
          className="min-h-16 resize-y text-sm"
          placeholder="Text eingeben …"
        />
        <Field label="Schrift">
          <SelectField
            value={overlay.font}
            options={FONT_KEYS.map((key) => ({ value: key, label: `${FONTS[key].label} · ${FONT_CATEGORY_LABELS[FONTS[key].category]}`, style: { fontFamily: fontStack(key) } }))}
            renderLabel={(key) => <span style={{ fontFamily: fontStack(key) }}>{fontDefinition(key).label}</span>}
            onChange={(key) => patch({ font: key, fontWeight: resolveWeight(key, overlay.fontWeight), italic: overlay.italic && fontDefinition(key).italic })}
          />
        </Field>
        <Field label="Stärke">
          <SelectField
            value={String(weight)}
            options={font.weights.map((value) => ({ value: String(value), label: WEIGHT_LABELS[value] ?? String(value) }))}
            onChange={(value) => patch({ fontWeight: Number(value) })}
          />
        </Field>
        <SliderField label="Größe" value={overlay.fontSize} min={12} max={300} step={1} unit=" px" onChange={(fontSize) => patch({ fontSize })} />
        <Field label="Stil">
          <Segmented
            label="Ausrichtung"
            value={overlay.align}
            options={[
              { value: 'left', icon: AlignLeft, title: 'Links' },
              { value: 'center', icon: AlignCenter, title: 'Mittig' },
              { value: 'right', icon: AlignRight, title: 'Rechts' },
            ]}
            onChange={(align) => patch({ align })}
          />
          <IconButton icon={CaseUpper} label="Großbuchstaben" onClick={() => patch({ uppercase: !overlay.uppercase })} pressed={overlay.uppercase} />
          <IconButton icon={Italic} label={font.italic ? 'Kursiv' : 'Diese Schrift hat keine Kursive'} onClick={() => patch({ italic: !overlay.italic })} pressed={overlay.italic} disabled={!font.italic} />
        </Field>
        <Field label="Farbe">
          <ColorField value={overlay.color} onChange={(color) => patch({ color })} />
        </Field>
        <SliderField label="Laufweite" value={overlay.letterSpacing} min={-0.1} max={0.5} step={0.01} factor={100} unit="" onChange={(letterSpacing) => patch({ letterSpacing })} />
        <SliderField label="Zeilenhöhe" value={overlay.lineHeight} min={0.8} max={2} step={0.05} factor={100} unit="%" onChange={(lineHeight) => patch({ lineHeight })} />
        <SliderField label="Max. Breite" value={overlay.maxWidth} min={0.2} max={1} step={0.01} factor={100} unit="%" onChange={(maxWidth) => patch({ maxWidth })} />
      </InspectorSection>

      <InspectorSection title="Kontur und Schatten" defaultOpen={overlay.strokeWidth > 0 || overlay.shadow > 0}>
        <Field label="Kontur">
          <ColorField value={overlay.strokeColor} onChange={(strokeColor) => patch({ strokeColor })} label="Konturfarbe" />
        </Field>
        <SliderField label="Stärke" value={overlay.strokeWidth} min={0} max={30} step={1} unit=" px" onChange={(strokeWidth) => patch({ strokeWidth })} />
        <SliderField label="Schatten" value={overlay.shadow} min={0} max={1} step={0.01} factor={100} unit="%" onChange={(shadow) => patch({ shadow })} />
      </InspectorSection>

      <InspectorSection title="Hintergrund" defaultOpen={overlay.background !== null}>
        <ToggleField label="Box hinter dem Text" checked={overlay.background !== null} onChange={(on) => patch(on ? { background: '#000000', padding: overlay.padding || 24, radius: overlay.radius || 14 } : { background: null })} />
        {overlay.background !== null ? (
          <>
            <Field label="Farbe">
              <ColorField value={overlay.background} onChange={(background) => patch({ background })} label="Boxfarbe" />
            </Field>
            <SliderField label="Deckkraft" value={overlay.backgroundOpacity} min={0} max={1} step={0.01} factor={100} unit="%" onChange={(backgroundOpacity) => patch({ backgroundOpacity })} />
            <ToggleField label="Box je Zeile" hint="Jede Zeile auf eigenem Streifen, wie auf TikTok." checked={overlay.lineBox === true} onChange={(lineBox) => patch({ lineBox })} />
            <SliderField label="Innenabstand" value={overlay.padding} min={0} max={120} step={1} unit=" px" onChange={(padding) => patch({ padding })} />
            <SliderField label="Rundung" value={Math.min(overlay.radius, 200)} min={0} max={200} step={1} unit=" px" onChange={(radius) => patch({ radius })} />
          </>
        ) : null}
      </InspectorSection>
    </>
  )
}

const SHAPE_OPTIONS: Array<{ value: ShapeKind; icon: React.ComponentType<{ className?: string }>; title: string }> = [
  { value: 'rect', icon: Square, title: 'Rechteck' },
  { value: 'ellipse', icon: Circle, title: 'Ellipse' },
  { value: 'line', icon: Minus, title: 'Linie' },
  { value: 'arrow', icon: MoveRight, title: 'Pfeil' },
]

function ShapeSection({ overlay, patch }: { overlay: ShapeOverlay; patch: Patch }) {
  return (
    <InspectorSection title="Form" icon={Square}>
      <Field label="Art">
        <Segmented label="Form" value={overlay.shape} options={SHAPE_OPTIONS} onChange={(shape) => patch({ shape })} />
      </Field>
      <Field label="Größe">
        <NumberBox label="Breite" value={overlay.width} min={2} max={4000} step={2} unit=" B" onChange={(width) => patch({ width })} className="flex-1" />
        <NumberBox label="Höhe" value={overlay.height} min={2} max={4000} step={2} unit=" H" onChange={(height) => patch({ height })} className="flex-1" />
      </Field>
      <ToggleField label="Füllung" checked={overlay.fill !== null} onChange={(on) => patch({ fill: on ? '#FFFFFF' : null })} />
      {overlay.fill !== null ? (
        <>
          <Field label="Farbe">
            <ColorField value={overlay.fill} onChange={(fill) => patch({ fill })} label="Füllfarbe" />
          </Field>
          <SliderField label="Deckkraft" value={overlay.fillOpacity} min={0} max={1} step={0.01} factor={100} unit="%" onChange={(fillOpacity) => patch({ fillOpacity })} />
        </>
      ) : null}
      {overlay.shape !== 'line' ? (
        <>
          <Field label="Kontur">
            <ColorField value={overlay.stroke} onChange={(stroke) => patch({ stroke })} label="Konturfarbe" />
          </Field>
          <SliderField label="Stärke" value={overlay.strokeWidth} min={0} max={60} step={1} unit=" px" onChange={(strokeWidth) => patch({ strokeWidth })} />
        </>
      ) : null}
      {overlay.shape === 'rect' || overlay.shape === 'line' ? (
        <SliderField label="Rundung" value={Math.min(overlay.radius, 400)} min={0} max={400} step={1} unit=" px" onChange={(radius) => patch({ radius })} />
      ) : null}
    </InspectorSection>
  )
}

function EmojiSection({ overlay, patch }: { overlay: EmojiOverlay; patch: Patch }) {
  return (
    <InspectorSection title="Emoji">
      <div className="grid grid-cols-8 gap-1">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => patch({ emoji, name: emoji })}
            className={cn('transition-ui flex aspect-square items-center justify-center rounded-md text-lg hover:bg-muted', overlay.emoji === emoji && 'bg-foreground/[0.12] ring-1 ring-white/20')}
          >
            {emoji}
          </button>
        ))}
      </div>
      <SliderField label="Größe" value={overlay.size} min={40} max={800} step={2} unit=" px" onChange={(size) => patch({ size })} />
    </InspectorSection>
  )
}

function ProgressSection({ overlay, patch }: { overlay: ProgressOverlay; patch: Patch }) {
  return (
    <InspectorSection title="Fortschrittsbalken">
      <Field label="Position">
        <Segmented
          label="Position"
          value={overlay.position}
          options={[
            { value: 'top', icon: PanelTop, label: 'Oben' },
            { value: 'bottom', icon: PanelBottom, label: 'Unten' },
          ]}
          onChange={(position) => patch({ position })}
        />
      </Field>
      <SliderField label="Stärke" value={overlay.thickness} min={2} max={60} step={1} unit=" px" onChange={(thickness) => patch({ thickness })} />
      <Field label="Balken">
        <ColorField value={overlay.color} onChange={(color) => patch({ color })} label="Balkenfarbe" />
      </Field>
      <Field label="Spur">
        <ColorField value={overlay.trackColor} onChange={(trackColor) => patch({ trackColor })} label="Spurfarbe" />
      </Field>
      <SliderField label="Spur-Deckkraft" value={overlay.trackOpacity} min={0} max={1} step={0.01} factor={100} unit="%" onChange={(trackOpacity) => patch({ trackOpacity })} />
      <SliderField label="Deckkraft" value={overlay.opacity} min={0} max={1} step={0.01} factor={100} unit="%" onChange={(opacity) => patch({ opacity })} />
    </InspectorSection>
  )
}
