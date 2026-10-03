'use client'

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { CaptionsOff, Info, RotateCcw, Scissors, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Clip } from '@/types/database'
import { cn } from '@/lib/utils'
import { clipSegments, isCutAt, outputToSource } from '@/lib/clip-export'
import { useEditorStore } from '@/stores/editor-store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

interface TranscriptEditorProps {
  clip: Clip
  /** Playhead auf der Ausgabe-Zeitachse, in Sekunden. */
  currentTime: number
  removedWords: number[]
  /** Springt zu einer Quellzeit (Sekunden ab Clip-Start). */
  onSeekSource: (clipSeconds: number) => void
  onEditWord: (wordIndex: number, text: string) => void
}

/**
 * Wort-genauer Transkript-Editor — Schneiden über den Text.
 *
 *   Klick          → an diese Stelle springen, Wort auswählen
 *   Shift + Klick  → Auswahl bis hierher erweitern
 *   Doppelklick    → Wort korrigieren (Transkriptionsfehler)
 *   X              → Auswahl aus dem VIDEO schneiden (Bild und Ton)
 *   Backspace      → Auswahl nur im UNTERTITEL ausblenden (Ton bleibt)
 *
 * Geschnittene Wörter bleiben durchgestrichen stehen — ein zweites X holt
 * sie zurück. So ist Schneiden über den Text so harmlos wie Tippen.
 */
