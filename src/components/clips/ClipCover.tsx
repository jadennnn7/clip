import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Clip } from '@/types/database'

function hashSeed(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

interface Atmosphere {
  bgGradient: string
  radialLight: string
  highlightBg: string
  highlightRing: string
  highlightText: string
  glowShadow: string
}

const ATMOSPHERES: Atmosphere[] = [
  {
    // Deep Indigo / Creator Studio
    bgGradient: 'from-slate-900 via-indigo-950/70 to-neutral-950',
    radialLight:
      'radial-gradient(ellipse at 65% 18%, rgba(99, 102, 241, 0.38), transparent 55%), radial-gradient(ellipse at 25% 75%, rgba(168, 85, 247, 0.22), transparent 50%)',
    highlightBg: 'bg-indigo-400/20',
    highlightRing: 'ring-indigo-400/40',
    highlightText: 'text-indigo-200',
    glowShadow: '0 0 16px rgba(99, 102, 241, 0.45)',
  },
  {
    // Warm Cinematic Amber / Film Studio
    bgGradient: 'from-stone-900 via-amber-950/50 to-neutral-950',
    radialLight:
      'radial-gradient(ellipse at 45% 15%, rgba(245, 158, 11, 0.32), transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(217, 119, 6, 0.2), transparent 50%)',
    highlightBg: 'bg-amber-400/20',
    highlightRing: 'ring-amber-400/40',
    highlightText: 'text-amber-200',
    glowShadow: '0 0 16px rgba(245, 158, 11, 0.45)',
  },
  {
    // Emerald / Virality Flow
    bgGradient: 'from-zinc-900 via-teal-950/60 to-neutral-950',
    radialLight:
      'radial-gradient(ellipse at 70% 22%, rgba(20, 184, 166, 0.32), transparent 55%), radial-gradient(ellipse at 20% 85%, rgba(16, 185, 129, 0.2), transparent 50%)',
    highlightBg: 'bg-emerald-400/20',
    highlightRing: 'ring-emerald-400/40',
    highlightText: 'text-emerald-200',
    glowShadow: '0 0 16px rgba(16, 185, 129, 0.45)',
  },
  {
    // Crimson / Dramatic Punch
    bgGradient: 'from-neutral-900 via-rose-950/50 to-neutral-950',
    radialLight:
      'radial-gradient(ellipse at 50% 15%, rgba(244, 63, 94, 0.32), transparent 55%), radial-gradient(ellipse at 20% 70%, rgba(225, 29, 72, 0.2), transparent 50%)',
    highlightBg: 'bg-rose-400/20',
    highlightRing: 'ring-rose-400/40',
    highlightText: 'text-rose-200',
    glowShadow: '0 0 16px rgba(244, 63, 94, 0.45)',
  },
  {
    // Electric Azure / Tech Spotlight
    bgGradient: 'from-slate-900 via-sky-950/60 to-neutral-950',
    radialLight:
      'radial-gradient(ellipse at 35% 20%, rgba(56, 189, 248, 0.32), transparent 55%), radial-gradient(ellipse at 75% 80%, rgba(14, 165, 233, 0.2), transparent 50%)',
    highlightBg: 'bg-sky-400/20',
    highlightRing: 'ring-sky-400/40',
    highlightText: 'text-sky-200',
    glowShadow: '0 0 16px rgba(56, 189, 248, 0.45)',
  },
]

const SOUND_BAR_HEIGHTS = [
  25, 55, 35, 70, 45, 80, 60, 35, 75, 50, 85, 40, 65, 30, 70, 55, 80, 40, 60, 45, 75, 35, 50, 30,
]

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Eine ästhetische Clip-Karte im Hochformat mit kinoreifem Licht,
 * Audio-Visualisierung und moderner Creator-Untertitel-Typografie.
 */
export function ClipCover({
  clip,
  captionSize = 21,
  bare = false,
  showDuration = true,
}: {
  clip: Clip
  captionSize?: number
  bare?: boolean
  showDuration?: boolean
}) {
  const style = clip.caption_style
  const words = (clip.hook_text ?? clip.title).replace(/[.]$/, '').split(/\s+/)
  const accent = Math.min(1, words.length - 1)

  const seed = hashSeed(clip.id)
  const atmosphere = ATMOSPHERES[seed % ATMOSPHERES.length]
  const waveOffset = seed % 12
  const durationText = formatDuration(clip.end_seconds - clip.start_seconds)

  return (
    <div
      className={cn(
        'relative size-full overflow-hidden bg-gradient-to-b shadow-[inset_0_1px_0_rgb(255_255_255/0.25),inset_0_0_0_1px_rgb(255_255_255/0.08)] select-none',
        atmosphere.bgGradient,
      )}
    >
      {/* Kinoreife Lichtquelle & weicher Verlauf */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: atmosphere.radialLight }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

      {/* Subtile Kamera-/Sucher-Markierungen in den Ecken */}
      <div aria-hidden className="pointer-events-none absolute inset-2 opacity-15">
        <div className="absolute top-0 left-0 size-2 border-t border-l border-white" />
        <div className="absolute top-0 right-0 size-2 border-t border-r border-white" />
        <div className="absolute bottom-0 left-0 size-2 border-b border-l border-white" />
        <div className="absolute bottom-0 right-0 size-2 border-b border-r border-white" />
      </div>

      {/* Audio-Equalizer / Soundwave-Silhouette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-3.5 bottom-2.5 flex h-4 items-end justify-between gap-0.5 opacity-20"
      >
        {SOUND_BAR_HEIGHTS.map((baseHeight, i) => {
          const height = SOUND_BAR_HEIGHTS[(i + waveOffset) % SOUND_BAR_HEIGHTS.length]
          return (
            <span
              key={i}
              className="w-0.5 rounded-full bg-white/70"
              style={{ height: `${height}%` }}
            />
          )
        })}
      </div>

      {/* Weicher Abdunklungsverlauf für perfekte Lesbarkeit */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

      {/* Virality Score Badge (falls nicht 'bare') */}
      {!bare && (
        <span className="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-white/15 ring-inset backdrop-blur-md">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {clip.virality_score}
          <span className="text-[9px] font-normal text-white/60">Score</span>
        </span>
      )}

      {/* Dauer-Badge */}
      {showDuration ? (
        <span className="absolute right-2 bottom-2 rounded-full bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-white/85 ring-1 ring-white/15 ring-inset backdrop-blur-md tabular-nums">
          {durationText}
        </span>
      ) : null}

      {/* Moderne Creator-Untertitel */}
      <div
        className="absolute inset-x-2.5 text-center leading-snug font-extrabold tracking-tight"
        style={{
          bottom: `${Math.max(16, 100 - style.positionY)}%`,
          fontSize: captionSize,
          color: style.color,
          textTransform: style.uppercase ? 'uppercase' : 'none',
          filter:
            'drop-shadow(0 2px 6px rgba(0,0,0,0.9)) drop-shadow(0 1px 2px rgba(0,0,0,0.95))',
        }}
      >
        {words.map((word, index) => {
          const isAccent = index === accent
          if (isAccent) {
            return (
              <span
                key={`${word}-${index}`}
                className={cn(
                  'inline-block rounded-md px-1.5 py-0.5 my-0.5 font-black tracking-tight',
                  atmosphere.highlightBg,
                  atmosphere.highlightRing,
                  atmosphere.highlightText,
                  'ring-1 shadow-sm backdrop-blur-xs',
                )}
                style={{
                  boxShadow: atmosphere.glowShadow,
                }}
              >
                {word}{' '}
              </span>
            )
          }
          return (
            <span key={`${word}-${index}`} className="text-white/95">
              {word}{' '}
            </span>
          )
        })}
      </div>

      {/* Schwebender Play-Knopf bei Hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="flex size-9 items-center justify-center rounded-full border border-white/30 bg-white/20 text-white opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all duration-300 scale-75 group-hover:scale-100 group-hover:opacity-100">
          <Play className="size-3.5 fill-white translate-x-0.5" />
        </div>
      </div>

      {!bare && (
        <span className="absolute inset-x-3 bottom-2 truncate text-center text-[10px] font-medium text-white/70">
          {clip.title}
        </span>
      )}
    </div>
  )
}
