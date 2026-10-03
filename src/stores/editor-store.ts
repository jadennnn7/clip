'use client'

import { create } from 'zustand'
import { temporal } from 'zundo'
import { useStore } from 'zustand'
import type { CaptionStyle, Clip, ClipSegment, Overlay, TranscriptWord, VideoSettings } from '@/types/database'
import { CAPTION_PRESETS } from '../../remotion/captions/presets'
import { resolveVideoSettings } from '../../remotion/overlays/defaults'
import {
  clipOutputDuration,
  clipSegments,
  clipWindowDuration,
  normalizeSegments,
  outputToSource,
  snapToFrame,
  trimClip,
} from '@/lib/clip-export'
import {
  cutSegmentRange,
  findFillers,
  findPauses,
  keepOverlaysToEnd,
  remapOutputTime,
  remapOverlayTimes,
  removeSegment,
  restoreSegmentRange,
  setSegmentEdge,
  splitSegmentsAt,
} from '@/lib/segment-edit'

/** Die Teilmenge des States, die in der Undo-Historie landet. */
interface HistoryState {
  clips: Clip[]
  /** Indizes der ausgeblendeten Untertitelwörter; Audio bleibt erhalten. */
  removedWords: Record<string, number[]>
}

/** Was gerade im Inspector steht. */
export type EditorSelection =
  | { type: 'video' }
  | { type: 'segment'; index: number }
  | { type: 'captions' }
  | { type: 'overlay'; id: string }

/** Auswahl oder Klinge — wie in jedem Schnittprogramm. */
export type EditorTool = 'select' | 'blade'

/** Die Reiter der Bibliothek links. */
export type LibraryTab = 'clips' | 'transcript' | 'text' | 'elements' | 'captions' | 'effects'

type OverlayPatch = Partial<Omit<Overlay, 'id' | 'kind'>> & Record<string, unknown>

interface EditorState extends HistoryState {
  // --- Flüchtiger State: bewusst NICHT in der Historie ----------------------
  // Würde die Playhead-Position mitgeschrieben, wäre jedes Cmd+Z ein
  // Cursor-Sprung statt einer echten Rücknahme.
  activeClipId: string | null
  /** Position auf der AUSGABE-Zeitachse, also nach allen Schnitten. */
  playheadSeconds: number
  isPlaying: boolean
  playbackRate: number
  sourceDuration: number
  selection: EditorSelection
  tool: EditorTool
  snapping: boolean
  loop: boolean
  previewMuted: boolean
  libraryTab: LibraryTab

  // --- Aktionen ------------------------------------------------------------
  initialize: (clips: Clip[], removedWords?: Record<string, number[]>, activeClipId?: string, sourceDuration?: number) => void
  duplicateClip: (clipId: string) => string | null
  deleteClip: (clipId: string) => void
  setActiveClip: (clipId: string) => void
  setPlayhead: (seconds: number) => void
  setPlaying: (playing: boolean) => void
  setPlaybackRate: (rate: number) => void
  select: (selection: EditorSelection) => void
  setTool: (tool: EditorTool) => void
  setSnapping: (snapping: boolean) => void
  setLoop: (loop: boolean) => void
  setPreviewMuted: (muted: boolean) => void
  setLibraryTab: (tab: LibraryTab) => void

  updateClip: (clipId: string, patch: Partial<Clip>) => void
  /** Titel, Beschreibung, Hashtags — ändern das Video nicht, also kein neuer Render nötig. */
  updateClipMeta: (clipId: string, patch: Partial<Pick<Clip, 'title' | 'description' | 'hashtags'>>) => void
  /** Render-Zustand setzen, ohne ihn zurückzusetzen und ohne Undo-Eintrag. */
  setRenderState: (clipId: string, patch: Partial<Pick<Clip, 'render_status' | 'render_job_id' | 'render_key' | 'render_error'>>) => void
  setTrim: (clipId: string, start: number, end: number) => void
  setCaptionStyle: (clipId: string, patch: Partial<CaptionStyle>) => void
  applyCaptionPreset: (clipId: string, preset: CaptionStyle['preset']) => void
  toggleWordRemoved: (clipId: string, wordIndex: number) => void
  setWordsRemoved: (clipId: string, wordIndices: number[], removed: boolean) => void
  updateWordText: (clipId: string, wordIndex: number, text: string) => void
  setVideoSettings: (clipId: string, patch: Partial<VideoSettings>) => void

