'use client'

import React, { useEffect } from 'react'
import { Copy, MoreHorizontal, Palette, Trash2 } from 'lucide-react'
import type { BrandKit } from '@/types/workspace'
import type { CaptionStyle } from '@/types/database'
import { captionWeight } from '../../../remotion/captions/CaptionLayer'
import { ensureFont, fontDefinition, fontKeyFromCss } from '../../../remotion/fonts'
import { withAlpha } from '../../../remotion/overlays/defaults'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const SPECIMEN = ['So', 'klingt', 'deine', 'Marke']
/** Das hervorgehobene Wort — wie das gerade gesprochene im Clip. */
const SPECIMEN_ACTIVE = 2

/** Für kleine Kacheln: Zwei Wörter bleiben lesbar, wo vier zu Pixelbrei werden. */
export const SPECIMEN_SHORT = { words: ['Dein', 'Text'], active: 1 }

interface CaptionSpecimenProps {
  style: CaptionStyle
  size?: number
  words?: string[]
  /** Index des hervorgehobenen Worts. */
  active?: number
}

/**
 * Ein Schriftmuster des Kits, mit denselben Regeln wie `CaptionLayer`
 * gesetzt, nur auf eine feste Größe skaliert: Kontur, Schatten und Box
 * wachsen im selben Verhältnis mit, damit ein kräftiger Stil auch in der
 * Kachel kräftig wirkt und ein feiner fein.
 */
export function CaptionSpecimen({ style, size = 20, words = SPECIMEN, active = SPECIMEN_ACTIVE }: CaptionSpecimenProps) {
  const fontKey = fontKeyFromCss(style.fontFamily)
  const weight = captionWeight(style)
  useEffect(() => {
    if (fontKey) ensureFont(fontKey, weight)
  }, [fontKey, weight])

  const scale = size / style.fontSize
  const stroke = style.strokeWidth * scale
  const boxed = Boolean(style.background) && (style.backgroundOpacity ?? 1) > 0
  const highlight = style.highlightColor.toLowerCase() !== style.color.toLowerCase()
  const shadow = style.shadow
    ? `0 ${(3 + style.shadow * 6) * scale}px ${(10 + style.shadow * 30) * scale}px rgba(0, 0, 0, ${0.3 + style.shadow * 0.5})`
    : undefined

  return (
    <span
      className="inline-block max-w-full text-center text-balance"
      style={{
        fontFamily: style.fontFamily,
        fontWeight: weight,
        fontSize: size,
        lineHeight: boxed ? 1.2 : 1.14,
        letterSpacing: '-0.01em',
        wordSpacing: stroke * 0.6,
        textTransform: style.uppercase ? 'uppercase' : 'none',
        color: style.color,
        background: boxed ? withAlpha(style.background!, style.backgroundOpacity ?? 1) : undefined,
        padding: boxed ? `${size * 0.14}px ${size * 0.34}px` : undefined,
        borderRadius: boxed ? size * 0.28 : undefined,
      }}
    >
      {words.map((word, index) => (
        <React.Fragment key={index}>
          {index > 0 ? ' ' : null}
          <span
            style={{
              color: index === active && highlight ? style.highlightColor : undefined,
              WebkitTextStroke: stroke > 0 ? `${stroke}px ${style.strokeColor}` : undefined,
              paintOrder: 'stroke fill',
              textShadow: shadow,
            }}
          >
            {word}
          </span>
        </React.Fragment>
      ))}
    </span>
  )
}

/** Videoschwarz: Die Kits sind fast alle weiß und verschwänden auf der Fläche des Dashboards. */
export const VIDEO_BLACK = 'radial-gradient(120% 90% at 50% 0%, #3a3a3c 0%, #161618 55%, #0a0a0a 100%)'

interface BrandKitCardProps {
  kit: BrandKit
  isSelected: boolean
  clipCount: number
  onSelect: () => void
  onApply: () => void
  onDuplicate: () => void
  onDelete: () => void
}

/**
 * Ein Kit in der Auswahl: Schriftmuster, Name, Schrift und Verwendung.
 *
 * Die Kits stehen als Reihe über der Arbeitsfläche — erst wählen, dann
 * einstellen. Als schmale Spalte daneben blieb bei zwei Kits eine halbe
 * Seite leer, und das Muster war mit 9 px nicht mehr zu lesen. Die ganze
 * Karte wählt aus; Anwenden, Duplizieren und Löschen liegen im Menü, weil
 * sie seltener sind als das Umschalten.
 */
export function BrandKitCard({
  kit,
  isSelected,
  clipCount,
  onSelect,
  onApply,
  onDuplicate,
  onDelete,
}: BrandKitCardProps) {
  const fontKey = fontKeyFromCss(kit.style.fontFamily)
  const fontLabel = fontKey ? fontDefinition(fontKey).label : 'Systemschrift'

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 rounded-xl border p-2 transition-ui',
        isSelected
          ? 'border-primary bg-primary/[0.07] shadow-[0_0_0_1px_var(--primary)]'
          : 'border-border bg-foreground/[0.02] hover:border-foreground/25 hover:bg-foreground/[0.04]',
      )}
    >
      {/* Die Fläche zum Auswählen liegt unter dem Inhalt, das Menü darüber —
          so steckt kein Knopf in einem Knopf. */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        aria-label={`${kit.name} bearbeiten`}
        className="absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      />

      <div
        className="well pointer-events-none relative flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg px-1.5"
        style={{ background: VIDEO_BLACK }}
      >
        <CaptionSpecimen style={kit.style} size={13} {...SPECIMEN_SHORT} />
      </div>

      <div className="pointer-events-none relative min-w-0 flex-1">
        <p className="truncate text-sm leading-tight font-medium text-foreground">{kit.name}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {fontLabel} · {clipCount} {clipCount === 1 ? 'Clip' : 'Clips'}
        </p>
      </div>

      <div className="relative z-10">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<button type="button" />}
            aria-label={`Aktionen für ${kit.name}`}
            className={cn(
              'transition-ui flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none',
              'hover:bg-foreground/[0.07] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60',
              'aria-expanded:bg-foreground/[0.07] aria-expanded:text-foreground',
            )}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onApply} className="gap-2">
              <Palette className="size-4" />
              Auf Clips anwenden
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate} className="gap-2">
              <Copy className="size-4" />
              Duplizieren
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} variant="destructive" className="gap-2">
              <Trash2 className="size-4" />
              Löschen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
