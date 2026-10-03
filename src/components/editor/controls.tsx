'use client'

import React, { useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { singleValue } from '@/lib/slider-value'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Bausteine des Inspectors.
 *
 * Dicht wie in einem Schnittprogramm: Beschriftung links in fester Breite,
 * Regler rechts, jede Zahl direkt eintippbar — und per Ziehen am Wert
 * verstellbar, wie man es aus After Effects oder Resolve kennt.
 */

type IconType = React.ComponentType<{ className?: string }>

export function InspectorSection({
  title,
  icon: Icon,
  actions,
  defaultOpen = true,
  children,
}: {
  title: string
  icon?: IconType
  actions?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-border/70 last:border-b-0">
      <div className="flex h-9 items-center gap-2 pr-2 pl-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="transition-ui flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase hover:text-foreground"
        >
          <ChevronDown className={cn('transition-ui size-3 shrink-0', !open && '-rotate-90')} />
          {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
          <span className="truncate">{title}</span>
        </button>
        {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
      </div>
      {open ? <div className="flex flex-col gap-2.5 px-3 pt-0.5 pb-4">{children}</div> : null}
    </section>
  )
}

export function Field({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid min-h-7 grid-cols-[78px_minmax(0,1fr)] items-center gap-2', className)}>
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Zahlenfeld: Klick zum Tippen, Ziehen zum Verstellen, Pfeiltasten in
 * Schritten (mit Shift zehnfach). Arbeitet in Anzeigeeinheiten.
 */
export function NumberBox({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  precision = 0,
  unit = '',
  className,
  label,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  precision?: number
  unit?: string
  className?: string
  label?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrub = useRef<{ x: number; value: number; moved: boolean } | null>(null)
  const round = (next: number) => Number(next.toFixed(precision))
  const display = `${value.toFixed(precision)}${unit}`

  const commit = (text: string) => {
    const parsed = Number.parseFloat(text.replace(',', '.').replace(/[^\d.+-]/g, ''))
    if (Number.isFinite(parsed)) onChange(clamp(round(parsed), min, max))
    setDraft(null)
  }

  return (
    <input
      ref={inputRef}
      aria-label={label}
      inputMode="decimal"
      value={draft ?? display}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => { setDraft(value.toFixed(precision)); requestAnimationFrame(() => event.target.select()) }}
      onBlur={() => { if (draft !== null) commit(draft) }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); if (draft !== null) commit(draft); inputRef.current?.blur() }
        if (event.key === 'Escape') { event.preventDefault(); setDraft(null); inputRef.current?.blur() }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          const delta = (event.key === 'ArrowUp' ? 1 : -1) * step * (event.shiftKey ? 10 : 1)
          const next = clamp(round(value + delta), min, max)
          onChange(next)
          setDraft(next.toFixed(precision))
        }
      }}
      onPointerDown={(event) => {
        if (document.activeElement === inputRef.current) return
        event.preventDefault()
        scrub.current = { x: event.clientX, value, moved: false }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const state = scrub.current
        if (!state) return
        const dx = event.clientX - state.x
        if (!state.moved && Math.abs(dx) < 3) return
        state.moved = true
        onChange(clamp(round(state.value + Math.round(dx / 2) * step * (event.shiftKey ? 10 : 1)), min, max))
      }}
      onPointerUp={(event) => {
        const state = scrub.current
        scrub.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        if (state && !state.moved) inputRef.current?.focus()
      }}
      className={cn(
        'h-7 w-[60px] shrink-0 cursor-ew-resize rounded-md border border-input bg-input/30 px-1.5 text-right font-mono text-xs tabular-nums outline-none select-none',
        'transition-ui hover:border-ring/60 focus:cursor-text focus:border-ring focus:ring-2 focus:ring-ring/40',
        className,
      )}
    />
  )
}

/**
 * Regler mit Zahlenfeld. `factor` rechnet Modell- in Anzeigewerte um —
 * gespeichert wird 0..1, angezeigt 0..100 %.
 */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  factor = 1,
  unit = '',
  precision = 0,
}: {
  label: React.ReactNode
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  factor?: number
  unit?: string
  precision?: number
}) {
  return (
    <Field label={label}>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(singleValue(next))}
        className="min-w-0 flex-1"
      />
      <NumberBox
        label={typeof label === 'string' ? label : undefined}
        value={value * factor}
        min={min * factor}
        max={max * factor}
        step={step * factor}
        precision={precision}
        unit={unit}
        onChange={(next) => onChange(next / factor)}
      />
    </Field>
  )
}

