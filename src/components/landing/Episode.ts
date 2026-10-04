/**
 * Die Beispielfolge, die sich durch die Landing-Page zieht (ohne Namen im Bild),
 * 58:12 lang (siehe `RUNTIME` in `Chapters.tsx`). Aus ihr stammen die fünf
 * Clips im Hero, in „So geht’s" und in der Viralitätskurve — dieselben Sätze,
 * dieselben Scores, derselbe Bildausschnitt.
 */

/**
 * Standbild aus einem echten Ocuris-Clip, 9:16: der Talkshow-Clip der Galerie,
 * an einer Stelle ohne eingebrannten Untertitel — die Kacheln unter
 * „Funktionen" legen ihre eigenen Untertitel und Hook-Titel darüber.
 */
export const CLIP_STILL = '/gallery/still-talkshow.jpg'

/**
 * Die fünf Momente: wo sie in der Folge liegen (Anteil der Länge), ihr Score,
 * der Satz, der sie trägt, und der Bildausschnitt (`focus`, Anteile im Bild).
 * Der stärkste Clip zeigt den Gast rechts — „So geht’s" legt dort den
 * 9:16-Rahmen auf den Sprecher.
 */
export const EPISODE_MOMENTS = [
  { x: 0.07, score: 94, text: 'Das ändert alles', focus: [0.8, 0.4] },
  { x: 0.25, score: 91, text: 'Niemand sagt dir das', focus: [0.43, 0.42] },
  { x: 0.44, score: 88, text: 'Mein größter Fehler', focus: [0.58, 0.6] },
  { x: 0.62, score: 86, text: 'So fängst du an', focus: [0.74, 0.36] },
  { x: 0.83, score: 83, text: 'Der wahre Grund', focus: [0.74, 0.32] },
] as const
