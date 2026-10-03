import type React from 'react'
import { CAPTION_PRESET_LABELS } from '../../../remotion/captions/presets'
import { CLIP_STILL } from '@/components/landing/Episode'
import { CaptionLine, HookSticker, spokenWord } from '@/components/landing/ShortOverlays'
import { mockClips } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

/**
 * Produktansichten für die Landing Page — heute nur noch der Editor
 * (`EditorVisual`, große Kachel in `FeatureBento`).
 *
 * Bewusst keine Screenshots: Jede Ansicht wird aus denselben Werten
 * gezeichnet, die auch der Renderer und die Mock-Daten benutzen. Ein
 * Screenshot veraltet in dem Moment, in dem sich ein Preset ändert — diese
 * Ansichten nicht.
 *
 * Die Ansicht liegt in einer `.glass-field`-Mulde: Die Kachel drumherum ist
 * das Glas, die Ansicht ist darin eingelassen. So stapelt sich kein Glas auf
 * Glas.
 */

/** Zahlen mit Komma und fester Stellenzahl — ohne ICU, damit Server und Client gleich rendern. */
function decimal(value: number, digits = 2) {
  return value.toFixed(digits).replace('.', ',')
}

/** Die Beispielclips, stärkster zuerst — so sortiert sie auch das Produkt. */
const RANKED = [...mockClips].sort((a, b) => b.virality_score - a.virality_score)

const EDIT_CLIP = RANKED[0]
const EDIT_WORDS = EDIT_CLIP.words.slice(0, 24)
/** Der Schnitt endet nach dem zweiten Satz — gesetzt im Text, nicht auf der Timeline. */
const CUT_END_INDEX = EDIT_WORDS.findIndex((word, index) => index > 6 && /[.!?]$/.test(word.word))
/** Die Zeile, die gerade im Bild steht: drei Wörter, wie `wordsPerLine` von Hormozi. */
const LINE_START = 2
const LINE = EDIT_WORDS.slice(LINE_START, LINE_START + 3)
const LINE_BEAT = 0.62
const WORDS_END = EDIT_WORDS[EDIT_WORDS.length - 1].end
const CUT_END = EDIT_WORDS[CUT_END_INDEX].end

/** Dieselben Vorlagen wie im Editor, die gewählte zuerst. */
const EDITOR_PRESETS = ['hormozi', 'karaoke', 'beast', 'clean', 'box'] as const

/**
 * Säule „Bearbeiten": der Editor im Kleinen. Links das Transkript, in dem
 * der Schnitt gesetzt ist, rechts die Vorschau im Hochformat. Das
 * hervorgehobene Wort im Transkript und im Untertitel läuft im selben Takt —
 * es ist dieselbe Stelle.
 */
export function EditorVisual() {
  return (
    <div className="glass-field overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-2.5">
        <span className="flex gap-1.5">
          {[0, 1, 2].map((dot) => (
            <span key={dot} className="size-2 rounded-full bg-white/15" />
          ))}
        </span>
        <span className="min-w-0 truncate text-xs text-white/60">Clip 1</span>
        <span className="ml-auto shrink-0 rounded-full bg-white px-2.5 py-1 text-[0.6875rem] font-semibold text-black">
          Veröffentlichen
        </span>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_9.75rem] sm:gap-5">
        <div className="min-w-0">
          <p className="text-[0.625rem] font-medium tracking-[0.13em] text-white/45 uppercase">
            Transkript
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-x-0.5 gap-y-1.5 text-sm leading-none">
            <CutHandle />
            {EDIT_WORDS.map((entry, index) => {
              const inCut = index <= CUT_END_INDEX
              const spoken = index - LINE_START
              const inLine = spoken >= 0 && spoken < LINE.length
              return (
                <span key={`${entry.word}-${entry.start}`} className="contents">
                  <span
                    className={cn(
                      'rounded-md px-1 py-1',
                      inCut ? 'text-white/90' : 'text-white/35 line-through decoration-white/25',
                      inLine && 'spoken',
                    )}
                    style={
                      inLine
                        ? ({
                            '--base': 'rgb(255 255 255 / 0.9)',
                            '--hot': '#000',
                            '--hot-bg': '#fff',
                            '--pop': 1,
                            ...spokenWord(spoken, LINE.length, LINE_BEAT),
                          } as React.CSSProperties)
                        : undefined
                    }
                  >
                    {entry.word}
                  </span>
                  {index === CUT_END_INDEX ? <CutHandle /> : null}
                </span>
              )
            })}
          </p>

          {/* Dieselbe Auswahl als Zeitleiste: Der markierte Bereich ist der Clip. */}
          <div className="mt-4 border-t border-white/[0.07] pt-3">
            <div className="relative h-5">
              <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10" />
              <div
                className="absolute inset-y-0 left-0 rounded-md bg-brand/15 ring-1 ring-brand/45 ring-inset"
                style={{ width: `${(CUT_END / WORDS_END) * 100}%` }}
              />
              <div
                className="absolute inset-y-[-3px] w-px bg-white shadow-[0_0_6px_rgb(255_255_255/0.8)]"
                style={{ left: `${(EDIT_WORDS[LINE_START].start / WORDS_END) * 100}%` }}
              />
            </div>
            <p className="mt-2 font-mono text-[0.6875rem] text-white/50 tabular-nums">
              Schnitt 0,00–{decimal(CUT_END)} s
            </p>
          </div>
        </div>

        <div className="mx-auto w-40 sm:mx-0 sm:w-full">
          <div className="@container relative aspect-[9/16] overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-white/15">
            {/* eslint-disable-next-line @next/next/no-img-element -- dekorativ, schon in Kartengröße */}
            <img
              src={CLIP_STILL}
              alt=""
              loading="lazy"
              draggable={false}
              className="absolute inset-0 size-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
            <HookSticker>{EDIT_CLIP.hook_text}</HookSticker>
            <CaptionLine preset="hormozi" words={LINE.map((entry) => entry.word)} beat={LINE_BEAT} />
            <span className="glass-chip absolute bottom-[3%] left-1/2 -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[0.5625rem] font-medium whitespace-nowrap">
              9:16 · folgt dem Sprecher
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-hidden border-t border-white/[0.07] px-4 py-3 [mask-image:linear-gradient(to_right,#000_85%,transparent)]">
        <span className="mr-1 shrink-0 text-[0.625rem] font-medium tracking-[0.13em] text-white/45 uppercase">
          Untertitel
        </span>
        {EDITOR_PRESETS.map((preset, index) => (
          <span
            key={preset}
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-xs',
              index === 0 ? 'glass-lens text-white' : 'text-white/55 ring-1 ring-white/10 ring-inset',
            )}
          >
            {CAPTION_PRESET_LABELS[preset]}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Ein Schnittgriff im Text: So sieht die Grenze eines Clips im Transkript aus. */
function CutHandle() {
  return (
    <span aria-hidden className="mx-0.5 inline-block h-5 w-1 rounded-full bg-brand shadow-[0_0_8px_rgb(111_186_253/0.7)]" />
  )
}

/* ========================================================================== */
