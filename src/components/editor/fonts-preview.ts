'use client'

import { useEffect } from 'react'
import { FONT_KEYS, ensureFont, fontDefinition } from '../../../remotion/fonts'

/**
 * Lädt Schriften, damit Auswahllisten und Vorlagen sie in ihrer eigenen
 * Form zeigen können. Dieselben Dateien braucht später der Player ohnehin —
 * es wird also nichts doppelt geladen.
 */
export function useFontPreviews(keys: readonly string[] = FONT_KEYS) {
  const signature = keys.join(',')
  useEffect(() => {
    for (const key of signature.split(',')) {
      if (!key) continue
      const font = fontDefinition(key)
      ensureFont(key, font.weights.includes(700) ? 700 : font.weights[font.weights.length - 1])
    }
  }, [signature])
}