  // --- Schnitt ---------------------------------------------------------------
  /** Teilt das Video am Ausgabezeitpunkt. */
  splitVideo: (clipId: string, outputSeconds: number) => boolean
  /** Entfernt einen Abschnitt; alles dahinter rückt nach. */
  deleteSegment: (clipId: string, index: number) => void
  /** Verschiebt eine Kante eines Abschnitts. Außenkanten verschieben das Clip-Fenster. */
  trimSegment: (clipId: string, index: number, edge: 'start' | 'end', sourceSeconds: number) => void
  /** Quellbereiche (Sekunden ab Clip-Start) herausschneiden bzw. zurückholen. */
  cutRanges: (clipId: string, ranges: Array<[number, number]>) => void
  restoreRange: (clipId: string, from: number, to: number) => void
  resetCuts: (clipId: string) => void
  removePauses: (clipId: string, minimumGap: number) => { count: number; seconds: number }
  removeFillers: (clipId: string) => { count: number; seconds: number }

  // --- Overlays --------------------------------------------------------------
  addOverlay: (clipId: string, overlay: Overlay) => void
  updateOverlay: (clipId: string, overlayId: string, patch: OverlayPatch) => void
  /** Verschieben in Zeit und Spur; eine belegte Spur weicht nach oben aus. */
  placeOverlay: (clipId: string, overlayId: string, placement: { start: number; end: number; track: number }) => void
  /** Leere Spuren entfernen — nach dem Loslassen, nicht während des Ziehens. */
  compactTracks: (clipId: string) => void
  removeOverlay: (clipId: string, overlayId: string) => void
  duplicateOverlay: (clipId: string, overlayId: string) => string | null
  splitOverlay: (clipId: string, overlayId: string, outputSeconds: number) => boolean
  moveOverlayLayer: (clipId: string, overlayId: string, direction: 'up' | 'down') => void
  pasteOverlay: (clipId: string, overlay: Overlay) => string
}

/**
 * Strukturvergleich der undo-fähigen Teilmenge.
 *
 * Ohne diesen Vergleich schreibt zundo bei JEDEM setState einen Historieneintrag
 * — auch bei reinen Playhead-Updates, die 30-mal pro Sekunde passieren. Das
 * erste Cmd+Z würde dann scheinbar nichts tun, weil es nur einen identischen
 * Zustand wiederherstellt.
 *
 * Da alle Updates unten immutabel sind, behalten unveränderte Clips ihre
 * Referenz. Ein Referenzvergleich über maximal eine Handvoll Clips genügt also
 * und ist um Größenordnungen billiger als ein Deep-Compare.
 */
function historyEqual(a: HistoryState, b: HistoryState): boolean {
  if (a.removedWords !== b.removedWords) return false
  if (a.clips === b.clips) return true
  if (a.clips.length !== b.clips.length) return false
  for (let i = 0; i < a.clips.length; i++) {
    if (a.clips[i] !== b.clips[i]) return false
  }
  return true
}

/**
 * Erzwingt, dass ein noch ausstehender (debouncter) Historieneintrag sofort
 * geschrieben wird. Wird vor jedem Undo aufgerufen — sonst würde ein Cmd+Z
 * unmittelbar nach einer Texteingabe den Eintrag überspringen und einen Schritt
 * zu weit zurückgehen.
 */
let flushPendingHistory: (() => void) | null = null
export function flushHistory() {
  flushPendingHistory?.()
}

const HISTORY_DEBOUNCE_MS = 400

/**
 * Startposition beim Öffnen eines Clips.
 *
 * Nicht 0: Die Untertitel blenden über etwa 0,4 s ein, bei Frame 0 sind sie
 * also unsichtbar. Das Styling-Panel verspricht aber eine Live-Vorschau — der
 * Nutzer muss beim Öffnen sehen, was er verändert, ohne erst abspielen zu
 * müssen. Der erste Frame eines Clips ist ohnehin selten der aussagekräftigste.
 */
const PREVIEW_START_SECONDS = 0.8

function previewStart(clip: Clip | undefined): number {
  if (!clip) return 0
  return Math.min(PREVIEW_START_SECONDS, clipOutputDuration(clip) / 2)
}

