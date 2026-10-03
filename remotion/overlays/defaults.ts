import type {
  Overlay,
  OverlayAnimation,
  ShapeKind,
  VideoLayout,
  VideoSettings,
} from '@/types/database'
import { DEFAULT_FONT, isFontKey } from '../fonts'

/**
 * Standardwerte und Bereinigung für alles, was über dem Bild liegt.
 *
 * Die Composition ruft `normalizeOverlays` und `resolveVideoSettings` selbst
 * auf, statt den Props zu vertrauen: Sie bekommt dieselben Daten aus dem
 * Browser, aus gespeicherten Clips älterer Versionen und über die Render-API.
 * Ein fehlendes oder unsinniges Feld darf dort keinen Render abbrechen.
 */

export const OVERLAY_ANIMATIONS: OverlayAnimation[] = [
  'none', 'fade', 'pop', 'zoom', 'blur', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'typewriter',
]

export const OVERLAY_ANIMATION_LABELS: Record<OverlayAnimation, string> = {
  none: 'Keine',
  fade: 'Blende',
  pop: 'Pop',
  zoom: 'Zoom',
  blur: 'Unschärfe',
  'slide-up': 'Von unten',
  'slide-down': 'Von oben',
  'slide-left': 'Von rechts',
  'slide-right': 'Von links',
  typewriter: 'Schreibmaschine',
}

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: 'Rechteck',
  ellipse: 'Ellipse',
  line: 'Linie',
  arrow: 'Pfeil',
}

export const VIDEO_LAYOUT_LABELS: Record<VideoLayout, string> = {
  fill: 'Füllen',
  fit: 'Einpassen',
  'fit-blur': 'Unschärfe',
}

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
  layout: 'fill',
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  flip: false,
  background: '#000000',
  look: 'original',
  brightness: 1,
  contrast: 1,
  saturation: 1,
  warmth: 0,
  vignette: 0,
  volume: 1,
  muted: false,
  fadeIn: 0,
  fadeOut: 0,
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback
}

function optionalColor(value: unknown, fallback: string | null): string | null {
  if (value === null) return null
  return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback
}

function text(value: unknown, fallback: string, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : fallback
}

function animation(value: unknown): OverlayAnimation {
  return OVERLAY_ANIMATIONS.includes(value as OverlayAnimation) ? (value as OverlayAnimation) : 'none'
}

export function resolveVideoSettings(value: Partial<VideoSettings> | null | undefined): VideoSettings {
  if (!value || typeof value !== 'object') return DEFAULT_VIDEO_SETTINGS
  const defaults = DEFAULT_VIDEO_SETTINGS
  return {
    layout: value.layout === 'fit' || value.layout === 'fit-blur' ? value.layout : 'fill',
    zoom: num(value.zoom, defaults.zoom, 1, 4),
    offsetX: num(value.offsetX, 0, -1, 1),
    offsetY: num(value.offsetY, 0, -1, 1),
    flip: value.flip === true,
    background: color(value.background, defaults.background),
    look: text(value.look, defaults.look, 40),
    brightness: num(value.brightness, 1, 0.3, 2),
    contrast: num(value.contrast, 1, 0.3, 2),
    saturation: num(value.saturation, 1, 0, 3),
    warmth: num(value.warmth, 0, 0, 1),
    vignette: num(value.vignette, 0, 0, 1),
    // Über 100 % verstärkt nur der Render, nicht der Browser — Vorschau und
    // Datei klängen verschieden. Deshalb bei 1 gedeckelt.
    volume: num(value.volume, 1, 0, 1),
    muted: value.muted === true,
    fadeIn: num(value.fadeIn, 0, 0, 5),
    fadeOut: num(value.fadeOut, 0, 0, 5),
  }
}

