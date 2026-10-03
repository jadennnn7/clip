import type { CaptionStyle } from '@/types/database'

/**
 * Ob zwei Untertitel-Stile gleich aussehen.
 *
 * Clips merken sich nicht, aus welchem Kit ihr Stil stammt — „Anwenden“
 * kopiert die Werte. Welche Clips ein Kit nutzen, lässt sich deshalb nur
 * am Stil selbst ablesen. Der frühere Vergleich über den Vorlagen-Schlüssel
 * zählte jeden Clip mit derselben Vorlage mit, auch wenn Schrift und Farben
 * längst andere waren.
 */
export function sameCaptionStyle(a: CaptionStyle, b: CaptionStyle): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof CaptionStyle>
  for (const key of keys) {
    // Fehlt `enabled`, sind die Untertitel sichtbar.
    if (key === 'enabled') {
      if ((a.enabled !== false) !== (b.enabled !== false)) return false
      continue
    }
    if ((a[key] ?? null) !== (b[key] ?? null)) return false
  }
  return true
}
