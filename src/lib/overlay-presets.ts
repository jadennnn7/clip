import type {
  EmojiOverlay,
  Overlay,
  ProgressOverlay,
  ShapeOverlay,
  TextOverlay,
  VideoSettings,
} from '@/types/database'
import type { FontKey } from '../../remotion/fonts'

/**
 * Vorlagen für alles, was man im Editor ins Bild legen kann.
 *
 * Eine Vorlage ist nur ein Startpunkt: Jedes Feld lässt sich danach im
 * Inspector ändern. Die Farben hier sind Inhalt — sie landen im Video,
 * nicht in der Oberfläche —, deshalb dürfen sie bunt sein.
 */

type Placement = Pick<Overlay, 'id' | 'start' | 'end' | 'track'>
type TextTemplate = Omit<TextOverlay, keyof Placement>
type ShapeTemplate = Omit<ShapeOverlay, keyof Placement>
type EmojiTemplate = Omit<EmojiOverlay, keyof Placement>
type ProgressTemplate = Omit<ProgressOverlay, keyof Placement>

const TEXT_BASE: TextTemplate = {
  kind: 'text',
  name: 'Text',
  text: 'Text',
  font: 'inter',
  fontSize: 72,
  fontWeight: 800,
  italic: false,
  color: '#FFFFFF',
  align: 'center',
  uppercase: false,
  letterSpacing: 0,
  lineHeight: 1.15,
  strokeColor: '#000000',
  strokeWidth: 0,
  shadow: 0.5,
  background: null,
  backgroundOpacity: 1,
  padding: 0,
  radius: 0,
  maxWidth: 0.86,
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  opacity: 1,
  animationIn: 'fade',
  animationOut: 'fade',
}

export interface TextPreset {
  id: string
  label: string
  template: TextTemplate
}

function text(id: string, label: string, patch: Partial<TextTemplate> & { font: FontKey }): TextPreset {
  return { id, label, template: { ...TEXT_BASE, name: label, ...patch } }
}

export const TEXT_PRESETS: TextPreset[] = [
  text('headline', 'Schlagzeile', { text: 'Deine Schlagzeile', font: 'montserrat', fontWeight: 900, fontSize: 96, uppercase: true, strokeWidth: 12, shadow: 0.4, lineHeight: 1.05, y: 0.2, animationIn: 'pop' }),
  text('boxed', 'Titel mit Box', { text: 'Das musst du wissen', font: 'inter', fontWeight: 800, fontSize: 62, color: '#0A0A0A', background: '#FFFFFF', padding: 30, radius: 22, shadow: 0, y: 0.18, animationIn: 'slide-up' }),
  text('body', 'Fließtext', { text: 'Hier steht dein Text', font: 'inter', fontWeight: 600, fontSize: 52, shadow: 0.8, lineHeight: 1.25 }),
  text('lower-third', 'Bauchbinde', { text: 'Max Mustermann\nGründer', font: 'inter', fontWeight: 700, fontSize: 44, align: 'left', background: '#000000', backgroundOpacity: 0.72, padding: 28, radius: 14, shadow: 0, maxWidth: 0.7, x: 0.34, y: 0.8, animationIn: 'slide-right' }),
  text('cta', 'Call to Action', { text: 'Folge für Teil 2 👉', font: 'poppins', fontWeight: 800, fontSize: 52, color: '#0A0A0A', background: '#FFFFFF', padding: 32, radius: 999, shadow: 0, y: 0.86, animationIn: 'pop' }),
  text('quote', 'Zitat', { text: '„Konstanz schlägt Talent.“', font: 'playfairDisplay', fontWeight: 700, italic: true, fontSize: 68, shadow: 0.9, lineHeight: 1.2, y: 0.4, animationIn: 'blur' }),
  text('label', 'Label', { text: 'Neu', font: 'spaceGrotesk', fontWeight: 700, fontSize: 34, uppercase: true, letterSpacing: 0.14, background: '#000000', backgroundOpacity: 0.55, padding: 22, radius: 999, shadow: 0, y: 0.08 }),
  text('marker', 'Handschrift', { text: 'wow!', font: 'permanentMarker', fontWeight: 400, fontSize: 88, rotation: -6, y: 0.3, animationIn: 'pop' }),
  text('impact', 'Impact', { text: 'Warte …', font: 'anton', fontWeight: 400, fontSize: 150, uppercase: true, shadow: 0.7, lineHeight: 1, y: 0.38, animationIn: 'zoom' }),
  text('typewriter', 'Schreibmaschine', { text: 'Tag 1 von 100', font: 'robotoMono', fontWeight: 600, fontSize: 46, background: '#000000', backgroundOpacity: 0.8, padding: 24, radius: 8, shadow: 0, y: 0.14, animationIn: 'typewriter' }),
  text('comic', 'Comic', { text: 'Boom!', font: 'bangers', fontWeight: 400, fontSize: 130, uppercase: true, color: '#FFE81F', strokeWidth: 14, rotation: -4, shadow: 0.3, y: 0.3, animationIn: 'pop' }),
  text('serif', 'Magazin', { text: 'Die Geschichte dahinter', font: 'dmSerifDisplay', fontWeight: 400, fontSize: 74, shadow: 0.6, lineHeight: 1.08, y: 0.24, animationIn: 'slide-up' }),
]

