'use client'

import React from 'react'
import type { CaptionStyle } from '@/types/database'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CAPTION_ANIMATION_LABELS,
  CAPTION_PRESET_LABELS,
  CAPTION_PRESETS,
} from '../../../remotion/captions/presets'
import { cn } from '@/lib/utils'
import { singleValue } from '@/lib/slider-value'

interface CaptionStylePanelProps {
  style: CaptionStyle
  onChange: (patch: Partial<CaptionStyle>) => void
  onApplyPreset: (preset: CaptionStyle['preset']) => void
}

const COLOR_SWATCHES = [
  '#FFFFFF', '#FFE81F', '#22D3EE', '#22C55E',
  '#F472B6', '#FB923C', '#A78BFA', '#EF4444',
]

/**
 * Styling-Panel für die Untertitel.
 *
 * Jede Änderung geht direkt als Prop in den Remotion Player — es gibt keinen
 * "Vorschau aktualisieren"-Button und keinen Server-Roundtrip. Genau deshalb
 * liegt die Composition im Browser und nicht nur auf Lambda.
 */
export function CaptionStylePanel({ style, onChange, onApplyPreset }: CaptionStylePanelProps) {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6 p-4">
        {/* --- Presets --- */}
        <section className="flex flex-col gap-2.5">
          <Label className="text-xs text-muted-foreground">Vorlage</Label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(CAPTION_PRESETS) as Array<CaptionStyle['preset']>).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onApplyPreset(preset)}
                className={cn(
                  'transition-ui rounded-lg border px-2 py-3.5',
                  'hover:bg-accent focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                  style.preset === preset
                    ? 'border-primary/60 bg-accent shadow-xs'
                    : 'border-border hover:border-border',
                )}
              >
                <span
                  className="block truncate text-center text-sm font-black"
                  style={{
                    color: CAPTION_PRESETS[preset].highlightColor,
                    WebkitTextStroke: `1px ${CAPTION_PRESETS[preset].strokeColor}`,
                    paintOrder: 'stroke fill',
                    textTransform: CAPTION_PRESETS[preset].uppercase ? 'uppercase' : 'none',
                  }}
                >
                  {CAPTION_PRESET_LABELS[preset]}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* --- Farben --- */}
        <section className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">Hervorhebung (aktives Wort)</Label>
          <div className="flex flex-wrap gap-2">
            {COLOR_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Hervorhebungsfarbe ${color}`}
                onClick={() => onChange({ highlightColor: color })}
                className={cn(
                  'transition-ui size-7 rounded-full ring-2 ring-offset-2 ring-offset-background hover:scale-110',
                  style.highlightColor.toUpperCase() === color
                    ? 'ring-primary scale-110'
                    : 'ring-transparent',
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">Textfarbe</Label>
          <div className="flex flex-wrap gap-2">
            {COLOR_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Textfarbe ${color}`}
                onClick={() => onChange({ color })}
                className={cn(
                  'transition-ui size-7 rounded-full ring-2 ring-offset-2 ring-offset-background hover:scale-110',
                  style.color.toUpperCase() === color ? 'ring-primary scale-110' : 'ring-transparent',
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </section>

        {/* --- Größe --- */}
        <SliderRow
          label="Schriftgröße"
          value={style.fontSize}
          min={32}
          max={140}
          step={2}
          unit="px"
          onChange={(fontSize) => onChange({ fontSize })}
        />

        <SliderRow
          label="Konturstärke"
          value={style.strokeWidth}
          min={0}
          max={28}
          step={1}
          unit="px"
          onChange={(strokeWidth) => onChange({ strokeWidth })}
        />

        <SliderRow
          label="Vertikale Position"
          value={style.positionY}
          min={10}
          max={92}
          step={1}
          unit="%"
          onChange={(positionY) => onChange({ positionY })}
        />

        <SliderRow
          label="Wörter pro Zeile"
          value={style.wordsPerLine}
          min={1}
          max={8}
          step={1}
          onChange={(wordsPerLine) => onChange({ wordsPerLine })}
        />

        {/* --- Animation --- */}
        <section className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">Animation</Label>
          <Select
            value={style.animation}
            onValueChange={(value) => onChange({ animation: value as CaptionStyle['animation'] })}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(value) => CAPTION_ANIMATION_LABELS[value as CaptionStyle['animation']]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CAPTION_ANIMATION_LABELS) as Array<CaptionStyle['animation']>).map(
                (animation) => (
                  <SelectItem key={animation} value={animation}>
                    {CAPTION_ANIMATION_LABELS[animation]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </section>

        {/* --- Versalien --- */}
        <section className="flex items-center justify-between gap-3">
          <Label htmlFor="uppercase" className="text-xs text-muted-foreground">
            Großbuchstaben
          </Label>
          <Switch
            id="uppercase"
            checked={style.uppercase}
            onCheckedChange={(uppercase) => onChange({ uppercase })}
          />
        </section>
      </div>
    </ScrollArea>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (value: number) => void
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="font-mono text-xs font-medium tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(singleValue(next))}
      />
    </section>
  )
}