const FRAME = 1 / 30
const MIN_OVERLAY_SECONDS = 0.1
const VIDEO: EditorSelection = { type: 'video' }

/** Jede inhaltliche Änderung macht einen fertigen Render ungültig. */
function edited(clip: Clip, patch: Partial<Clip>): Clip {
  return { ...clip, ...patch, render_status: 'pending', render_key: null, updated_at: new Date().toISOString() }
}

function clampPlayhead(clip: Clip | undefined, seconds: number): number {
  if (!clip) return 0
  return Math.max(0, Math.min(seconds, clipOutputDuration(clip) - FRAME))
}

/** Die unterste Spur, auf der im Zeitraum nichts liegt. */
function freeTrack(overlays: Overlay[], start: number, end: number, from = 0, exceptId?: string): number {
  for (let track = Math.max(0, from); ; track++) {
    const taken = overlays.some((overlay) => overlay.id !== exceptId && overlay.track === track && overlay.start < end - 1e-6 && overlay.end > start + 1e-6)
    if (!taken) return track
  }
}

/** Nummeriert die Spuren lückenlos durch, Reihenfolge bleibt. */
function compact(overlays: Overlay[]): Overlay[] {
  const used = [...new Set(overlays.map((overlay) => overlay.track))].sort((a, b) => a - b)
  const map = new Map(used.map((track, index) => [track, index]))
  return overlays.map((overlay) => (map.get(overlay.track) === overlay.track ? overlay : { ...overlay, track: map.get(overlay.track)! }))
}

/**
 * Setzt neue Abschnitte und hält dabei alles andere konsistent:
 *
 * - Fällt der Anfang oder das Ende weg, wird das Clip-Fenster enger — so
 *   stimmt der Quellbereich in der Übersicht und im Export.
 * - Overlays bleiben an ihrem Material (siehe `remapOverlayTimes`).
 */
function withSegments(clip: Clip, next: ClipSegment[], sourceDuration: number): Clip {
  const duration = clipWindowDuration(clip)
  const normalized = normalizeSegments(next, duration)
  const first = normalized[0]
  const last = normalized[normalized.length - 1]
  let result: Clip = { ...clip, segments: normalized.length > 1 ? normalized : null }
  if (first.start > 1e-6 || last.end < snapToFrame(duration) - 1e-6) {
    result = trimClip(result, clip.start_seconds + first.start, clip.start_seconds + last.end, sourceDuration)
  }
  if (clip.overlays?.length) {
    const remapped = remapOverlayTimes(
      clip.overlays,
      { start: clip.start_seconds, segments: clipSegments(clip) },
      { start: result.start_seconds, segments: clipSegments(result) },
    )
    result.overlays = keepOverlaysToEnd(clip.overlays, remapped, clipOutputDuration(clip), clipOutputDuration(result))
  }
  return edited(result, {})
}

