import { loadFont as loadInter } from '@remotion/google-fonts/Inter'
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat'
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins'
import { loadFont as loadSpaceGrotesk } from '@remotion/google-fonts/SpaceGrotesk'
import { loadFont as loadAnton } from '@remotion/google-fonts/Anton'
import { loadFont as loadBebasNeue } from '@remotion/google-fonts/BebasNeue'
import { loadFont as loadOswald } from '@remotion/google-fonts/Oswald'
import { loadFont as loadArchivoBlack } from '@remotion/google-fonts/ArchivoBlack'
import { loadFont as loadBangers } from '@remotion/google-fonts/Bangers'
import { loadFont as loadPlayfairDisplay } from '@remotion/google-fonts/PlayfairDisplay'
import { loadFont as loadDMSerifDisplay } from '@remotion/google-fonts/DMSerifDisplay'
import { loadFont as loadPermanentMarker } from '@remotion/google-fonts/PermanentMarker'
import { loadFont as loadCaveat } from '@remotion/google-fonts/Caveat'
import { loadFont as loadRobotoMono } from '@remotion/google-fonts/RobotoMono'
import { loadFont as loadNotoColorEmoji } from '@remotion/google-fonts/NotoColorEmoji'

/**
 * Die Schriften für Untertitel und Text-Overlays.
 *
 * Geladen wird über `@remotion/google-fonts`, nicht über das CSS der Seite:
 * Im Render-Chrome gibt es keine Browser-Schriften, und `loadFont` hält jeden
 * Frame an, bis die Datei da ist. Vorschau und MP4 zeigen so dieselben
 * Buchstaben.
 *
 * Geladen wird erst, wenn eine Schrift tatsächlich benutzt wird — und nur die
 * Stärken, die es von ihr gibt. Eine Stärke, die fehlt, würde der Browser
 * künstlich fetten; das sieht bei Anton oder Bebas sofort kaputt aus.
 */

type Loader = (style?: string, options?: { weights?: string[]; subsets?: string[] }) => unknown

export type FontCategory = 'sans' | 'display' | 'serif' | 'hand' | 'mono'

export interface FontDefinition {
  label: string
  family: string
  category: FontCategory
  weights: number[]
  italic: boolean
  /** Fehlt = latin und latin-ext. */
  subsets?: string[]
  load: Loader
}

export const FONTS = {
  inter: { label: 'Inter', family: 'Inter', category: 'sans', weights: [400, 500, 600, 700, 800, 900], italic: true, load: loadInter as Loader },
  montserrat: { label: 'Montserrat', family: 'Montserrat', category: 'sans', weights: [400, 600, 700, 800, 900], italic: true, load: loadMontserrat as Loader },
  poppins: { label: 'Poppins', family: 'Poppins', category: 'sans', weights: [400, 500, 600, 700, 800, 900], italic: true, load: loadPoppins as Loader },
  spaceGrotesk: { label: 'Space Grotesk', family: 'Space Grotesk', category: 'sans', weights: [400, 500, 600, 700], italic: false, load: loadSpaceGrotesk as Loader },
  anton: { label: 'Anton', family: 'Anton', category: 'display', weights: [400], italic: false, load: loadAnton as Loader },
  bebasNeue: { label: 'Bebas Neue', family: 'Bebas Neue', category: 'display', weights: [400], italic: false, load: loadBebasNeue as Loader },
  oswald: { label: 'Oswald', family: 'Oswald', category: 'display', weights: [400, 500, 600, 700], italic: false, load: loadOswald as Loader },
  archivoBlack: { label: 'Archivo Black', family: 'Archivo Black', category: 'display', weights: [400], italic: false, load: loadArchivoBlack as Loader },
  bangers: { label: 'Bangers', family: 'Bangers', category: 'display', weights: [400], italic: false, load: loadBangers as Loader },
  playfairDisplay: { label: 'Playfair Display', family: 'Playfair Display', category: 'serif', weights: [400, 600, 700, 800, 900], italic: true, load: loadPlayfairDisplay as Loader },
  dmSerifDisplay: { label: 'DM Serif Display', family: 'DM Serif Display', category: 'serif', weights: [400], italic: true, load: loadDMSerifDisplay as Loader },
  permanentMarker: { label: 'Permanent Marker', family: 'Permanent Marker', category: 'hand', weights: [400], italic: false, subsets: ['latin'], load: loadPermanentMarker as Loader },
  caveat: { label: 'Caveat', family: 'Caveat', category: 'hand', weights: [400, 500, 600, 700], italic: false, load: loadCaveat as Loader },
  robotoMono: { label: 'Roboto Mono', family: 'Roboto Mono', category: 'mono', weights: [400, 500, 600, 700], italic: true, load: loadRobotoMono as Loader },
} satisfies Record<string, FontDefinition>