// --- Formen -----------------------------------------------------------------

const SHAPE_BASE: ShapeTemplate = {
  kind: 'shape',
  name: 'Form',
  shape: 'rect',
  width: 600,
  height: 320,
  fill: '#FFFFFF',
  fillOpacity: 1,
  stroke: '#FFFFFF',
  strokeWidth: 0,
  radius: 0,
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  opacity: 1,
  animationIn: 'fade',
  animationOut: 'fade',
}

export interface ShapePreset {
  id: string
  label: string
  template: ShapeTemplate
}

function shape(id: string, label: string, patch: Partial<ShapeTemplate>): ShapePreset {
  return { id, label, template: { ...SHAPE_BASE, name: label, ...patch } }
}

export const SHAPE_PRESETS: ShapePreset[] = [
  shape('band', 'Balken', { shape: 'rect', width: 1080, height: 190, fill: '#000000', fillOpacity: 0.6, y: 0.8 }),
  shape('card', 'Karte', { shape: 'rect', width: 760, height: 440, radius: 40, fill: '#FFFFFF' }),
  shape('frame', 'Rahmen', { shape: 'rect', width: 760, height: 440, radius: 28, fill: null, strokeWidth: 10 }),
  shape('circle', 'Kreis', { shape: 'ellipse', width: 300, height: 300 }),
  shape('ring', 'Markierung', { shape: 'ellipse', width: 320, height: 320, fill: null, strokeWidth: 12, animationIn: 'pop' }),
  shape('line', 'Linie', { shape: 'line', width: 600, height: 10, radius: 5 }),
  shape('arrow', 'Pfeil', { shape: 'arrow', width: 360, height: 150, animationIn: 'slide-right' }),
  shape('dim', 'Abdunkeln', { shape: 'rect', width: 1920, height: 1920, fill: '#000000', fillOpacity: 0.45, animationIn: 'fade' }),
]

// --- Emojis und Fortschritt -------------------------------------------------

export const EMOJIS = [
  '🔥', '😂', '🤯', '😱', '😍', '🥹', '👀', '💯',
  '✅', '❌', '⚠️', '💡', '🚀', '💰', '📈', '📉',
  '🎯', '⭐', '❤️', '👍', '👎', '👉', '👇', '👆',
  '🙌', '👏', '💪', '🧠', '⏰', '🎉', '🤔', '😎',
  '😭', '🙏', '💥', '✨', '🏆', '📌', '🔔', '🤫',
]

const EMOJI_BASE: EmojiTemplate = {
  kind: 'emoji',
  name: 'Emoji',
  emoji: '🔥',
  size: 200,
  x: 0.5,
  y: 0.34,
  scale: 1,
  rotation: 0,
  opacity: 1,
  animationIn: 'pop',
  animationOut: 'fade',
}