export const useEditorStore = create<EditorState>()(
  temporal(
    (set, get) => {
      /** Ändert einen Clip und schreibt die Ansicht passend mit. */
      const updateActive = (clipId: string, change: (clip: Clip, state: EditorState) => Clip | null) =>
        set((state) => {
          const clip = state.clips.find((candidate) => candidate.id === clipId)
          if (!clip) return state
          const next = change(clip, state)
          if (!next || next === clip) return state
          return { clips: state.clips.map((candidate) => (candidate.id === clipId ? next : candidate)) }
        })

      /** Neue Abschnitte setzen, Playhead am selben Material halten. */
      const applySegments = (clipId: string, segments: ClipSegment[], selection: EditorSelection = VIDEO) =>
        set((state) => {
          const clip = state.clips.find((candidate) => candidate.id === clipId)
          if (!clip) return state
          const next = withSegments(clip, segments, state.sourceDuration)
          const isActive = state.activeClipId === clipId
          const playheadSeconds = isActive
            ? clampPlayhead(next, remapOutputTime(state.playheadSeconds, { start: clip.start_seconds, segments: clipSegments(clip) }, { start: next.start_seconds, segments: clipSegments(next) }))
            : state.playheadSeconds
          return {
            clips: state.clips.map((candidate) => (candidate.id === clipId ? next : candidate)),
            playheadSeconds,
            selection: isActive ? selection : state.selection,
          }
        })

      const overlaysOf = (clipId: string) => get().clips.find((clip) => clip.id === clipId)?.overlays ?? []

      /**
       * Ein neues Element beginnt am Playhead — und mit seiner Einblendung.
       * Genau dort ist es also noch unsichtbar, und man sähe nach dem Einfügen
       * nur einen leeren Rahmen. Der Playhead rückt deshalb an das Ende der
       * Einblendung, wo das Element in Ruhe steht.
       */
      const revealOverlay = (overlay: Overlay) => {
        if (overlay.animationIn === 'none') return
        const length = overlay.end - overlay.start
        const settle = overlay.animationIn === 'typewriter' ? Math.min(1.2, length / 2) : Math.min(0.5, length / 2)
        const clip = get().clips.find((candidate) => candidate.id === get().activeClipId)
        set({ playheadSeconds: clampPlayhead(clip, overlay.start + settle), isPlaying: false })
      }

      const setOverlays = (clipId: string, change: (overlays: Overlay[], clip: Clip) => Overlay[]) =>
        updateActive(clipId, (clip) => {
          const current = clip.overlays ?? []
          const next = change(current, clip)
          return next === current ? null : edited(clip, { overlays: next })
        })

      return {
        clips: [],
        removedWords: {},
        activeClipId: null,
        playheadSeconds: 0,
        isPlaying: false,
        playbackRate: 1,
        sourceDuration: Infinity,
        selection: VIDEO,
        tool: 'select',
        snapping: true,
        loop: false,
        previewMuted: false,
        libraryTab: 'transcript',

        initialize: (clips, removedWords = {}, activeClipId, sourceDuration = Infinity) => {
          flushHistory()
          useEditorStore.temporal.getState().pause()
          // Der stärkste Clip zuerst — dieselbe Reihenfolge wie in der Clip-Liste.
          const first = clips.find((clip) => clip.id === activeClipId) ?? [...clips].sort((a, b) => b.virality_score - a.virality_score)[0]
          set({
            clips,
            removedWords,
            activeClipId: first?.id ?? null,
            playheadSeconds: previewStart(first),
            isPlaying: false,
            playbackRate: 1,
            sourceDuration,
            selection: VIDEO,
            tool: 'select',
          })
          useEditorStore.temporal.getState().clear()
          useEditorStore.temporal.getState().resume()
        },

        duplicateClip: (clipId) => {
          const original = get().clips.find((clip) => clip.id === clipId)
          if (!original) return null
          flushHistory()
          const id = crypto.randomUUID()
          const timestamp = new Date().toISOString()
          const duplicate = { ...original, id, title: `${original.title} – Kopie`, created_at: timestamp, updated_at: timestamp, render_status: 'pending' as const, render_key: null, render_job_id: null }
          set((state) => ({ clips: [...state.clips, duplicate], activeClipId: id, removedWords: { ...state.removedWords, [id]: [...(state.removedWords[clipId] ?? [])] }, isPlaying: false, selection: VIDEO }))
          return id
        },

        deleteClip: (clipId) => {
          flushHistory()
          set((state) => {
            const clips = state.clips.filter((clip) => clip.id !== clipId)
            const removedWords = { ...state.removedWords }
            delete removedWords[clipId]
            return { clips, removedWords, activeClipId: state.activeClipId === clipId ? clips[0]?.id ?? null : state.activeClipId, isPlaying: false, playheadSeconds: 0, selection: VIDEO }
          })
        },

        setActiveClip: (clipId) =>
          set((state) => ({
            activeClipId: clipId,
            playheadSeconds: previewStart(state.clips.find((clip) => clip.id === clipId)),
            isPlaying: false,
            selection: VIDEO,
          })),

        setPlayhead: (seconds) => {
          const state = get()
          const clip = state.clips.find((item) => item.id === state.activeClipId)
          set({ playheadSeconds: clampPlayhead(clip, seconds) })
        },
        setPlaying: (playing) => set({ isPlaying: playing }),
        setPlaybackRate: (rate) => set({ playbackRate: rate }),
        select: (selection) => set({ selection }),
        setTool: (tool) => set({ tool }),
        setSnapping: (snapping) => set({ snapping }),
        setLoop: (loop) => set({ loop }),
        setPreviewMuted: (previewMuted) => set({ previewMuted }),
        setLibraryTab: (libraryTab) => set({ libraryTab }),

        updateClip: (clipId, patch) =>
          set((state) => ({
            clips: state.clips.map((clip) =>
              clip.id === clipId ? { ...clip, ...patch, render_status: 'pending', render_key: null, render_job_id: null, updated_at: new Date().toISOString() } : clip,
            ),
          })),

        updateClipMeta: (clipId, patch) =>
          updateActive(clipId, (clip) => ({ ...clip, ...patch, updated_at: new Date().toISOString() })),

        setRenderState: (clipId, patch) => {
          // Ein fertiger Render ist kein Bearbeitungsschritt: Cmd+Z soll ihn
          // nicht wieder auf „Wartet" zurückdrehen.
          flushHistory()
          useEditorStore.temporal.getState().pause()
          set((state) => ({ clips: state.clips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip)) }))
          useEditorStore.temporal.getState().resume()
        },

        setTrim: (clipId, start, end) => set((state) => {
          const original = state.clips.find((clip) => clip.id === clipId)
          if (!original) return state
          const trimmed = { ...trimClip(original, start, end, state.sourceDuration), render_status: 'pending' as const, render_key: null, render_job_id: null }
          if (original.overlays?.length) {
            trimmed.overlays = keepOverlaysToEnd(original.overlays, original.overlays, clipOutputDuration(original), clipOutputDuration(trimmed))
          }
          // Der Playhead bleibt am Material, solange es im Clip liegt.
          const playheadSeconds = state.activeClipId === clipId
            ? clampPlayhead(trimmed, remapOutputTime(state.playheadSeconds, { start: original.start_seconds, segments: clipSegments(original) }, { start: trimmed.start_seconds, segments: clipSegments(trimmed) }))
            : state.playheadSeconds
          return { clips: state.clips.map((clip) => clip.id === clipId ? trimmed : clip), playheadSeconds }
        }),

        setCaptionStyle: (clipId, patch) =>
          updateActive(clipId, (clip) => edited(clip, { caption_style: { ...clip.caption_style, ...patch } })),

        applyCaptionPreset: (clipId, preset) =>
          // Ein- oder ausgeblendet ist keine Frage des Looks: Die Vorlage
          // behält, ob die Untertitel gerade sichtbar sind.
          updateActive(clipId, (clip) => edited(clip, { caption_style: { ...CAPTION_PRESETS[preset], enabled: clip.caption_style.enabled } })),

        toggleWordRemoved: (clipId, wordIndex) => {
          const current = get().removedWords[clipId] ?? []
          const next = current.includes(wordIndex)
            ? current.filter((index) => index !== wordIndex)
            : [...current, wordIndex].sort((a, b) => a - b)

          set((state) => ({ removedWords: { ...state.removedWords, [clipId]: next }, clips: state.clips.map((clip) => clip.id === clipId ? { ...clip, render_status: 'pending', render_key: null } : clip) }))
        },

        setWordsRemoved: (clipId, wordIndices, removed) => {
          const current = new Set(get().removedWords[clipId] ?? [])
          for (const index of wordIndices) {
            if (removed) current.add(index)
            else current.delete(index)
          }
          const next = [...current].sort((a, b) => a - b)
          set((state) => ({ removedWords: { ...state.removedWords, [clipId]: next }, clips: state.clips.map((clip) => clip.id === clipId ? { ...clip, render_status: 'pending', render_key: null } : clip) }))
        },

        updateWordText: (clipId, wordIndex, text) =>
          updateActive(clipId, (clip) => edited(clip, {
            words: clip.words.map((word, index): TranscriptWord => (index === wordIndex ? { ...word, word: text } : word)),
          })),

        setVideoSettings: (clipId, patch) =>
          updateActive(clipId, (clip) => edited(clip, { video_settings: { ...resolveVideoSettings(clip.video_settings), ...patch } })),

        // --- Schnitt -----------------------------------------------------------

        splitVideo: (clipId, outputSeconds) => {
          const clip = get().clips.find((candidate) => candidate.id === clipId)
          if (!clip) return false
          const segments = clipSegments(clip)
          const next = splitSegmentsAt(segments, outputToSource(segments, outputSeconds))
          if (next === segments) return false
          const index = next.findIndex((segment) => segment.start >= outputToSource(segments, outputSeconds) - 1e-6)
          applySegments(clipId, next, { type: 'segment', index: Math.max(0, index) })
          return true
        },

        deleteSegment: (clipId, index) => {
          const clip = get().clips.find((candidate) => candidate.id === clipId)
          if (!clip) return
          const segments = clipSegments(clip)
          const next = removeSegment(segments, index)
          if (next !== segments) applySegments(clipId, next)
        },

        trimSegment: (clipId, index, edge, sourceSeconds) => {
          const state = get()
          const clip = state.clips.find((candidate) => candidate.id === clipId)
          if (!clip) return
          const segments = clipSegments(clip)
          const segment = segments[index]
          if (!segment) return
          const last = segments.length - 1
          // Die Außenkanten sind die Grenzen des Clips im Quellvideo.
          if (index === 0 && edge === 'start') {
            const start = Math.min(sourceSeconds, segment.end - 0.2)
            state.setTrim(clipId, clip.start_seconds + start, clip.end_seconds)
            return
          }
          if (index === last && edge === 'end') {
            const end = Math.max(sourceSeconds, segment.start + 0.2)
            state.setTrim(clipId, clip.start_seconds, clip.start_seconds + end)
            return
          }
          const next = setSegmentEdge(segments, index, edge, sourceSeconds, clipWindowDuration(clip))
          applySegments(clipId, next, { type: 'segment', index })
        },

        cutRanges: (clipId, ranges) => {
          const clip = get().clips.find((candidate) => candidate.id === clipId)
          if (!clip || ranges.length === 0) return
          const segments = clipSegments(clip)
          const next = ranges.reduce((current, [from, to]) => cutSegmentRange(current, from, to), segments)
          if (next.length === 0) return
          applySegments(clipId, next, get().selection)
        },

        restoreRange: (clipId, from, to) => {
          const clip = get().clips.find((candidate) => candidate.id === clipId)
          if (!clip) return
          applySegments(clipId, restoreSegmentRange(clipSegments(clip), from, to, clipWindowDuration(clip)), get().selection)
        },

        resetCuts: (clipId) => {
          const clip = get().clips.find((candidate) => candidate.id === clipId)
          if (!clip?.segments) return
          applySegments(clipId, [{ start: 0, end: clipWindowDuration(clip) }])
        },

        removePauses: (clipId, minimumGap) => {
          const clip = get().clips.find((candidate) => candidate.id === clipId)
          if (!clip) return { count: 0, seconds: 0 }
          const before = clipOutputDuration(clip)
          const ranges = findPauses(clip.words, clipWindowDuration(clip), minimumGap)
          get().cutRanges(clipId, ranges)
          const after = get().clips.find((candidate) => candidate.id === clipId)
          return { count: ranges.length, seconds: after ? before - clipOutputDuration(after) : 0 }
        },

        removeFillers: (clipId) => {
          const clip = get().clips.find((candidate) => candidate.id === clipId)
          if (!clip) return { count: 0, seconds: 0 }
          const before = clipOutputDuration(clip)
          const fillers = findFillers(clip.words, clipWindowDuration(clip))
          get().cutRanges(clipId, fillers.map((filler) => filler.range))
          // Herausgeschnittene Füllwörter sollen auch im Untertitel fehlen.
          if (fillers.length > 0) get().setWordsRemoved(clipId, fillers.map((filler) => filler.index), true)
          const after = get().clips.find((candidate) => candidate.id === clipId)
          return { count: fillers.length, seconds: after ? before - clipOutputDuration(after) : 0 }
        },

        // --- Overlays ----------------------------------------------------------

        addOverlay: (clipId, overlay) => {
          setOverlays(clipId, (overlays) => [...overlays, { ...overlay, track: freeTrack(overlays, overlay.start, overlay.end) }])
          set({ selection: { type: 'overlay', id: overlay.id } })
          revealOverlay(overlay)
        },

        updateOverlay: (clipId, overlayId, patch) =>
          setOverlays(clipId, (overlays) => overlays.map((overlay) => (overlay.id === overlayId ? ({ ...overlay, ...patch } as Overlay) : overlay))),

        placeOverlay: (clipId, overlayId, placement) =>
          setOverlays(clipId, (overlays) => {
            const target = overlays.find((overlay) => overlay.id === overlayId)
            if (!target) return overlays
            const start = Math.max(0, placement.start)
            const end = Math.max(start + MIN_OVERLAY_SECONDS, placement.end)
            const track = freeTrack(overlays, start, end, placement.track, overlayId)
            if (target.start === start && target.end === end && target.track === track) return overlays
            return overlays.map((overlay) => (overlay.id === overlayId ? { ...overlay, start, end, track } : overlay))
          }),

        compactTracks: (clipId) =>
          setOverlays(clipId, (overlays) => {
            const next = compact(overlays)
            return next.every((overlay, index) => overlay === overlays[index]) ? overlays : next
          }),

        removeOverlay: (clipId, overlayId) => {
          setOverlays(clipId, (overlays) => compact(overlays.filter((overlay) => overlay.id !== overlayId)))
          const { selection } = get()
          if (selection.type === 'overlay' && selection.id === overlayId) set({ selection: VIDEO })
        },

        duplicateOverlay: (clipId, overlayId) => {
          const original = overlaysOf(clipId).find((overlay) => overlay.id === overlayId)
          if (!original) return null
          const id = crypto.randomUUID()
          const length = original.end - original.start
          // Direkt dahinter auf derselben Spur — eine Kopie am selben Platz
          // läge im Bild deckungsgleich und wäre nicht zu sehen.
          const copy: Overlay = { ...original, id, start: original.end, end: original.end + length, locked: false }
          setOverlays(clipId, (overlays) => [...overlays, { ...copy, track: freeTrack(overlays, copy.start, copy.end, original.track) }])
          set({ selection: { type: 'overlay', id } })
          return id
        },

        pasteOverlay: (clipId, overlay) => {
          const id = crypto.randomUUID()
          const { playheadSeconds } = get()
          const length = overlay.end - overlay.start
          const copy: Overlay = { ...overlay, id, start: playheadSeconds, end: playheadSeconds + length, locked: false }
          setOverlays(clipId, (overlays) => [...overlays, { ...copy, track: freeTrack(overlays, copy.start, copy.end) }])
          set({ selection: { type: 'overlay', id } })
          revealOverlay(copy)
          return id
        },

        splitOverlay: (clipId, overlayId, outputSeconds) => {
          const original = overlaysOf(clipId).find((overlay) => overlay.id === overlayId)
          const at = snapToFrame(outputSeconds)
          if (!original || at - original.start < MIN_OVERLAY_SECONDS || original.end - at < MIN_OVERLAY_SECONDS) return false
          // An der Schnittstelle weder aus- noch einblenden: Das Element soll
          // durchlaufen, bis man eine Hälfte verändert.
          const first: Overlay = { ...original, end: at, animationOut: 'none' }
          const second: Overlay = { ...original, id: crypto.randomUUID(), start: at, animationIn: 'none' }
          setOverlays(clipId, (overlays) => overlays.flatMap((overlay) => (overlay.id === overlayId ? [first, second] : [overlay])))
          set({ selection: { type: 'overlay', id: second.id } })
          return true
        },

        moveOverlayLayer: (clipId, overlayId, direction) =>
          setOverlays(clipId, (overlays) => {
            const target = overlays.find((overlay) => overlay.id === overlayId)
            if (!target) return overlays
            const track = direction === 'up'
              ? freeTrack(overlays, target.start, target.end, target.track + 1, overlayId)
              : (() => {
                for (let candidate = target.track - 1; candidate >= 0; candidate--) {
                  if (freeTrack(overlays, target.start, target.end, candidate, overlayId) === candidate) return candidate
                }
                return target.track
              })()
            if (track === target.track) return overlays
            return compact(overlays.map((overlay) => (overlay.id === overlayId ? { ...overlay, track } : overlay)))
          }),
      }
    },
    {
      // Nur der Inhalt ist undo-fähig, nicht die Ansicht.
      partialize: (state): HistoryState => ({
        clips: state.clips,
        removedWords: state.removedWords,
      }),
      equality: historyEqual,
      limit: 150,

      /**
       * Gruppiert schnelle Änderungen zu einem Historienschritt.
       *
       * Beim Tippen im Transkript feuert pro Tastendruck ein setState, beim
       * Ziehen eines Overlays pro Mausbewegung. Ohne Gruppierung wäre jeder
       * Buchstabe und jedes Pixel ein eigener Undo-Schritt.
       *
       * Wichtig ist, den ERSTEN pastState der Serie zu behalten: würde man den
       * letzten nehmen, landete man beim Undo mitten im eingetippten Wort.
       */
      handleSet: (handleSet) => {
        let timeout: ReturnType<typeof setTimeout> | undefined
        let firstPastState: Parameters<typeof handleSet>[0] | null = null

        // zundo übergibt zwar vier Argumente, ausgewertet werden aber nur
        // `pastState` sowie — bei gesetztem `diff`/`onSave` — die übrigen.
        // Beides ist hier nicht konfiguriert, deshalb genügt `pastState`;
        // das ist auch das in zundo dokumentierte Aufrufmuster.
        return (pastState) => {
          if (firstPastState === null) firstPastState = pastState

          const commit = () => {
            if (timeout) clearTimeout(timeout)
            if (firstPastState !== null) {
              handleSet(firstPastState)
              firstPastState = null
            }
            flushPendingHistory = null
          }

          flushPendingHistory = commit
          if (timeout) clearTimeout(timeout)
          timeout = setTimeout(commit, HISTORY_DEBOUNCE_MS)
        }
      },
    },
  ),
)

