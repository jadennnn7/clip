import { interpolate, Easing } from 'remotion'
import type { CropKeyframe } from '@/types/database'

export interface CropTransform {
  /** Breite/Höhe, in der das Quellvideo gezeichnet wird (Pixel im Output-Raum). */
  displayWidth: number
  displayHeight: number
  /** Position der linken oberen Ecke des Videos im Output-Frame. */
  left: number
  top: number
}

/**
 * Berechnet den sichtbaren Ausschnitt für einen Frame (16:9 → 9:16 Reframing).
 *
 * Das Quellvideo wird so skaliert, dass seine Höhe die Ausgabehöhe füllt; dabei
 * ragt es links und rechts über den 9:16-Rahmen hinaus. Der Keyframe-Punkt
 * (x, y) — normalisiert auf 0..1 der Quelle — wird in die Bildmitte geschoben.
 * So entsteht die Kamerafahrt, die dem aktiven Sprecher folgt.
 *
 * Die Position wird am Ende geklemmt, damit nie ein schwarzer Rand entsteht:
 * lieber folgt der Ausschnitt dem Sprecher etwas ungenauer, als dass das Bild
 * am Rand ausläuft.
 */
export function getCropTransform({
  frame,
  keyframes,
  sourceWidth,
  sourceHeight,
  compositionWidth,
  compositionHeight,
}: {
  frame: number
  keyframes: CropKeyframe[]
  sourceWidth: number
  sourceHeight: number
  compositionWidth: number
  compositionHeight: number
}): CropTransform {
  const { x, y, scale } = interpolateKeyframes(frame, keyframes)

  const displayHeight = compositionHeight * scale
  const displayWidth = displayHeight * (sourceWidth / sourceHeight)

  const rawLeft = compositionWidth / 2 - x * displayWidth
  const rawTop = compositionHeight / 2 - y * displayHeight

  return {
    displayWidth,
    displayHeight,
    left: clamp(rawLeft, compositionWidth - displayWidth, 0),
    top: clamp(rawTop, compositionHeight - displayHeight, 0),
  }
}

const NEUTRAL: Omit<CropKeyframe, 'frame'> = { x: 0.5, y: 0.5, scale: 1 }

/**
 * Interpoliert zwischen den Keyframes der Active-Speaker-Erkennung.
 *
 * `ease` glättet die Übergänge — ohne die Kurve würde die Kamera an jedem
 * Keyframe sichtbar ruckeln, weil lineare Segmente an den Stützstellen
 * Richtungssprünge haben.
 */
function interpolateKeyframes(
  frame: number,
  keyframes: CropKeyframe[],
): Omit<CropKeyframe, 'frame'> {
  if (keyframes.length === 0) return NEUTRAL
  if (keyframes.length === 1) {
    const { x, y, scale } = keyframes[0]
    return { x, y, scale }
  }

  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame)
  const frames = sorted.map((k) => k.frame)

  // interpolate() verlangt streng monotone Eingaben. Doppelte Frames würden
  // zur Laufzeit werfen, deshalb hier herausfiltern statt zu vertrauen.
  const unique: CropKeyframe[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || frames[i] > frames[i - 1]) unique.push(sorted[i])
  }
  if (unique.length < 2) {
    const { x, y, scale } = unique[0] ?? NEUTRAL
    return { x, y, scale }
  }

  const input = unique.map((k) => k.frame)
  const options = {
    extrapolateLeft: 'clamp' as const,
    extrapolateRight: 'clamp' as const,
    easing: Easing.bezier(0.42, 0, 0.58, 1),
  }

  return {
    x: interpolate(frame, input, unique.map((k) => k.x), options),
    y: interpolate(frame, input, unique.map((k) => k.y), options),
    scale: interpolate(frame, input, unique.map((k) => k.scale), options),
  }
}

function clamp(value: number, min: number, max: number) {
  // min kann größer als max sein, wenn das Video kleiner als der Rahmen ist.
  if (min > max) return (min + max) / 2
  return Math.min(Math.max(value, min), max)
}
