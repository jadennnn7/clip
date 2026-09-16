'use client'

import { create } from 'zustand'
import { temporal } from 'zundo'
import { useStore } from 'zustand'
import type { CaptionStyle, Clip, TranscriptWord } from '@/types/database'
import { CAPTION_PRESETS } from '../../remotion/captions/presets'

/** Die Teilmenge des States, die in der Undo-Historie landet. */
interface HistoryState {
  clips: Clip[]
  /** Indizes der aus dem Cut entfernten Wörter, pro Clip-ID. */
  removedWords: Record<string, number[]>
}

interface EditorState extends HistoryState {
  // --- Flüchtiger State: bewusst NICHT in der Historie ----------------------
  // Würde die Playhead-Position mitgeschrieben, wäre jedes Cmd+Z ein
  // Cursor-Sprung statt einer echten Rücknahme.
  activeClipId: string | null
  playheadSeconds: number
  isPlaying: boolean
  playbackRate: number

  // --- Aktionen ------------------------------------------------------------
  initialize: (clips: Clip[]) => void
  setActiveClip: (clipId: string) => void
  setPlayhead: (seconds: number) => void
  setPlaying: (playing: boolean) => void
  setPlaybackRate: (rate: number) => void

  updateClip: (clipId: string, patch: Partial<Clip>) => void
  setTrim: (clipId: string, start: number, end: number) => void
  setCaptionStyle: (clipId: string, patch: Partial<CaptionStyle>) => void
  applyCaptionPreset: (clipId: string, preset: CaptionStyle['preset']) => void
  toggleWordRemoved: (clipId: string, wordIndex: number) => void
  updateWordText: (clipId: string, wordIndex: number, text: string) => void
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
  const duration = clip.end_seconds - clip.start_seconds
  return Math.min(PREVIEW_START_SECONDS, duration / 2)
}

export const useEditorStore = create<EditorState>()(
  temporal(
    (set, get) => ({
      clips: [],
      removedWords: {},
      activeClipId: null,
      playheadSeconds: 0,
      isPlaying: false,
      playbackRate: 1,

      initialize: (clips) => {
        // Der stärkste Clip zuerst — dieselbe Reihenfolge wie in der Clip-Liste.
        const first = [...clips].sort((a, b) => b.virality_score - a.virality_score)[0]
        set({
          clips,
          removedWords: {},
          activeClipId: first?.id ?? null,
          playheadSeconds: previewStart(first),
          isPlaying: false,
          playbackRate: 1,
        })
      },

      setActiveClip: (clipId) =>
        set((state) => ({
          activeClipId: clipId,
          playheadSeconds: previewStart(state.clips.find((clip) => clip.id === clipId)),
          isPlaying: false,
        })),

      setPlayhead: (seconds) => set({ playheadSeconds: Math.max(0, seconds) }),
      setPlaying: (playing) => set({ isPlaying: playing }),
      setPlaybackRate: (rate) => set({ playbackRate: rate }),

      updateClip: (clipId, patch) =>
        set((state) => ({
          clips: state.clips.map((clip) =>
            clip.id === clipId ? { ...clip, ...patch } : clip,
          ),
        })),

      setTrim: (clipId, start, end) =>
        set((state) => ({
          clips: state.clips.map((clip) =>
            clip.id === clipId
              ? {
                  ...clip,
                  start_seconds: Math.max(0, Math.min(start, end - 0.5)),
                  end_seconds: Math.max(start + 0.5, end),
                }
              : clip,
          ),
        })),

      setCaptionStyle: (clipId, patch) =>
        set((state) => ({
          clips: state.clips.map((clip) =>
            clip.id === clipId
              ? { ...clip, caption_style: { ...clip.caption_style, ...patch } }
              : clip,
          ),
        })),

      applyCaptionPreset: (clipId, preset) =>
        set((state) => ({
          clips: state.clips.map((clip) =>
            clip.id === clipId ? { ...clip, caption_style: { ...CAPTION_PRESETS[preset] } } : clip,
          ),
        })),

      toggleWordRemoved: (clipId, wordIndex) => {
        const current = get().removedWords[clipId] ?? []
        const next = current.includes(wordIndex)
          ? current.filter((index) => index !== wordIndex)
          : [...current, wordIndex].sort((a, b) => a - b)

        set((state) => ({ removedWords: { ...state.removedWords, [clipId]: next } }))
      },

      updateWordText: (clipId, wordIndex, text) =>
        set((state) => ({
          clips: state.clips.map((clip) => {
            if (clip.id !== clipId) return clip
            const words = clip.words.map((word, index): TranscriptWord =>
              index === wordIndex ? { ...word, word: text } : word,
            )
            return { ...clip, words }
          }),
        })),
    }),
    {
      // Nur der Inhalt ist undo-fähig, nicht die Ansicht.
      partialize: (state): HistoryState => ({
        clips: state.clips,
        removedWords: state.removedWords,
      }),
      equality: historyEqual,
      limit: 100,

      /**
       * Gruppiert schnelle Änderungen zu einem Historienschritt.
       *
       * Beim Tippen im Transkript feuert pro Tastendruck ein setState. Ohne
       * Gruppierung wäre jeder einzelne Buchstabe ein eigener Undo-Schritt.
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

// --- Selektoren -------------------------------------------------------------

export function useActiveClip(): Clip | null {
  return useEditorStore((state) => {
    if (!state.activeClipId) return null
    return state.clips.find((clip) => clip.id === state.activeClipId) ?? null
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
}

export function redo() {
  useEditorStore.temporal.getState().redo()
}