// --- Zwischenablage für Overlays --------------------------------------------

let clipboard: Overlay | null = null

export function copyOverlay(overlay: Overlay) {
  clipboard = overlay
}

export function clipboardOverlay(): Overlay | null {
  return clipboard
}

// --- Selektoren -------------------------------------------------------------

export function useActiveClip(): Clip | null {
  return useEditorStore((state) => {
    if (!state.activeClipId) return null
    return state.clips.find((clip) => clip.id === state.activeClipId) ?? null
  })
}

/** Das ausgewählte Overlay des aktiven Clips, sonst `null`. */
export function useSelectedOverlay(): Overlay | null {
  return useEditorStore((state) => {
    if (state.selection.type !== 'overlay') return null
    const id = state.selection.id
    const clip = state.clips.find((candidate) => candidate.id === state.activeClipId)
    return clip?.overlays?.find((overlay) => overlay.id === id) ?? null
  })
}

/**
 * Stabile leere Liste.
 *
 * Zustand vergleicht Selector-Ergebnisse mit Object.is. Ein inline erzeugtes
 * `[]` ist bei jedem Aufruf eine neue Referenz — der Store gilt dann als
 * ständig verändert und React rendert endlos ("The result of getSnapshot
 * should be cached"). Selektoren dürfen deshalb nie frisch erzeugte Objekte
 * oder Arrays zurückgeben.
 */