export function ToggleField({ label, checked, onChange, hint }: { label: React.ReactNode; checked: boolean; onChange: (value: boolean) => void; hint?: string }) {
  return (
    <label className="flex min-h-7 cursor-pointer items-center justify-between gap-3">
      <span className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        {hint ? <span className="text-[11px] leading-snug text-muted-foreground/70">{hint}</span> : null}
      </span>
      <Switch size="sm" checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label?: string
  icon?: IconType
  title?: string
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  label,
}: {
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  className?: string
  label?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex h-7 min-w-0 flex-1 items-center gap-0.5 rounded-md bg-muted/70 p-0.5', className)}>
      {options.map((option) => {
        const active = option.value === value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.title ?? option.label}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              'transition-ui flex h-full min-w-0 flex-1 items-center justify-center gap-1 rounded-[5px] px-1.5 text-xs whitespace-nowrap text-muted-foreground',
              'hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
              active && 'bg-background text-foreground shadow-sm ring-1 ring-white/10',
            )}
          >
            {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
            {option.label ? <span className="truncate">{option.label}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

export function SelectField<T extends string>({
  value,
  options,
  onChange,
  renderLabel,
  className,
}: {
  value: T
  options: Array<{ value: T; label: string; style?: React.CSSProperties }>
  onChange: (value: T) => void
  renderLabel?: (value: T) => React.ReactNode
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(next) => { if (next !== null) onChange(next as T) }}>
      <SelectTrigger size="sm" className={cn('w-full min-w-0 text-xs', className)}>
        <SelectValue>{(current) => (renderLabel ? renderLabel(current as T) : options.find((option) => option.value === current)?.label)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-xs">
            <span style={option.style}>{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Farben für Inhalte im Video — die Oberfläche selbst bleibt einfarbig. */
export const CONTENT_SWATCHES = [
  '#FFFFFF', '#D1D1D6', '#8E8E93', '#3A3A3C', '#1C1C1E', '#000000', '#F4E3C1', '#A2845E',
  '#FFE81F', '#FFD60A', '#FF9F0A', '#FF453A', '#FF6FB5', '#BF5AF2', '#5E5CE6', '#0A84FF',
  '#64D2FF', '#30D158', '#D4FF3A', '#00C7BE',
]

function toHex6(color: string): string {
  const value = color.replace('#', '')
  if (value.length === 3 || value.length === 4) return `#${value.slice(0, 3).split('').map((char) => char + char).join('')}`
  return `#${value.slice(0, 6)}`
}

export function ColorField({ value, onChange, label = 'Farbe' }: { value: string; onChange: (color: string) => void; label?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (text: string) => {
    const normalized = text.trim().replace(/^#?/, '#').toUpperCase()
    if (/^#[0-9A-F]{6}$/.test(normalized)) onChange(normalized)
    setDraft(null)
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <Popover>
        <PopoverTrigger
          render={<button type="button" />}
          aria-label={`${label} wählen`}
          className="transition-ui size-7 shrink-0 rounded-md shadow-[inset_0_0_0_1px_rgb(128_128_128/0.35)] hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          style={{ background: value }}
        />
        <PopoverContent align="start" className="w-60 gap-3">
          <div className="grid grid-cols-10 gap-1.5">
            {CONTENT_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                onClick={() => onChange(color)}
                className={cn(
                  'transition-ui size-[18px] rounded-full shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2)] hover:scale-110',
                  value.toUpperCase() === color && 'ring-2 ring-foreground ring-offset-1 ring-offset-popover',
                )}
                style={{ background: color }}
              />
            ))}
          </div>
          <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            Eigene Farbe
            <input
              type="color"
              value={toHex6(value)}
              onChange={(event) => onChange(event.target.value.toUpperCase())}
              className="h-7 w-12 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
            />
          </label>
        </PopoverContent>
      </Popover>
      <input
        aria-label={`${label} als Hex-Wert`}
        value={draft ?? value.toUpperCase()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { if (draft !== null) commit(draft) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); if (draft !== null) commit(draft); (event.target as HTMLInputElement).blur() }
          if (event.key === 'Escape') { setDraft(null); (event.target as HTMLInputElement).blur() }
        }}
        className="transition-ui h-7 min-w-0 flex-1 rounded-md border border-input bg-input/30 px-2 font-mono text-xs uppercase outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
      />
    </div>
  )
}

/** Kleiner Symbolknopf mit Tooltip — für Kopfzeilen und Werkzeugleisten. */
export function IconButton({
  icon: Icon,
  label,
  shortcut,
  onClick,
  pressed,
  disabled,
  className,
  side = 'top',
}: {
  icon: IconType
  label: string
  shortcut?: string
  onClick: () => void
  pressed?: boolean
  disabled?: boolean
  className?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" />}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={pressed}
        className={cn(
          'transition-ui inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground',
          'hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
          'disabled:pointer-events-none disabled:opacity-40',
          pressed && 'bg-foreground/[0.12] text-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)]',
          className,
        )}
      >
        <Icon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent side={side}>
        {label}
        {shortcut ? <kbd className="ml-1 rounded bg-background/20 px-1 font-mono text-[10px]">{shortcut}</kbd> : null}
      </TooltipContent>
    </Tooltip>
  )
}
