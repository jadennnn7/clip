'use client'

import { useEffect } from 'react'
import { useEditorStore, undo, redo } from '@/stores/editor-store'
import { FPS } from '@/types/editor'
import { clipOutputDuration } from '@/lib/clip-export'
import {
  copySelection,
  deleteSelection,
  duplicateSelection,
  jumpToEditPoint,
  pasteAtPlayhead,
  splitAtPlayhead,
} from '@/components/editor/actions'

/** J/K/L kennt drei Geschwindigkeitsstufen — Standard in jedem NLE. */
const SHUTTLE_RATES = [1, 2, 4] as const

interface ShortcutHandlers {
  onSeek: (seconds: number) => void
  onTogglePlay: () => void
  onSetIn: () => void
  onSetOut: () => void
  onSave?: () => void
  onAddText?: () => void
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

function zoomTimeline(direction: 'in' | 'out' | 'fit') {
  window.dispatchEvent(new CustomEvent('omegaclip:timeline-zoom', { detail: direction }))
}

export function useEditorShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      // Undo/Redo funktionieren auch im Textfeld — dort erwartet man sie.
      if (meta && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }

      if (meta && key === 's') {
        event.preventDefault()
        handlers.onSave?.()
        return
      }

      if (isTextEntryTarget(event.target)) return

      const state = useEditorStore.getState()
      const { playheadSeconds, playbackRate, isPlaying, selection } = state

      if (meta) {
        // Kopieren nur, wenn kein markierter Text gemeint ist.
        if (key === 'c' && !window.getSelection()?.toString()) {
          if (copySelection()) event.preventDefault()
          return
        }
        if (key === 'v') {
          if (pasteAtPlayhead()) event.preventDefault()
          return
        }
        if (key === 'd') {
          event.preventDefault()
          duplicateSelection()
          return
        }
        if (key === 'b' || key === 'k') {
          event.preventDefault()
          splitAtPlayhead()
          return
        }
        return
      }

      // Alt + Pfeile schiebt das gewählte Overlay im Bild.
      if (event.altKey) {
        if (selection.type !== 'overlay' || !event.key.startsWith('Arrow')) return
        const clip = state.clips.find((candidate) => candidate.id === state.activeClipId)
        const overlay = clip?.overlays?.find((candidate) => candidate.id === selection.id)
        if (!clip || !overlay || overlay.locked) return
        event.preventDefault()
        const step = event.shiftKey ? 0.02 : 0.004
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        state.updateOverlay(clip.id, overlay.id, { x: Number((overlay.x + dx).toFixed(4)), y: Number((overlay.y + dy).toFixed(4)) })
        return
      }

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

        // ↑/↓ springen von Schnittkante zu Schnittkante, wie in Premiere.
        case 'ArrowUp': {
          event.preventDefault()
          jumpToEditPoint(-1)
          return
        }

        case 'ArrowDown': {
          event.preventDefault()
          jumpToEditPoint(1)
          return
        }

        case 'Home': {
          event.preventDefault()
          handlers.onSeek(0)
          return
        }

        case 'End': {
          event.preventDefault()
          const clip = state.clips.find((candidate) => candidate.id === state.activeClipId)
          if (clip) handlers.onSeek(clipOutputDuration(clip))
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

        case 'v':
        case 'V': {
          event.preventDefault()
          state.setTool('select')
          return
        }

        case 'b':
        case 'B':
        case 'c':
        case 'C': {
          event.preventDefault()
          state.setTool(state.tool === 'blade' ? 'select' : 'blade')
          return
        }

        case 's':
        case 'S': {
          event.preventDefault()
          splitAtPlayhead()
          return
        }

        case 'n':
        case 'N': {
          event.preventDefault()
          state.setSnapping(!state.snapping)
          return
        }

        case 't':
        case 'T': {
          event.preventDefault()
          handlers.onAddText?.()
          return
        }

        case 'Backspace':
        case 'Delete': {
          event.preventDefault()
          deleteSelection()
          return
        }

        case 'Escape': {
          state.select({ type: 'video' })
          state.setTool('select')
          return
        }

        case '+':
        case '=': {
          event.preventDefault()
          zoomTimeline('in')
          return
        }

        case '-':
        case '_': {
          event.preventDefault()
          zoomTimeline('out')
          return
        }

        case '\\': {
          event.preventDefault()
          zoomTimeline('fit')
          return
        }

        default: {
          // 1–9 wählen den n-ten Clip der nach Score sortierten Liste.
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

/** Für die Shortcut-Hilfe im UI, nach Bereichen gruppiert. */
export const SHORTCUT_GROUPS: Array<{ title: string; items: Array<{ keys: string; description: string }> }> = [
  {
    title: 'Wiedergabe',
    items: [
      { keys: 'Leertaste', description: 'Abspielen / Pause' },
      { keys: 'J / K / L', description: 'Rückwärts / Stopp / Vorwärts (mehrfach = schneller)' },
      { keys: '← / →', description: 'Ein Frame zurück / vor (mit Shift: eine Sekunde)' },
      { keys: '↑ / ↓', description: 'Vorige / nächste Schnittkante' },
      { keys: 'Pos1 / Ende', description: 'Anfang / Ende des Clips' },
    ],
  },
  {
    title: 'Schnitt',
    items: [
      { keys: 'V / B', description: 'Auswahl / Klinge' },
      { keys: 'S  ·  ⌘B', description: 'Am Playhead teilen' },
      { keys: 'Entf', description: 'Auswahl löschen (Abschnitte rücken nach)' },
      { keys: 'I / O', description: 'Start- / Endpunkt des Clips setzen' },
      { keys: 'N', description: 'Einrasten an / aus' },
      { keys: '+ / − / \\', description: 'Timeline zoomen / ganzer Clip' },
    ],
  },
  {
    title: 'Elemente',
    items: [
      { keys: 'T', description: 'Text am Playhead einfügen' },
      { keys: '⌘D', description: 'Duplizieren' },
      { keys: '⌘C / ⌘V', description: 'Kopieren / am Playhead einfügen' },
      { keys: '⌥ + Pfeile', description: 'Im Bild verschieben (mit Shift: weiter)' },
      { keys: 'Esc', description: 'Auswahl aufheben' },
    ],
  },
  {
    title: 'Transkript',
    items: [
      { keys: 'X', description: 'Gewählte Wörter aus dem Video schneiden / zurückholen' },
      { keys: 'Backspace', description: 'Gewählte Wörter nur im Untertitel ausblenden' },
      { keys: 'Shift + Klick', description: 'Auswahl erweitern' },
    ],
  },
  {
    title: 'Allgemein',
    items: [
      { keys: '1 – 9', description: 'Clip nach Score auswählen' },
      { keys: '⌘Z / ⌘⇧Z', description: 'Rückgängig / Wiederholen' },
      { keys: '⌘S', description: 'Speichern' },
    ],
  },
]
