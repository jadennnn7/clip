'use client'

import React from 'react'
import { CaseUpper, Palette, Sparkles, Type } from 'lucide-react'
import type { CaptionStyle } from '@/types/database'
import { cn } from '@/lib/utils'
import {
  CAPTION_ANIMATION_LABELS,
  CAPTION_PRESET_LABELS,
  CAPTION_PRESETS,
} from '../../../remotion/captions/presets'
import { captionWeight } from '../../../remotion/captions/CaptionLayer'
import { FONTS, FONT_CATEGORY_LABELS, FONT_KEYS, fontDefinition, fontKeyFromCss, fontStack, resolveWeight } from '../../../remotion/fonts'
import { useFontPreviews } from './fonts-preview'
import { ColorField, Field, IconButton, InspectorSection, SelectField, SliderField, ToggleField } from './controls'

interface CaptionStylePanelProps {
  style: CaptionStyle
  onChange: (patch: Partial<CaptionStyle>) => void
  onApplyPreset: (preset: CaptionStyle['preset']) => void
}

const WEIGHT_LABELS: Record<number, string> = { 400: 'Normal', 500: 'Medium', 600: 'Halbfett', 700: 'Fett', 800: 'Extrafett', 900: 'Black' }

/** Die Vorlagen als Kacheln, gezeichnet aus den echten Preset-Werten. */
export function CaptionPresetGrid({ active, onApply, large }: { active: CaptionStyle['preset']; onApply: (preset: CaptionStyle['preset']) => void; large?: boolean }) {
  useFontPreviews(FONT_KEYS.filter((key) => Object.values(CAPTION_PRESETS).some((preset) => fontKeyFromCss(preset.fontFamily) === key)))
  return (
    <div className="grid grid-cols-2 gap-2">
      {(Object.keys(CAPTION_PRESETS) as Array<CaptionStyle['preset']>).map((preset) => {
        const style = CAPTION_PRESETS[preset]
        return (
          <button
            key={preset}
            type="button"
            onClick={() => onApply(preset)}
            // Immer auf Videoschwarz: Die Vorlagen sind fast alle weiß und
            // verschwanden auf der hellen Fläche des Dashboards.
            className={cn(
              'transition-ui group flex flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border bg-neutral-950 bg-[radial-gradient(ellipse_at_top,rgb(255_255_255/0.1),transparent_70%)] px-2',
              large ? 'h-20' : 'h-14',
              'hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
              active === preset ? 'border-foreground/70 shadow-[0_0_0_1px_color-mix(in_oklab,var(--foreground)_40%,transparent)]' : 'border-border',
            )}
          >
            <span
              className={cn('block max-w-full truncate leading-none', large ? 'text-lg' : 'text-sm')}
              style={{
                fontFamily: style.fontFamily,
                fontWeight: captionWeight(style),
                color: style.highlightColor,
                WebkitTextStroke: style.strokeWidth > 0 ? `${Math.max(1, style.strokeWidth / 8)}px ${style.strokeColor}` : undefined,
                paintOrder: 'stroke fill',
                textTransform: style.uppercase ? 'uppercase' : 'none',
                background: style.background ? style.background : undefined,
                padding: style.background ? '2px 6px' : undefined,
                borderRadius: style.background ? 4 : undefined,
                textShadow: style.shadow ? '0 2px 8px rgb(0 0 0 / 0.7)' : undefined,
              }}
            >
              {CAPTION_PRESET_LABELS[preset]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Styling der Untertitel.
 *
 * Jede Änderung geht direkt als Prop in den Remotion Player — es gibt keinen
 * "Vorschau aktualisieren"-Button und keinen Server-Roundtrip. Genau deshalb
 * liegt die Composition im Browser und nicht nur auf Lambda.
 */
export function CaptionStylePanel({ style, onChange, onApplyPreset }: CaptionStylePanelProps) {
  useFontPreviews()
  const fontKey = fontKeyFromCss(style.fontFamily) ?? 'inter'
  const font = fontDefinition(fontKey)
  const weight = captionWeight(style)
  const enabled = style.enabled !== false

  return (
    <div className="flex flex-col">
      <div className="border-b px-3 py-3">
        <ToggleField label="Untertitel anzeigen" hint="Ausgeblendet fehlen sie auch im MP4." checked={enabled} onChange={(value) => onChange({ enabled: value })} />
      </div>

      <InspectorSection title="Vorlage">
        <CaptionPresetGrid active={style.preset} onApply={onApplyPreset} />
      </InspectorSection>

      <InspectorSection title="Schrift" icon={Type}>
        <Field label="Schrift">
          <SelectField
            value={fontKey}
            options={FONT_KEYS.map((key) => ({ value: key, label: `${FONTS[key].label} · ${FONT_CATEGORY_LABELS[FONTS[key].category]}`, style: { fontFamily: fontStack(key) } }))}
            renderLabel={(key) => <span style={{ fontFamily: fontStack(key) }}>{fontDefinition(key).label}</span>}
            onChange={(key) => onChange({ fontFamily: fontStack(key), fontWeight: resolveWeight(key, weight) })}
          />
        </Field>
        <Field label="Stärke">
          <SelectField
            value={String(weight)}
            options={font.weights.map((value) => ({ value: String(value), label: WEIGHT_LABELS[value] ?? String(value) }))}
            onChange={(value) => onChange({ fontWeight: Number(value) })}
          />
          <IconButton icon={CaseUpper} label="Großbuchstaben" onClick={() => onChange({ uppercase: !style.uppercase })} pressed={style.uppercase} />
        </Field>
        <SliderField label="Größe" value={style.fontSize} min={28} max={160} step={2} unit=" px" onChange={(fontSize) => onChange({ fontSize })} />
        <SliderField label="Max. Wörter" value={style.wordsPerLine} min={1} max={8} step={1} onChange={(wordsPerLine) => onChange({ wordsPerLine })} />
        <ToggleField label="Satzzeichen" hint="Punkt und Komma zeigen. ? und ! bleiben immer." checked={style.punctuation === true} onChange={(punctuation) => onChange({ punctuation })} />
        <SliderField label="Position" value={style.positionY} min={5} max={95} step={1} unit="%" onChange={(positionY) => onChange({ positionY })} />
      </InspectorSection>

      <InspectorSection title="Farben" icon={Palette}>
        <Field label="Text">
          <ColorField value={style.color} onChange={(color) => onChange({ color })} label="Textfarbe" />
        </Field>
        <Field label="Aktives Wort">
          <ColorField value={style.highlightColor} onChange={(highlightColor) => onChange({ highlightColor })} label="Hervorhebung" />
        </Field>
        <Field label="Kontur">
          <ColorField value={style.strokeColor} onChange={(strokeColor) => onChange({ strokeColor })} label="Konturfarbe" />
        </Field>
        <SliderField label="Konturstärke" value={style.strokeWidth} min={0} max={28} step={1} unit=" px" onChange={(strokeWidth) => onChange({ strokeWidth })} />
        <SliderField label="Schatten" value={style.shadow ?? 0} min={0} max={1} step={0.01} factor={100} unit="%" onChange={(shadow) => onChange({ shadow })} />
      </InspectorSection>

      <InspectorSection title="Box" defaultOpen={Boolean(style.background)}>
        <ToggleField label="Box hinter der Zeile" checked={Boolean(style.background)} onChange={(on) => onChange({ background: on ? '#000000' : null, backgroundOpacity: style.backgroundOpacity ?? 0.7 })} />
        {style.background ? (
          <>
            <Field label="Farbe">
              <ColorField value={style.background} onChange={(background) => onChange({ background })} label="Boxfarbe" />
            </Field>
            <SliderField label="Deckkraft" value={style.backgroundOpacity ?? 1} min={0} max={1} step={0.01} factor={100} unit="%" onChange={(backgroundOpacity) => onChange({ backgroundOpacity })} />
          </>
        ) : null}
      </InspectorSection>

      <InspectorSection title="Animation" icon={Sparkles}>
        <Field label="Wortwechsel">
          <SelectField
            value={style.animation}
            options={(Object.keys(CAPTION_ANIMATION_LABELS) as Array<CaptionStyle['animation']>).map((animation) => ({ value: animation, label: CAPTION_ANIMATION_LABELS[animation] }))}
            onChange={(animation) => onChange({ animation })}
          />
        </Field>
      </InspectorSection>
    </div>
  )
}
