import { formatSentencesForPrompt } from './prompts'
import type { TranscriptStructure } from './structure'

export interface DiscoveryWindow {
  firstSentence: number
  lastSentence: number
  startSeconds: number
  endSeconds: number
  transcript: string
}

/**
 * Lange Quellen abschnittsweise durchsuchen, damit frühe Highlights spätere
 * Geschichten nicht verdrängen. Ein Clip darf über eine Suchgrenze laufen;
 * deshalb enthält jeder Abschnitt zusätzlich bis zu eine Cliplänge Kontext.
 */
export function discoveryWindows(
  structure: TranscriptStructure,
  durationSeconds: number,
  maxClips: number,
  lengthRange: { min: number; max: number },
): DiscoveryWindow[] {
  const { sentences, chapters } = structure
  if (sentences.length === 0 || maxClips <= 0) return []

  const window = (firstSentence: number, lastSentence: number): DiscoveryWindow => {
    const startSeconds = sentences[firstSentence].start
    const endSeconds = sentences[lastSentence].end
    // Nur das aktuell geltende Kapitel und spätere Wechsel mitgeben; alle
    // früheren Überschriften wären irreführender Kontext für diesen Ausschnitt.
    let activeChapter = -1
    for (let index = 0; index < chapters.length; index++) {
      if (chapters[index].start > startSeconds) break
      activeChapter = index
    }
    const contextChapters = chapters
      .map((chapter, index) => ({ ...chapter, title: chapter.title || `Kapitel ${index + 1}` }))
      .slice(Math.max(0, activeChapter))
      .filter((chapter) => chapter.start <= sentences[lastSentence].start)
    return {
      firstSentence,
      lastSentence,
      startSeconds,
      endSeconds,
      transcript: formatSentencesForPrompt(
        sentences.slice(firstSentence, lastSentence + 1), contextChapters, firstSentence,
      ),
    }
  }

  if (durationSeconds <= 600 || maxClips === 1) return [window(0, sentences.length - 1)]

  const count = Math.min(Math.floor(maxClips), Math.ceil(durationSeconds / 300))
  const coreLength = durationSeconds / count
  const windows: DiscoveryWindow[] = []
  let first = 0
  for (let index = 0; index < count; index++) {
    const coreStart = index * coreLength
    const coreEnd = (index + 1) * coreLength
    while (first < sentences.length && sentences[first].start < coreStart) first++
    if (first >= sentences.length) break
    if (sentences[first].start >= coreEnd) continue

    const contextEnd = Math.min(durationSeconds, coreEnd + lengthRange.max)
    let last = first
    while (last + 1 < sentences.length && sentences[last + 1].start < contextEnd) last++
    windows.push(window(first, last))
  }
  return windows
}