export function TranscriptEditor({ clip, currentTime, removedWords, onSeekSource, onEditWord }: TranscriptEditorProps) {
  const cutRanges = useEditorStore((state) => state.cutRanges)
  const restoreRange = useEditorStore((state) => state.restoreRange)
  const setWordsRemoved = useEditorStore((state) => state.setWordsRemoved)
  const removePauses = useEditorStore((state) => state.removePauses)
  const removeFillers = useEditorStore((state) => state.removeFillers)

  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [range, setRange] = useState<{ anchor: number; focus: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const removed = useMemo(() => new Set(removedWords), [removedWords])
  const segments = useMemo(() => clipSegments(clip), [clip])
  const sourceTime = outputToSource(segments, currentTime)
  const windowDuration = clip.end_seconds - clip.start_seconds
  const visible = (index: number) => {
    const word = clip.words[index]
    return word.end > 0 && word.start < windowDuration
  }
  const isCut = (index: number) => {
    const word = clip.words[index]
    return isCutAt(segments, (word.start + word.end) / 2)
  }

  const selected = range ? { from: Math.min(range.anchor, range.focus), to: Math.max(range.anchor, range.focus) } : null
  const selectedIndices = selected ? Array.from({ length: selected.to - selected.from + 1 }, (_, offset) => selected.from + offset).filter(visible) : []
  const allCut = selectedIndices.length > 0 && selectedIndices.every(isCut)
  const allHidden = selectedIndices.length > 0 && selectedIndices.every((index) => removed.has(index))

  const commitEdit = useCallback(() => {
    if (editingIndex === null) return
    const value = inputRef.current?.value.trim()
    if (value) onEditWord(editingIndex, value)
    setEditingIndex(null)
  }, [editingIndex, onEditWord])

  const toggleCut = () => {
    if (!selected || selectedIndices.length === 0) return
    const from = clip.words[selected.from].start
    const to = clip.words[selected.to].end
    if (allCut) restoreRange(clip.id, from, to)
    else cutRanges(clip.id, [[Math.max(0, from), Math.min(windowDuration, to)]])
  }

  const toggleHidden = () => {
    if (selectedIndices.length === 0) return
    setWordsRemoved(clip.id, selectedIndices, !allHidden)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>, index: number) => {
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      event.stopPropagation()
      toggleHidden()
      return
    }
    if (event.key === 'x' || event.key === 'X') {
      event.preventDefault()
      event.stopPropagation()
      toggleCut()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      setEditingIndex(index)
      return
    }
    if (event.key === 'Escape') {
      setRange(null)
      ;(event.target as HTMLElement).blur()
    }
  }

  const handleClick = (event: React.MouseEvent, index: number) => {
    if (event.shiftKey && range) {
      setRange({ anchor: range.anchor, focus: index })
      return
    }
    setRange({ anchor: index, focus: index })
    onSeekSource(clip.words[index].start)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2">
        <Button
          variant="outline"
          size="xs"
          disabled={clip.words.length === 0}
          onClick={() => {
            const result = removePauses(clip.id, 0.6)
            toast(result.count > 0 ? `${result.count} ${result.count === 1 ? 'Pause' : 'Pausen'} entfernt` : 'Keine Pausen über 0,6 s', { description: result.count > 0 ? `${result.seconds.toFixed(1)} s kürzer. Rückgängig mit ⌘Z.` : undefined })
          }}
        >
          <Wand2 /> Pausen
        </Button>
        <Button
          variant="outline"
          size="xs"
          disabled={clip.words.length === 0}
          onClick={() => {
            const result = removeFillers(clip.id)
            toast(result.count > 0 ? `${result.count} Füllwörter entfernt` : 'Keine Füllwörter gefunden', { description: result.count > 0 ? `${result.seconds.toFixed(1)} s kürzer. Rückgängig mit ⌘Z.` : undefined })
          }}
        >
          <Wand2 /> Füllwörter
        </Button>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground" title="Klick springt · Shift+Klick wählt aus · X schneidet aus dem Video · Backspace blendet im Untertitel aus · Doppelklick korrigiert">
          <Info className="size-3" /> Tasten
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {clip.words.length === 0 ? <div className="p-5 text-sm leading-relaxed text-muted-foreground">Noch kein Transkript vorhanden. Du kannst deinen Clip bereits schneiden, Texte und Elemente einfügen und den Bildausschnitt einstellen.</div> : null}
        {clip.words.length > 0 && !clip.words.some((_, index) => visible(index)) ? <p className="p-5 text-sm text-muted-foreground">Für diesen Ausschnitt sind keine Untertitel vorhanden. Erweitere die Grenzen des Clips, um das vorhandene Transkript zu sehen.</p> : null}
        {/* Der Fließtext soll sich wie Prosa lesen, nicht wie eine Liste von
            Schaltflächen. Deshalb enge Wortabstände und ein ruhiger Zeilenfall. */}
        <p className="flex flex-wrap gap-x-0.5 gap-y-1 p-4 text-[15px] leading-[1.95]">
          {clip.words.map((word, index) => {
            if (!visible(index)) return null
            const cut = isCut(index)
            const hidden = removed.has(index)
            const isActive = !cut && sourceTime >= word.start && sourceTime < word.end
            const isPast = word.end <= sourceTime
            const inRange = selected !== null && index >= selected.from && index <= selected.to

            if (editingIndex === index) {
              return (
                <input
                  key={`edit-${index}`}
                  ref={inputRef}
                  defaultValue={word.word}
                  autoFocus
                  onBlur={commitEdit}
                  onKeyDown={(event) => {
                    event.stopPropagation()
                    if (event.key === 'Enter') { event.preventDefault(); commitEdit() }
                    if (event.key === 'Escape') { event.preventDefault(); setEditingIndex(null) }
                  }}
                  className="w-[9ch] rounded border border-primary bg-background px-1 text-[15px] outline-none"
                  size={Math.max(4, word.word.length)}
                />
              )
            }

            return (
              <span
                key={`${word.start}-${index}`}
                role="button"
                tabIndex={0}
                onMouseDown={(event) => { if (event.shiftKey) event.preventDefault() }}
                onClick={(event) => handleClick(event, index)}
                // Mit Tab angesteuert, ist das Wort die Auswahl — dann wirken X und Backspace darauf.
                onFocus={() => { if (!inRange) setRange({ anchor: index, focus: index }) }}
                onDoubleClick={() => setEditingIndex(index)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                title={`${word.start.toFixed(2)}s – ${word.end.toFixed(2)}s${cut ? ' · aus dem Video geschnitten' : ''}${hidden ? ' · im Untertitel ausgeblendet' : ''}`}
                className={cn(
                  'transition-ui cursor-pointer rounded px-1 select-none',
                  'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  isActive && 'bg-primary font-medium text-primary-foreground',
                  !isActive && isPast && !cut && 'text-muted-foreground',
                  inRange && !isActive && 'bg-white/[0.14] text-foreground ring-1 ring-white/25',
                  hidden && !cut && 'text-destructive/70 line-through decoration-2',
                  cut && 'text-muted-foreground/40 line-through decoration-muted-foreground/50',
                )}
              >
                {word.word}
              </span>
            )
          })}
        </p>
      </ScrollArea>

      {selected && selectedIndices.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t bg-[oklch(0.17_0_0)] px-3 py-2">
          <span className="mr-auto text-xs text-muted-foreground">
            {selectedIndices.length} {selectedIndices.length === 1 ? 'Wort' : 'Wörter'}
            <span className="ml-1 font-mono tabular-nums">· {(clip.words[selected.to].end - clip.words[selected.from].start).toFixed(1)} s</span>
          </span>
          <Button variant={allCut ? 'outline' : 'secondary'} size="xs" onClick={toggleCut}>
            {allCut ? <RotateCcw /> : <Scissors />} {allCut ? 'Zurückholen' : 'Aus Video schneiden'}
            <kbd className="ml-0.5 font-mono text-[10px] opacity-60">X</kbd>
          </Button>
          <Button variant="ghost" size="xs" onClick={toggleHidden}>
            <CaptionsOff /> {allHidden ? 'Im Untertitel zeigen' : 'Nur Untertitel'}
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Auswahl aufheben" onClick={() => setRange(null)}>
            <X />
          </Button>
        </div>
      ) : removed.size > 0 ? (
        <div className="flex shrink-0 items-center gap-2 border-t bg-muted/30 px-3 py-2 text-xs">
          <span className="size-1.5 rounded-full bg-destructive" />
          <span className="text-muted-foreground">
            {removed.size} {removed.size === 1 ? 'Wort' : 'Wörter'} im Untertitel ausgeblendet
          </span>
        </div>
      ) : null}
    </div>
  )
}
