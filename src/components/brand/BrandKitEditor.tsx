'use client'

import React, { useEffect, useId, useRef } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import type { BrandKit } from '@/types/workspace'
import type { CaptionStyle } from '@/types/database'
import { COMPOSITION_HEIGHT, COMPOSITION_WIDTH } from '@/types/editor'
import {
  CAPTION_ANIMATION_LABELS,
  CAPTION_PRESET_LABELS,
  CAPTION_PRESETS,
} from '../../../remotion/captions/presets'
import { captionWeight } from '../../../remotion/captions/CaptionLayer'
import {
  FONTS,
  FONT_CATEGORY_LABELS,
  FONT_KEYS,
  fontDefinition,
  fontKeyFromCss,
  fontStack,
  resolveWeight,
} from '../../../remotion/fonts'
import { CaptionSpecimen, SPECIMEN_SHORT, VIDEO_BLACK } from '@/components/brand/BrandKitCard'
import { ColorField, NumberBox } from '@/components/editor/controls'
import { useFontPreviews } from '@/components/editor/fonts-preview'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { singleValue } from '@/lib/slider-value'
import { cn } from '@/lib/utils'

interface BrandKitEditorProps {
  kit: BrandKit
  /** Nach dem Anlegen steht der Cursor gleich im Namen. */
  focusName?: boolean
  onChange: (kit: BrandKit) => void
  onNameCommit: () => void
  onDuplicate: () => void
  onDelete: () => void
  className?: string
}

const WEIGHT_LABELS: Record<number, string> = { 400: 'Normal', 500: 'Medium', 600: 'Halbfett', 700: 'Fett', 800: 'Extrafett', 900: 'Black' }

const PRESET_KEYS = Object.keys(CAPTION_PRESETS) as Array<CaptionStyle['preset']>
const ANIMATION_KEYS = Object.keys(CAPTION_ANIMATION_LABELS) as Array<CaptionStyle['animation']>

