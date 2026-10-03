import type { CaptionStyle } from '@/types/database'

/**
 * Untertitel-Presets.
 *
 * `hormozi` ist der Standard: fette Versalien, dicke schwarze Kontur, das
 * gerade gesprochene Wort in Gelb.
 *
 * `clean` ist die ruhige Alternative: Untertitel, wie man sie von TikTok und
 * Reels kennt — normale Schreibung statt Versalien, kräftig, weiß mit
 * schmaler Kontur und weichem Schatten, bis zu zwei ausgewogene Zeilen im
 * Rhythmus der Sprache. Die Kontur ist dabei nicht Dekoration — ohne sie ist
 * weißer Text auf hellem Videomaterial unlesbar.
 */
export const CAPTION_PRESETS: Record<CaptionStyle['preset'], CaptionStyle> = {
  clean: {
    preset: 'clean',
    fontFamily: '"Montserrat", "Noto Color Emoji", system-ui, sans-serif',
    fontSize: 68,
    fontWeight: 800,
    color: '#FFFFFF',
    highlightColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 8,
    shadow: 0.45,
    positionY: 70,
    uppercase: false,
    animation: 'pop',
    wordsPerLine: 6,
  },
  hormozi: {
    preset: 'hormozi',
    fontFamily: '"Inter", system-ui, sans-serif',
    fontSize: 84,
    color: '#FFFFFF',
    highlightColor: '#FFE81F',
    strokeColor: '#000000',
    strokeWidth: 14,
    positionY: 72,
    uppercase: true,
    animation: 'pop',
    wordsPerLine: 3,
  },
  karaoke: {
    preset: 'karaoke',
    fontFamily: '"Inter", system-ui, sans-serif',
    fontSize: 68,
    color: '#FFFFFF',
    highlightColor: '#22D3EE',
    strokeColor: '#0F172A',
    strokeWidth: 10,
    positionY: 78,
    uppercase: false,
    animation: 'fade',
    wordsPerLine: 5,
  },
  minimal: {
    preset: 'minimal',
    fontFamily: '"Inter", system-ui, sans-serif',
    fontSize: 56,
    color: '#FFFFFF',
    highlightColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 0,
    positionY: 84,
    uppercase: false,
    animation: 'none',
    wordsPerLine: 6,
  },
  beast: {
    preset: 'beast',
    fontFamily: '"Inter", system-ui, sans-serif',
    fontSize: 96,
    color: '#FFFFFF',
    highlightColor: '#22C55E',
    strokeColor: '#000000',
    strokeWidth: 18,
    positionY: 64,
    uppercase: true,
    animation: 'slide',
    wordsPerLine: 2,
  },
  // Die Schriftnamen stehen hier ausgeschrieben statt über `fontStack` aus
  // `../fonts`: Dieses Modul lädt auch das Dashboard, und es soll dafür nicht
  // die Metadaten aller Google-Schriften mitschleppen.
  box: {
    preset: 'box',
    fontFamily: '"Poppins", "Noto Color Emoji", system-ui, sans-serif',
    fontSize: 60,
    fontWeight: 700,
    color: '#FFFFFF',
    highlightColor: '#FFD60A',
    strokeColor: '#000000',
    strokeWidth: 0,
    background: '#000000',
    backgroundOpacity: 0.72,
    positionY: 76,
    uppercase: false,
    animation: 'fade',
    wordsPerLine: 4,
  },
  elegant: {
    preset: 'elegant',
    fontFamily: '"Playfair Display", "Noto Color Emoji", Georgia, serif',
    fontSize: 70,
    fontWeight: 700,
    color: '#FFFFFF',
    highlightColor: '#F4E3C1',
    strokeColor: '#000000',
    strokeWidth: 0,
    shadow: 0.8,
    positionY: 80,
    uppercase: false,
    animation: 'fade',
    wordsPerLine: 5,
  },
  comic: {
    preset: 'comic',
    fontFamily: '"Bangers", "Noto Color Emoji", system-ui, sans-serif',
    fontSize: 108,
    color: '#FFFFFF',
    highlightColor: '#FF453A',
    strokeColor: '#000000',
    strokeWidth: 16,
    positionY: 70,
    uppercase: true,
    animation: 'pop',
    wordsPerLine: 2,
  },
  impact: {
    preset: 'impact',
    fontFamily: '"Anton", "Noto Color Emoji", system-ui, sans-serif',
    fontSize: 112,
    color: '#FFFFFF',
    highlightColor: '#FFE81F',
    strokeColor: '#000000',
    strokeWidth: 12,
    shadow: 0.6,
    positionY: 66,
    uppercase: true,
    animation: 'slide',
    wordsPerLine: 2,
  },
  // Handschrift mit dicker Kontur: wirkt wie mit dem Edding aufs Bild
  // geschrieben, das gesprochene Wort in Orange.
  marker: {
    preset: 'marker',
    fontFamily: '"Permanent Marker", "Noto Color Emoji", system-ui, sans-serif',
    fontSize: 86,
    color: '#FFFFFF',
    highlightColor: '#FF9F0A',
    strokeColor: '#000000',
    strokeWidth: 10,
    shadow: 0.4,
    positionY: 70,
    uppercase: false,
    animation: 'pop',
    wordsPerLine: 3,
  },
  // Schmale, hohe Versalien wie eine Zeitungsschlagzeile: viel Text auf
  // wenig Breite, das gesprochene Wort in Pink.
  headline: {
    preset: 'headline',
    fontFamily: '"Bebas Neue", "Noto Color Emoji", system-ui, sans-serif',
    fontSize: 124,
    color: '#FFFFFF',
    highlightColor: '#FF4FA3',
    strokeColor: '#000000',
    strokeWidth: 10,
    shadow: 0.5,
    positionY: 68,
    uppercase: true,
    animation: 'slide',
    wordsPerLine: 3,
  },
  // Schreibmaschine auf dunkler Box: ruhig, für Erklär- und Tech-Inhalte.
  mono: {
    preset: 'mono',
    fontFamily: '"Roboto Mono", "Noto Color Emoji", ui-monospace, monospace',
    fontSize: 54,
    fontWeight: 600,
    color: '#FFFFFF',
    highlightColor: '#7DD3FC',
    strokeColor: '#000000',
    strokeWidth: 0,
    background: '#0A0A0A',
    backgroundOpacity: 0.78,
    positionY: 76,
    uppercase: false,
    animation: 'none',
    wordsPerLine: 4,
  },
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = CAPTION_PRESETS.hormozi

export const CAPTION_PRESET_LABELS: Record<CaptionStyle['preset'], string> = {
  clean: 'Clean',
  hormozi: 'Hormozi',
  karaoke: 'Karaoke',
  minimal: 'Minimal',
  beast: 'Beast',
  box: 'Box',
  elegant: 'Elegant',
  comic: 'Comic',
  impact: 'Impact',
  marker: 'Marker',
  headline: 'Headline',
  mono: 'Mono',
}

export const CAPTION_ANIMATION_LABELS: Record<CaptionStyle['animation'], string> = {
  pop: 'Pop',
  fade: 'Einblenden',
  slide: 'Slide',
  none: 'Keine',
}
