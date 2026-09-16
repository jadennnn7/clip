'use client'

import { useEffect } from 'react'
import { useEditorStore, undo, redo } from '@/stores/editor-store'
import { FPS } from '@/types/editor'

/** J/K/L kennt drei Geschwindigkeitsstufen — Standard in jedem NLE. */
const SHUTTLE_RATES = [1, 2, 4] as const

interface ShortcutHandlers {
  onSeek: (seconds: number) => void
  onTogglePlay: () => void
  onSetIn: () => void
  onSetOut: () => void
  onSave?: () => void
}

/**
 * Prüft, ob die Eingabe gerade in einem Textfeld landet.
 *
 * Ohne diesen Guard würde die Leertaste beim Korrigieren eines Untertitels den
 * Player starten, statt ein Leerzeichen zu schreiben.
 */
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function useEditorShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey

      // Undo/Redo funktionieren auch im Textfeld — dort erwartet man sie.
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }

      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault()
        handlers.onSave?.()
        return
      }

      if (isTextEntryTarget(event.target)) return
      if (meta || event.altKey) return

      const state = useEditorStore.getState()
      const { playheadSeconds, playbackRate, isPlaying } = state

      switch (event.key) {
        case ' ': {
          event.preventDefault()
          handlers.onTogglePlay()
          return
        }

        // L — vorwärts. Wiederholtes Drücken schaltet 1x → 2x → 4x hoch.
        case 'l':
        case 'L': {
          event.preventDefault()
          const currentIndex = SHUTTLE_RATES.indexOf(playbackRate as 1 | 2 | 4)
          const next =
            isPlaying && playbackRate > 0 && currentIndex >= 0
              ? SHUTTLE_RATES[Math.min(currentIndex + 1, SHUTTLE_RATES.length - 1)]
              : SHUTTLE_RATES[0]
          state.setPlaybackRate(next)
          state.setPlaying(true)
          return
        }

        // K — anhalten und Geschwindigkeit zurücksetzen.
        case 'k':
        case 'K': {
          event.preventDefault()
          state.setPlaying(false)
          state.setPlaybackRate(1)
          return
        }

        // J — rückwärts. Der Remotion Player akzeptiert negative Raten.
        case 'j':
        case 'J': {
          event.preventDefault()
          const currentIndex = SHUTTLE_RATES.indexOf(Math.abs(playbackRate) as 1 | 2 | 4)
          const next =
            isPlaying && playbackRate < 0 && currentIndex >= 0
              ? SHUTTLE_RATES[Math.min(currentIndex + 1, SHUTTLE_RATES.length - 1)]
              : SHUTTLE_RATES[0]
          state.setPlaybackRate(-next)
          state.setPlaying(true)
          return
        }

        case 'ArrowLeft': {
          event.preventDefault()
          const step = event.shiftKey ? 1 : 1 / FPS
          handlers.onSeek(Math.max(0, playheadSeconds - step))
          return
        }

        case 'ArrowRight': {
          event.preventDefault()
          const step = event.shiftKey ? 1 : 1 / FPS
          handlers.onSeek(playheadSeconds + step)
          return
        }

        case 'i':
        case 'I': {
          event.preventDefault()
          handlers.onSetIn()
          return
        }

        case 'o':
        case 'O': {
          event.preventDefault()
          handlers.onSetOut()
          return
        }

        default: {
          // 1–5 wählen den n-ten Clip der nach Score sortierten Liste.
          const digit = Number(event.key)
          if (Number.isInteger(digit) && digit >= 1 && digit <= 9) {
            const sorted = [...state.clips].sort((a, b) => b.virality_score - a.virality_score)
            const clip = sorted[digit - 1]
            if (clip) {
              event.preventDefault()
              state.setActiveClip(clip.id)
            }
          }
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handlers])
}

/** Für die Shortcut-Hilfe im UI. */
export const SHORTCUT_HELP: Array<{ keys: string; description: string }> = [
  { keys: 'Leertaste', description: 'Abspielen / Pause' },
  { keys: 'J / K / L', description: 'Rückwärts / Stopp / Vorwärts (mehrfach = schneller)' },
  { keys: '← / →', description: 'Ein Frame zurück / vor' },
  { keys: 'Shift + ← / →', description: 'Eine Sekunde zurück / vor' },
  { keys: 'I / O', description: 'Startpunkt / Endpunkt setzen' },
  { keys: '1 – 5', description: 'Clip nach Score auswählen' },
  { keys: '⌘Z / ⌘⇧Z', description: 'Rückgängig / Wiederholen' },
  { keys: '⌘S', description: 'Speichern' },
]