/* -------------------------------------------------------------------------- */
/* Bausteine des Formulars                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Ein Abschnitt: links steht, worum es geht, rechts wird eingestellt. In
 * schmalen Spalten rutscht die Überschrift über die Felder.
 */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-8 gap-y-4 px-5 py-5 @xl:grid-cols-[11rem_minmax(0,1fr)] sm:px-6">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {hint ? <p className="mt-1 text-xs leading-relaxed text-pretty text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  )
}

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  const Label = htmlFor ? 'label' : 'span'
  return (
    <div className="grid min-h-8 grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3">
      <Label htmlFor={htmlFor} className="truncate text-[13px] text-foreground/85">
        {label}
      </Label>
      <div className="flex min-w-0 items-center gap-3">{children}</div>
    </div>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  factor = 1,
  unit = '',
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  /** Rechnet Modell- in Anzeigewerte um — gespeichert wird 0..1, angezeigt 0..100 %. */
  factor?: number
  unit?: string
}) {
  return (
    <Row label={label}>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(singleValue(next))}
        className="min-w-0 flex-1"
      />
      <NumberBox
        label={label}
        value={value * factor}
        min={min * factor}
        max={max * factor}
        step={step * factor}
        unit={unit}
        onChange={(next) => onChange(next / factor)}
        className="w-16"
      />
    </Row>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex min-h-8 items-center justify-between gap-4">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-[13px] text-foreground/85">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{hint}</span> : null}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  renderValue,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string; style?: React.CSSProperties }>
  onChange: (value: T) => void
  renderValue?: (value: T) => React.ReactNode
}) {
  return (
    <Select value={value} onValueChange={(next) => { if (next !== null) onChange(next as T) }}>
      <SelectTrigger size="sm" aria-label={label} className="w-full min-w-0 text-[13px]">
        <SelectValue>
          {(current) => (renderValue ? renderValue(current as T) : options.find((option) => option.value === current)?.label)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-[13px]">
            <span style={option.style}>{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ColorCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

/**
 * Die Vorlagen als ruhige Reihe gleicher Kacheln: dasselbe Muster in jedem
 * Stil, der Name darunter in der Schrift der Oberfläche. Vorher stand der
 * Name selbst im Stil — ganz in Gelb, Grün oder Rot — und neun solcher
 * Kacheln lasen sich wie ein Stickerbogen.
 */
function PresetPicker({ active, onApply }: { active: CaptionStyle['preset']; onApply: (preset: CaptionStyle['preset']) => void }) {
  return (
    <div role="group" aria-label="Vorlage" className="grid grid-cols-2 gap-x-2.5 gap-y-3 @xs:grid-cols-3">
      {PRESET_KEYS.map((preset) => {
        const selected = preset === active
        return (
          <button
            key={preset}
            type="button"
            onClick={() => onApply(preset)}
            aria-pressed={selected}
            className="group/preset flex min-w-0 flex-col gap-1.5 text-left outline-none"
          >
            <span
              className={cn(
                'transition-ui flex h-14 w-full items-center justify-center overflow-hidden rounded-lg px-2',
                'group-focus-visible/preset:ring-2 group-focus-visible/preset:ring-ring/70',
                selected
                  ? 'ring-2 ring-primary'
                  : 'ring-1 ring-foreground/10 group-hover/preset:ring-foreground/30',
              )}
              style={{ background: VIDEO_BLACK }}
            >
              <CaptionSpecimen style={CAPTION_PRESETS[preset]} size={14} {...SPECIMEN_SHORT} />
            </span>
            <span
              className={cn(
                'transition-ui truncate px-0.5 text-xs',
                selected ? 'font-medium text-foreground' : 'text-muted-foreground group-hover/preset:text-foreground',
              )}
            >
              {CAPTION_PRESET_LABELS[preset]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * Die Einstellungen eines Kits als Formular: klar benannte Abschnitte statt
 * der dichten Reglerspalte aus dem Editor. Dort sitzt man am Schnittplatz
 * und kennt jeden Regler; hier richtet man einmal seinen Stil ein und will
 * lesen können, was ein Feld tut. Die Eingabefelder selbst sind dieselben.
 *
 * Gespeichert wird von selbst — ein Speichern-Knopf neben einer
 * Live-Vorschau lädt nur dazu ein, Änderungen beim Wechsel auf ein anderes
 * Kit zu verlieren.
 */
export function BrandKitEditor({
  kit,
  focusName = false,
  onChange,
  onNameCommit,
  onDuplicate,
  onDelete,
  className,
}: BrandKitEditorProps) {
  useFontPreviews()
  const nameId = useId()
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!focusName) return
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [focusName, kit.id])

  const style = kit.style
  const fontKey = fontKeyFromCss(style.fontFamily) ?? 'inter'
  const font = fontDefinition(fontKey)
  const weight = captionWeight(style)

  const patch = (next: Partial<CaptionStyle>) => {
    onChange({ ...kit, style: { ...kit.style, ...next } })
  }

  const applyPreset = (preset: CaptionStyle['preset']) => {
    const presetStyle = CAPTION_PRESETS[preset]
    if (!presetStyle) return
    onChange({ ...kit, style: { ...presetStyle, enabled: kit.style.enabled !== false } })
  }

  return (
    <section
      aria-label={`${kit.name} bearbeiten`}
      className={cn('glass-tile @container min-w-0 divide-y divide-border/60 rounded-2xl', className)}
    >
      <Section title="Kit" hint="Der Name erscheint überall, wo du einen Stil auswählst.">
        <Row label="Name" htmlFor={nameId}>
          <Input
            ref={nameRef}
            id={nameId}
            value={kit.name}
            onChange={(event) => onChange({ ...kit, name: event.target.value })}
            onBlur={onNameCommit}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur()
            }}
            placeholder="Name des Kits"
            maxLength={60}
          />
        </Row>
        <ToggleRow
          label="Untertitel anzeigen"
          hint="Ausgeblendet fehlen sie auch im MP4."
          checked={style.enabled !== false}
          onChange={(enabled) => patch({ enabled })}
        />
      </Section>

      <Section title="Vorlage" hint="Ein Startpunkt. Setzt Schrift, Farben und Position neu — danach passt du alles frei an.">
        <PresetPicker active={style.preset} onApply={applyPreset} />
      </Section>

      <Section title="Schrift" hint={`Die Größe gilt für das fertige Video mit ${COMPOSITION_WIDTH}\u00a0×\u00a0${COMPOSITION_HEIGHT}\u00a0px.`}>
        <Row label="Schriftart">
          <Choice
            label="Schriftart"
            value={fontKey}
            options={FONT_KEYS.map((key) => ({
              value: key,
              label: `${FONTS[key].label} · ${FONT_CATEGORY_LABELS[FONTS[key].category]}`,
              style: { fontFamily: fontStack(key) },
            }))}
            renderValue={(key) => <span style={{ fontFamily: fontStack(key) }}>{fontDefinition(key).label}</span>}
            onChange={(key) => patch({ fontFamily: fontStack(key), fontWeight: resolveWeight(key, weight) })}
          />
        </Row>
        <Row label="Stärke">
          <Choice
            label="Schriftstärke"
            value={String(weight)}
            options={font.weights.map((value) => ({ value: String(value), label: WEIGHT_LABELS[value] ?? String(value) }))}
            onChange={(value) => patch({ fontWeight: Number(value) })}
          />
        </Row>
        <SliderRow label="Größe" value={style.fontSize} min={28} max={160} step={2} unit=" px" onChange={(fontSize) => patch({ fontSize })} />
        <ToggleRow label="Großbuchstaben" checked={style.uppercase} onChange={(uppercase) => patch({ uppercase })} />
      </Section>

      <Section title="Zeile" hint={'Wie viele Wörter gleichzeitig stehen und wo sie im Bild sitzen: 0\u00a0% ist ganz oben, 100\u00a0% ganz unten.'}>
        <SliderRow label="Wörter pro Zeile" value={style.wordsPerLine} min={1} max={8} step={1} onChange={(wordsPerLine) => patch({ wordsPerLine })} />
        <SliderRow label="Position" value={style.positionY} min={5} max={95} step={1} unit=" %" onChange={(positionY) => patch({ positionY })} />
        <ToggleRow
          label="Satzzeichen"
          hint="Punkt und Komma zeigen. ? und ! bleiben immer."
          checked={style.punctuation === true}
          onChange={(punctuation) => patch({ punctuation })}
        />
      </Section>

      <Section title="Farben" hint="Das aktive Wort ist das, das gerade gesprochen wird.">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-3">
          <ColorCell label="Text">
            <ColorField value={style.color} onChange={(color) => patch({ color })} label="Textfarbe" />
          </ColorCell>
          <ColorCell label="Aktives Wort">
            <ColorField value={style.highlightColor} onChange={(highlightColor) => patch({ highlightColor })} label="Hervorhebung" />
          </ColorCell>
          <ColorCell label="Kontur">
            <ColorField value={style.strokeColor} onChange={(strokeColor) => patch({ strokeColor })} label="Konturfarbe" />
          </ColorCell>
        </div>
        <SliderRow label="Konturstärke" value={style.strokeWidth} min={0} max={28} step={1} unit=" px" onChange={(strokeWidth) => patch({ strokeWidth })} />
        <SliderRow label="Schatten" value={style.shadow ?? 0} min={0} max={1} step={0.01} factor={100} unit=" %" onChange={(shadow) => patch({ shadow })} />
      </Section>

      <Section title="Box" hint="Eine Fläche hinter der Zeile hält den Text auch auf unruhigem Bild lesbar.">
        <ToggleRow
          label="Box hinter der Zeile"
          checked={Boolean(style.background)}
          onChange={(on) => patch({ background: on ? '#000000' : null, backgroundOpacity: style.backgroundOpacity ?? 0.7 })}
        />
        {style.background ? (
          <>
            <Row label="Farbe">
              <div className="flex w-44 max-w-full">
                <ColorField value={style.background} onChange={(background) => patch({ background })} label="Boxfarbe" />
              </div>
            </Row>
            <SliderRow
              label="Deckkraft"
              value={style.backgroundOpacity ?? 1}
              min={0}
              max={1}
              step={0.01}
              factor={100}
              unit=" %"
              onChange={(backgroundOpacity) => patch({ backgroundOpacity })}
            />
          </>
        ) : null}
      </Section>

      <Section title="Animation" hint="Wie ein Wort das nächste ablöst.">
        <Row label="Wortwechsel">
          <Choice
            label="Wortwechsel"
            value={style.animation}
            options={ANIMATION_KEYS.map((animation) => ({ value: animation, label: CAPTION_ANIMATION_LABELS[animation] }))}
            onChange={(animation) => patch({ animation })}
          />
        </Row>
      </Section>

      {/* Seltene Aktionen am Ende, wie in jeder Einstellungsseite — nicht als
          Symbole neben dem Namen, wo man sie beim Tippen trifft. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
        <Button variant="ghost" size="sm" onClick={onDuplicate} className="-ml-2 text-muted-foreground hover:text-foreground">
          <Copy />
          Kit duplizieren
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="-mr-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15"
        >
          <Trash2 />
          Kit löschen
        </Button>
      </div>
    </section>
  )
}