const PROGRESS_BASE: ProgressTemplate = {
  kind: 'progress',
  name: 'Fortschritt',
  position: 'bottom',
  thickness: 14,
  color: '#FFFFFF',
  trackColor: '#000000',
  trackOpacity: 0.35,
  x: 0.5,
  y: 1,
  scale: 1,
  rotation: 0,
  opacity: 1,
  animationIn: 'none',
  animationOut: 'none',
}

// --- Erzeugen ---------------------------------------------------------------

/** Standarddauer eines neuen Elements. */
const DEFAULT_SECONDS = 3

/** Platziert eine Vorlage am Playhead — gekürzt, wenn der Clip vorher endet. */
function placement(at: number, clipDuration: number, seconds = DEFAULT_SECONDS): Omit<Placement, 'track'> {
  const start = Math.max(0, Math.min(at, Math.max(0, clipDuration - 0.5)))
  return { id: crypto.randomUUID(), start, end: Math.max(start + 0.5, Math.min(clipDuration, start + seconds)) }
}

export function createText(preset: TextPreset, at: number, clipDuration: number): TextOverlay {
  return { ...preset.template, ...placement(at, clipDuration), track: 0 }
}

export function createShape(preset: ShapePreset, at: number, clipDuration: number): ShapeOverlay {
  return { ...preset.template, ...placement(at, clipDuration), track: 0 }
}

export function createEmoji(emoji: string, at: number, clipDuration: number): EmojiOverlay {
  return { ...EMOJI_BASE, emoji, name: emoji, ...placement(at, clipDuration, 2), track: 0 }
}

/** Der Fortschrittsbalken läuft immer über den ganzen Clip. */
export function createProgress(clipDuration: number, position: 'top' | 'bottom' = 'bottom'): ProgressOverlay {
  return { ...PROGRESS_BASE, position, id: crypto.randomUUID(), start: 0, end: clipDuration, track: 0 }
}

// --- Looks ------------------------------------------------------------------

type LookSettings = Pick<VideoSettings, 'brightness' | 'contrast' | 'saturation' | 'warmth' | 'vignette'>

export interface Look {
  id: string
  label: string
  settings: LookSettings
}

export const LOOKS: Look[] = [
  { id: 'original', label: 'Original', settings: { brightness: 1, contrast: 1, saturation: 1, warmth: 0, vignette: 0 } },
  { id: 'vivid', label: 'Lebendig', settings: { brightness: 1.03, contrast: 1.12, saturation: 1.38, warmth: 0, vignette: 0.1 } },
  { id: 'punch', label: 'Kontrast', settings: { brightness: 1, contrast: 1.3, saturation: 1.08, warmth: 0, vignette: 0.2 } },
  { id: 'cinema', label: 'Kino', settings: { brightness: 0.96, contrast: 1.18, saturation: 0.9, warmth: 0.12, vignette: 0.45 } },
  { id: 'warm', label: 'Warm', settings: { brightness: 1.02, contrast: 1.05, saturation: 1.12, warmth: 0.45, vignette: 0.15 } },
  { id: 'matte', label: 'Matt', settings: { brightness: 1.06, contrast: 0.86, saturation: 0.88, warmth: 0.05, vignette: 0 } },
  { id: 'faded', label: 'Verblasst', settings: { brightness: 1.1, contrast: 0.78, saturation: 0.7, warmth: 0.1, vignette: 0 } },
  { id: 'vintage', label: 'Vintage', settings: { brightness: 1.05, contrast: 0.9, saturation: 0.8, warmth: 0.7, vignette: 0.4 } },
  { id: 'bw', label: 'S/W', settings: { brightness: 1, contrast: 1.15, saturation: 0, warmth: 0, vignette: 0.15 } },
  { id: 'noir', label: 'Noir', settings: { brightness: 0.92, contrast: 1.5, saturation: 0, warmth: 0, vignette: 0.55 } },
]
