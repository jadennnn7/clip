'use client'

import React, { useCallback, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import type { Clip } from '@/types/database'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'

interface TranscriptEditorProps {
  clip: Clip
  /** Playhead relativ zum Clip-Start, in Sekunden. */
  currentTime: number
  removedWords: number[]
  onSeek: (clipSeconds: number) => void
  onToggleWord: (wordIndex: number) => void
  onEditWord: (wordIndex: number, text: string) => void
}

/**
 * Wort-genauer Transkript-Editor.
 *
 * Drei Interaktionen auf demselben Element:
 *   Klick        → an diese Stelle springen
 *   Doppelklick  → Wort korrigieren (Transkriptionsfehler)
 *   Backspace    → Wort aus dem Cut entfernen
 *
 * Das ist der Kern des "Text-basierten Schnitts": Nutzer denken in Sätzen,
 * nicht in Frames. Ein Füllwort zu entfernen ist ein Tastendruck im Text statt
 * einer Millisekunden-Operation auf der Timeline.
 */
export function TranscriptEditor({
  clip,
  currentTime,
  removedWords,
  onSeek,
  onToggleWord,
  onEditWord,
}: TranscriptEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const removed = new Set(removedWords)

  const commitEdit = useCallback(() => {
    if (editingIndex === null) return
    const value = inputRef.current?.value.trim()
    if (value) onEditWord(editingIndex, value)
    setEditingIndex(null)
  }, [editingIndex, onEditWord])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLSpanElement>, index: number) => {
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        onToggleWord(index)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        setEditingIndex(index)
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        // Pfeiltasten bleiben hier dem Player überlassen (Frame-Schritte);
        // die Wortnavigation läuft über Tab.
        return
      }
    },
    [onToggleWord],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
        <Info className="size-3.5 shrink-0" />
        <span>
          Klick springt · Doppelklick korrigiert · <kbd className="rounded border bg-muted px-1 font-mono">Backspace</kbd> schneidet
          das Wort heraus
        </span>
      </div>

      <ScrollArea className="flex-1">
        <p className="flex flex-wrap gap-x-1 gap-y-1.5 p-3 text-[15px] leading-8">
          {clip.words.map((word, index) => {
            const isActive = currentTime >= word.start && currentTime < word.end
            const isRemoved = removed.has(index)
            const isPast = word.end <= currentTime

            if (editingIndex === index) {
              return (
                <input
                  key={`edit-${index}`}
                  ref={inputRef}
                  defaultValue={word.word}
                  autoFocus
                  onBlur={commitEdit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitEdit()
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setEditingIndex(null)
                    }
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
                onClick={() => onSeek(word.start)}
                onDoubleClick={() => setEditingIndex(index)}
                onFocus={() => setFocusedIndex(index)}
                onBlur={() => setFocusedIndex(null)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                title={`${word.start.toFixed(2)}s – ${word.end.toFixed(2)}s`}
                className={cn(
                  'cursor-pointer rounded px-1 transition-colors select-none',
                  'hover:bg-accent focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                  isActive && 'bg-primary text-primary-foreground',
                  !isActive && isPast && 'text-muted-foreground',
                  isRemoved && 'text-destructive/60 line-through decoration-2',
                  focusedIndex === index && !isActive && 'bg-accent',
                )}
              >
                {word.word}
              </span>
            )
          })}
        </p>
      </ScrollArea>

      {removed.size > 0 ? (
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          {removed.size} {removed.size === 1 ? 'Wort' : 'Wörter'} aus dem Cut entfernt
        </div>
      ) : null}
    </div>
  )
}
