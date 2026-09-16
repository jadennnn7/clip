import React from 'react'
import { cn } from '@/lib/utils'

/**
 * Schweregrad eines Messwerts.
 *
 * Statusfarben sind reserviert und treten nie allein auf — zu jedem Grad
 * gehört eine Textaussage in der Kontextzeile. Wer Rot nicht als Rot
 * wahrnimmt, muss dieselbe Information trotzdem bekommen.
 */
export type StatSeverity = 'neutral' | 'warning' | 'critical'

interface StatTileProps {
  label: string
  value: string | number
  /** Einheit oder Bezug, direkt hinter dem Wert und deutlich zurückgenommen. */
  unit?: string
  context?: string
  /** Optionaler Füllstand 0–1. Erzeugt einen Balken unter dem Wert. */
  meter?: number
  severity?: StatSeverity
  icon?: React.ComponentType<{ className?: string }>
  /** Verzögerung des Einblendens in ms — staffelt die Kacheln einer Reihe. */
  delayMs?: number
  className?: string
}

/**
 * Füllung und Spur des Balkens.
 *
 * Die Spur ist jeweils eine hellere Stufe derselben Farbe wie die Füllung,
 * damit der Zustand über die gesamte Balkenbreite ablesbar bleibt und nicht
 * nur dort, wo gefüllt ist.
 */
const METER_TONE: Record<StatSeverity, { fill: string; track: string }> = {
  neutral: { fill: 'bg-primary', track: 'bg-muted' },
  warning: { fill: 'bg-amber-500', track: 'bg-amber-500/15' },
  critical: { fill: 'bg-destructive', track: 'bg-destructive/15' },
}

const VALUE_TONE: Record<StatSeverity, string> = {
  neutral: 'text-foreground',
  warning: 'text-amber-600 dark:text-amber-400',
  critical: 'text-destructive',
}

export function StatTile({
  label,
  value,
  unit,
  context,
  meter,
  severity = 'neutral',
  icon: Icon,
  delayMs = 0,
  className,
}: StatTileProps) {
  const tone = METER_TONE[severity]

  return (
    <div
      className={cn(
        'rise-in transition-ui flex flex-col rounded-xl border bg-card p-4 shadow-xs',
        'hover:shadow-sm dark:hover:border-border/80',
        className,
      )}
      style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      <div className="flex items-center gap-1.5">
        {Icon ? <Icon className="size-3.5 text-muted-foreground" /> : null}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>

      {/*
        Bewusst OHNE tabular-nums: Bei Anzeigegrößen bekommt jede Ziffer sonst
        die Breite einer Null, und eine Zahl wie 121 wirkt auseinandergezogen.
        Tabellarische Ziffern gehören in Spalten, die vertikal fluchten müssen —
        hier steht jede Zahl für sich.
      */}
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className={cn(
            'text-3xl leading-none font-semibold tracking-tight',
            VALUE_TONE[severity],
          )}
        >
          {value}
        </span>
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
      </div>

      {/* `mt-auto` drückt Balken und Kontextzeile an die Unterkante. Ohne das
          sitzt die Kontextzeile jeder Kachel auf einer anderen Höhe, sobald
          eine davon einen Balken trägt — die Reihe liest sich dann nicht mehr
          als Reihe. */}
      {meter !== undefined ? (
        <div className={cn('mt-auto pt-3 h-1.5 w-full overflow-hidden rounded-full box-content', tone.track)}>
          <div
            className={cn('h-full rounded-full transition-ui', tone.fill)}
            style={{ width: `${Math.max(0, Math.min(1, meter)) * 100}%` }}
          />
        </div>
      ) : null}

      {context ? (
        <p
          className={cn(
            'text-xs text-muted-foreground',
            meter !== undefined ? 'mt-2' : 'mt-auto pt-3',
          )}
        >
          {context}
        </p>
      ) : null}
    </div>
  )
}
