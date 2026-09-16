import type { CaptionStyle } from '@/types/database'

/**
 * Untertitel-Presets.
 *
 * `hormozi` ist der Look, der Kurzvideos dominiert: fette Versalien, dicke
 * schwarze Kontur, das gerade gesprochene Wort in Gelb hervorgehoben, leichter
 * Pop beim Wortwechsel. Die Kontur ist dabei nicht Dekoration — ohne sie ist
 * weißer Text auf hellem Videomaterial unlesbar.
 */
export const CAPTION_PRESETS: Record<CaptionStyle['preset'], CaptionStyle> = {
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
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = CAPTION_PRESETS.hormozi

export const CAPTION_PRESET_LABELS: Record<CaptionStyle['preset'], string> = {
  hormozi: 'Hormozi',
  karaoke: 'Karaoke',
  minimal: 'Minimal',
  beast: 'Beast',
}

export const CAPTION_ANIMATION_LABELS: Record<CaptionStyle['animation'], string> = {
  pop: 'Pop',
  fade: 'Einblenden',
  slide: 'Slide',
  none: 'Keine',
}