export type FontKey = keyof typeof FONTS

export const FONT_KEYS = Object.keys(FONTS) as FontKey[]

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: 'Serifenlos',
  display: 'Plakativ',
  serif: 'Serif',
  hand: 'Handschrift',
  mono: 'Monospace',
}

export const DEFAULT_FONT: FontKey = 'inter'

export function isFontKey(value: unknown): value is FontKey {
  return typeof value === 'string' && value in FONTS
}

export function fontDefinition(key: string): FontDefinition {
  return isFontKey(key) ? FONTS[key] : FONTS[DEFAULT_FONT]
}

/**
 * CSS-Wert für `font-family`, mit sinnvollem Rückfall je Kategorie.
 *
 * Die Emoji-Schrift steht vor den generischen Familien: Der Browser sucht
 * fehlende Zeichen der Reihe nach, und `system-ui` hätte im Linux-Renderer
 * kein Emoji — der Text zeigte dort leere Kästen.
 */
export function fontStack(key: string): string {
  const font = fontDefinition(key)
  const fallback = font.category === 'serif' ? 'Georgia, serif' : font.category === 'mono' ? 'ui-monospace, monospace' : 'system-ui, sans-serif'
  return `"${font.family}", "Noto Color Emoji", ${fallback}`
}

const EMOJI_PATTERN = /\p{Extended_Pictographic}/u

export function containsEmoji(text: string): boolean {
  return EMOJI_PATTERN.test(text)
}

/**
 * Welche Schrift in einem gespeicherten `font-family`-Wert steckt.
 * Untertitel speichern seit jeher den CSS-Wert, nicht den Schlüssel.
 */
export function fontKeyFromCss(css: string | undefined): FontKey | null {
  if (!css) return null
  const first = css.split(',')[0]?.replace(/["']/g, '').trim().toLowerCase()
  return FONT_KEYS.find((key) => FONTS[key].family.toLowerCase() === first) ?? null
}

/** Die vorhandene Stärke, die der gewünschten am nächsten liegt. */
export function resolveWeight(key: string, requested: number): number {
  const { weights } = fontDefinition(key)
  return weights.reduce((best, weight) => (Math.abs(weight - requested) < Math.abs(best - requested) ? weight : best), weights[0])
}

export function heaviestWeight(key: string): number {
  const { weights } = fontDefinition(key)
  return weights[weights.length - 1]
}

const requested = new Set<string>()

/**
 * Lädt Schnitt und Stärke einer Schrift, einmal pro Sitzung.
 *
 * Darf im Render aufgerufen werden: `loadFont` merkt sich jede Datei selbst,
 * und der Satz hier verhindert, dass React bei jedem Frame erneut nachfragt.
 */
export function ensureFont(key: string, weight: number, italic = false): void {
  const font = fontDefinition(key)
  const resolved = resolveWeight(key, weight)
  const style = italic && font.italic ? 'italic' : 'normal'
  const id = `${font.family}:${style}:${resolved}`
  if (requested.has(id)) return
  requested.add(id)
  try {
    font.load(style, { weights: [String(resolved)], subsets: font.subsets ?? ['latin', 'latin-ext'] })
  } catch {
    // Ohne Datei bleibt der Rückfall aus `fontStack` — lieber das als ein Absturz.
    requested.delete(id)
  }
}

let emojiRequested = false

/**
 * Farbige Emojis kommen aus Noto Color Emoji statt aus dem System: Der
 * Linux-Renderer hat keine Emoji-Schrift und zeichnete sonst leere Kästen.
 */
export function ensureEmojiFont(): void {
  if (emojiRequested) return
  emojiRequested = true
  try {
    loadNotoColorEmoji('normal', { weights: ['400'] })
  } catch {
    emojiRequested = false
  }
}

export const EMOJI_FONT_STACK = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
