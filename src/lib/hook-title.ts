import type { Clip, Overlay, TextOverlay } from '@/types/database'

/**
 * Der Hook-Titel: eine kurze Schlagzeile oben im Clip.
 *
 * Er sagt einem fremden Zuschauer in der ersten Sekunde, worum es geht —
 * bevor der gesprochene Einstieg überhaupt angekommen ist. Technisch ist er
 * ein gewöhnliches Text-Overlay mit `role: 'hook'`: So lässt er sich im Bild
 * verschieben, auf der Timeline kürzen und im Inspector frei gestalten, und
 * Player, Render und Editor brauchen keinen eigenen Pfad dafür.
 */

export type HookLook = 'sticker' | 'glass' | 'headline'

type LookFields = Pick<TextOverlay,
  'font' | 'fontSize' | 'fontWeight' | 'italic' | 'color' | 'align' | 'uppercase' | 'letterSpacing' | 'lineHeight' |
  'strokeColor' | 'strokeWidth' | 'shadow' | 'background' | 'backgroundOpacity' | 'padding' | 'radius' | 'maxWidth' | 'lineBox'>

/**
 * Drei Looks. `sticker` ist der Text, den TikTok selbst anbietet: jede Zeile
 * auf ihrem eigenen weißen Streifen, die Streifen greifen ineinander. Das
 * wirkt auf der Plattform nativ statt nach Werkzeug.
 */
export const HOOK_LOOKS: Record<HookLook, { label: string; fields: LookFields }> = {
  sticker: {
    label: 'Sticker',
    fields: {
      font: 'montserrat', fontSize: 56, fontWeight: 800, italic: false, color: '#0A0A0A', align: 'center', uppercase: false,
      letterSpacing: -0.01, lineHeight: 1.36, strokeColor: '#000000', strokeWidth: 0, shadow: 0,
      background: '#FFFFFF', backgroundOpacity: 1, padding: 24, radius: 16, maxWidth: 0.8, lineBox: true,
    },
  },
  glass: {
    label: 'Glas',
    fields: {
      font: 'inter', fontSize: 54, fontWeight: 800, italic: false, color: '#FFFFFF', align: 'center', uppercase: false,
      letterSpacing: -0.01, lineHeight: 1.2, strokeColor: '#000000', strokeWidth: 0, shadow: 0,
      background: '#000000', backgroundOpacity: 0.58, padding: 34, radius: 30, maxWidth: 0.82, lineBox: false,
    },
  },
  headline: {
    label: 'Schlagzeile',
    fields: {
      font: 'montserrat', fontSize: 66, fontWeight: 900, italic: false, color: '#FFFFFF', align: 'center', uppercase: true,
      letterSpacing: 0, lineHeight: 1.08, strokeColor: '#000000', strokeWidth: 11, shadow: 0.5,
      background: null, backgroundOpacity: 1, padding: 0, radius: 0, maxWidth: 0.86, lineBox: false,
    },
  },
}

export const DEFAULT_HOOK_LOOK: HookLook = 'sticker'

/** Mittelpunkt in Bildhöhe: unter der Kopfzeile der Apps, über dem Gesicht. */
export const HOOK_Y = 0.17

/**
 * Hook-Titel vorübergehend aus: Sie bleiben an den Clips gespeichert, aber
 * Vorschau und Render lassen sie weg (`buildCompositionProps`). Auf `false`
 * gesetzt, sind sie überall wieder da.
 */
export const HOOK_TITLES_PAUSED = true

export function isHookOverlay(overlay: Overlay | null | undefined): overlay is TextOverlay {
  return overlay?.kind === 'text' && overlay.role === 'hook'
}

export function hookOverlayOf(clip: Pick<Clip, 'overlays'>): TextOverlay | null {
  return clip.overlays?.find(isHookOverlay) ?? null
}

/** Welcher Look zu einem Overlay passt — für die Auswahl im Editor. */
export function hookLookOf(overlay: TextOverlay): HookLook | null {
  return (Object.keys(HOOK_LOOKS) as HookLook[]).find((look) => {
    const fields = HOOK_LOOKS[look].fields
    return fields.font === overlay.font && fields.background === overlay.background && fields.uppercase === overlay.uppercase
  }) ?? null
}

/**
 * So lange steht der Hook-Titel. Er holt den Zuschauer ab; danach deckt er
 * nur noch das Bild zu.
 */
export const HOOK_SECONDS = 5

/** Ein Hook-Titel für die ersten Sekunden des Clips. */
export function createHookOverlay(text: string, clipDuration: number, look: HookLook = DEFAULT_HOOK_LOOK, id = crypto.randomUUID()): TextOverlay {
  return {
    kind: 'text',
    role: 'hook',
    id,
    name: 'Hook-Titel',
    text,
    ...HOOK_LOOKS[look].fields,
    start: 0,
    end: Math.max(0.1, Math.round(Math.min(HOOK_SECONDS, clipDuration) * 30) / 30),
    track: 0,
    x: 0.5,
    y: HOOK_Y,
    scale: 1,
    rotation: 0,
    opacity: 1,
    animationIn: 'pop',
    animationOut: 'fade',
  }
}

const MAX_WORDS = 10
const MAX_CHARS = 60

/** Satzzeichen, die in einer Schlagzeile stören: Punkt am Ende, „??", führende „…". */
function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^(?:…|\.{2,}|-{2,}|\s)+/, '')
    .replace(/\?{2,}/g, '?')
    .replace(/!{2,}/g, '!')
    .replace(/(?:[.,;:]|\s)+$/, '')
    .trim()
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * Ein Hook-Titel ohne KI — aus Titel und gesprochenem Einstieg.
 *
 * Nur ein Startpunkt: Ohne Sprachmodell lässt sich keine echte Schlagzeile
 * formulieren, aber der stärkste kurze Satz des Einstiegs ist fast immer
 * besser als nichts. Bevorzugt werden Fragen und Sätze mit Zahlen. Die
 * KI-Vorschläge im Editor ersetzen ihn mit einem Klick.
 */
export function draftHookTitle(source: Pick<Clip, 'title' | 'hook_text'>): string {
  const title = tidy(source.title ?? '')
  const hook = tidy(source.hook_text ?? '')
  // Die regelbasierte Auswahl kürzt den Titel mit „…" — dann ist der
  // gesprochene Einstieg vollständiger.
  const base = !title || (/…$/.test(source.title.trim()) && hook) ? hook : title
  if (!base) return ''
  if (wordCount(base) <= 8 && base.length <= MAX_CHARS) return capitalize(base)

  const sentences = (base.match(/[^.!?…]+[.!?…]*/g) ?? [base]).map(tidy).filter(Boolean)
  const scored = sentences.map((sentence, index) => {
    const words = wordCount(sentence)
    let score = 0
    if (words >= 3 && words <= MAX_WORDS) score += 2
    if (/\?\s*$/.test(sentence)) score += 1
    if (/\d/.test(sentence)) score += 1
    if (words < 3) score -= 2
    return { sentence, score, index }
  }).sort((a, b) => b.score - a.score || a.index - b.index)
  let best = scored[0]?.sentence ?? base

  if (best.length > MAX_CHARS) {
    const cut = best.slice(0, MAX_CHARS - 1)
    best = `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 20)).replace(/[\s,;:–-]+$/, '')}…`
  }
  return capitalize(best)
}