const NO_REMOVED_WORDS: number[] = []

export function useRemovedWords(clipId: string | null): number[] {
  return useEditorStore((state) =>
    clipId ? (state.removedWords[clipId] ?? NO_REMOVED_WORDS) : NO_REMOVED_WORDS,
  )
}

/**
 * Reaktiver Zugriff auf die Historientiefe (für die Undo/Redo-Buttons).
 *
 * Zwei getrennte Selektoren statt eines Objekts — aus demselben Grund wie
 * oben: `{ past, future }` wäre bei jedem Aufruf eine neue Referenz.
 */
export function useHistoryDepth() {
  const past = useStore(useEditorStore.temporal, (state) => state.pastStates.length)
  const future = useStore(useEditorStore.temporal, (state) => state.futureStates.length)
  return { past, future }
}

export function undo() {
  flushHistory()
  useEditorStore.temporal.getState().undo()
  reconcile()
}

export function redo() {
  flushHistory()
  useEditorStore.temporal.getState().redo()
  reconcile()
}

/** Nach Undo/Redo: Auswahl und Playhead dürfen nicht auf Verschwundenes zeigen. */
function reconcile() {
  const state = useEditorStore.getState()
  if (!state.clips.some((clip) => clip.id === state.activeClipId) && state.clips[0]) {
    state.setActiveClip(state.clips[0].id)
    return
  }
  const clip = state.clips.find((candidate) => candidate.id === state.activeClipId)
  const { selection } = state
  const stale =
    (selection.type === 'overlay' && !clip?.overlays?.some((overlay) => overlay.id === selection.id)) ||
    (selection.type === 'segment' && (!clip || selection.index >= clipSegments(clip).length))
  if (stale) state.select(VIDEO)
  state.setPlayhead(state.playheadSeconds)
}
