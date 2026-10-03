import { FPS } from '@/types/editor'

/** `MM:SS:FF` — Minuten, Sekunden, Frames. So zählen Schnittprogramme. */
export function formatTimecode(seconds: number): string {
  const totalFrames = Math.max(0, Math.round(seconds * FPS))
  const frames = totalFrames % FPS
  const totalSeconds = Math.floor(totalFrames / FPS)
  const minutes = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`
}

/** `m:ss.s` — kompakt für Längenangaben. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const secs = safe - minutes * 60
  return minutes > 0 ? `${minutes}:${secs.toFixed(1).padStart(4, '0')}` : `${secs.toFixed(1)} s`
}
