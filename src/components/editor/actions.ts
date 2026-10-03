'use client'

import { toast } from 'sonner'
import { clipOutputDuration, clipSegments } from '@/lib/clip-export'
import { clipboardOverlay, copyOverlay, useEditorStore } from '@/stores/editor-store'

/**
 * Bearbeitungsbefehle, die Werkzeugleiste, Kontextmenü und Tastenkürzel
 * teilen. Sie wirken auf die aktuelle Auswahl — wie in jedem
 * Schnittprogramm: Teilen trifft das gewählte Element, ohne Auswahl die
 * Videospur.
 */

function active() {
  const state = useEditorStore.getState()
  const clip = state.clips.find((candidate) => candidate.id === state.activeClipId) ?? null
  return { state, clip }
}

export function splitAtPlayhead() {
  const { state, clip } = active()
  if (!clip) return
  const { selection, playheadSeconds } = state
  if (selection.type === 'overlay') {
    if (!state.splitOverlay(clip.id, selection.id, playheadSeconds)) {
      toast('Hier lässt sich das Element nicht teilen', { description: 'Der Playhead muss innerhalb des Elements liegen, mit etwas Abstand zu den Rändern.' })
    }
    return
  }
  if (!state.splitVideo(clip.id, playheadSeconds)) {
    toast('Hier lässt sich nicht teilen', { description: 'Zu nah an einem Schnitt oder am Rand des Clips.' })
  }
}

export function deleteSelection() {
  const { state, clip } = active()
  if (!clip) return
  const { selection } = state
  if (selection.type === 'overlay') {
    state.removeOverlay(clip.id, selection.id)
    return
  }
  if (selection.type === 'segment') {
    if (clipSegments(clip).length <= 1) {
      toast('Der letzte Abschnitt bleibt', { description: 'Kürze den Clip stattdessen an den Rändern.' })
      return
    }
    state.deleteSegment(clip.id, selection.index)
    return
  }
  if (selection.type === 'captions') {
    state.setCaptionStyle(clip.id, { enabled: false })
    toast('Untertitel ausgeblendet', { description: 'Einblenden über das Auge in der Untertitelspur.' })
  }
}

export function duplicateSelection() {
  const { state, clip } = active()
  if (!clip || state.selection.type !== 'overlay') return
  state.duplicateOverlay(clip.id, state.selection.id)
}

export function copySelection(): boolean {
  const { state, clip } = active()
  if (!clip || state.selection.type !== 'overlay') return false
  const id = state.selection.id
  const overlay = clip.overlays?.find((candidate) => candidate.id === id)
  if (!overlay) return false
  copyOverlay(overlay)
  return true
}

export function pasteAtPlayhead(): boolean {
  const { state, clip } = active()
  const overlay = clipboardOverlay()
  if (!clip || !overlay) return false
  state.pasteOverlay(clip.id, overlay)
  return true
}

/** Sprungziele für ↑/↓: Anfang, Ende, jede Schnittkante, jede Overlay-Kante. */
export function editPoints(): number[] {
  const { clip } = active()
  if (!clip) return [0]
  const points = new Set<number>([0, clipOutputDuration(clip)])
  let output = 0
  for (const segment of clipSegments(clip)) {
    points.add(Number(output.toFixed(4)))
    output += segment.end - segment.start
  }
  for (const overlay of clip.overlays ?? []) {
    points.add(Number(overlay.start.toFixed(4)))
    points.add(Number(overlay.end.toFixed(4)))
  }
  return [...points].sort((a, b) => a - b)
}

export function jumpToEditPoint(direction: 1 | -1) {
  const { state } = active()
  const current = state.playheadSeconds
  const points = editPoints()
  const target = direction > 0
    ? points.find((point) => point > current + 1e-3)
    : [...points].reverse().find((point) => point < current - 1e-3)
  if (target !== undefined) state.setPlayhead(target)
}