export function normalizeOverlay(value: unknown): Overlay | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || !raw.id) return null
  const start = num(raw.start, 0, 0, 3600)
  const end = num(raw.end, 0, 0, 3600)
  if (end - start < 1 / 30) return null

  const base = {
    id: raw.id.slice(0, 64),
    name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : undefined,
    start,
    end,
    track: Math.round(num(raw.track, 0, 0, 64)),
    x: num(raw.x, 0.5, -0.5, 1.5),
    y: num(raw.y, 0.5, -0.5, 1.5),
    scale: num(raw.scale, 1, 0.05, 10),
    rotation: num(raw.rotation, 0, -360, 360),
    opacity: num(raw.opacity, 1, 0, 1),
    animationIn: animation(raw.animationIn),
    animationOut: animation(raw.animationOut),
    hidden: raw.hidden === true,
    locked: raw.locked === true,
  }

  switch (raw.kind) {
    case 'text':
      return {
        ...base,
        kind: 'text',
        text: text(raw.text, '', 2000),
        font: isFontKey(raw.font) ? raw.font : DEFAULT_FONT,
        fontSize: num(raw.fontSize, 64, 8, 480),
        fontWeight: num(raw.fontWeight, 800, 100, 900),
        italic: raw.italic === true,
        color: color(raw.color, '#FFFFFF'),
        align: raw.align === 'left' || raw.align === 'right' ? raw.align : 'center',
        uppercase: raw.uppercase === true,
        letterSpacing: num(raw.letterSpacing, 0, -0.2, 1),
        lineHeight: num(raw.lineHeight, 1.15, 0.7, 3),
        strokeColor: color(raw.strokeColor, '#000000'),
        strokeWidth: num(raw.strokeWidth, 0, 0, 40),
        shadow: num(raw.shadow, 0, 0, 1),
        background: optionalColor(raw.background, null),
        backgroundOpacity: num(raw.backgroundOpacity, 1, 0, 1),
        padding: num(raw.padding, 0, 0, 240),
        radius: num(raw.radius, 0, 0, 480),
        maxWidth: num(raw.maxWidth, 0.86, 0.1, 1),
        ...(raw.lineBox === true ? { lineBox: true } : {}),
        ...(raw.role === 'hook' ? { role: 'hook' as const } : {}),
      }
    case 'shape':
      return {
        ...base,
        kind: 'shape',
        shape: raw.shape === 'ellipse' || raw.shape === 'line' || raw.shape === 'arrow' ? raw.shape : 'rect',
        width: num(raw.width, 400, 2, 4000),
        height: num(raw.height, 240, 2, 4000),
        fill: optionalColor(raw.fill, '#FFFFFF'),
        fillOpacity: num(raw.fillOpacity, 1, 0, 1),
        stroke: color(raw.stroke, '#FFFFFF'),
        strokeWidth: num(raw.strokeWidth, 0, 0, 80),
        radius: num(raw.radius, 0, 0, 2000),
      }
    case 'emoji':
      return { ...base, kind: 'emoji', emoji: text(raw.emoji, '🔥', 32) || '🔥', size: num(raw.size, 180, 16, 1600) }
    case 'progress':
      return {
        ...base,
        kind: 'progress',
        position: raw.position === 'top' ? 'top' : 'bottom',
        thickness: num(raw.thickness, 12, 2, 120),
        color: color(raw.color, '#FFFFFF'),
        trackColor: color(raw.trackColor, '#000000'),
        trackOpacity: num(raw.trackOpacity, 0.35, 0, 1),
      }
    default:
      return null
  }
}

export function normalizeOverlays(value: unknown): Overlay[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 300).flatMap((item) => {
    const overlay = normalizeOverlay(item)
    return overlay ? [overlay] : []
  })
}

/** `#RRGGBB` plus Deckkraft als CSS-Farbe. */
export function withAlpha(hex: string, alpha: number): string {
  let value = hex.replace('#', '')
  if (value.length === 3 || value.length === 4) value = value.split('').map((char) => char + char).join('')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  if ([r, g, b].some((channel) => Number.isNaN(channel))) return hex
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`
}
