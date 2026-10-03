import type { Clip } from '@/types/database'

type ShowcaseClip = Pick<
  Clip,
  'title' | 'virality_score' | 'start_seconds' | 'end_seconds'
>

function formatClock(totalSeconds: number) {
  const seconds = Math.round(totalSeconds)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Der Beispielclip als Gerät.
 *
 * Ein Glasrahmen statt eines schwarzen Kastens: Auf dem dunklen Grund
 * verschwand die alte Fassung als Loch in der Seite. Das Bild sitzt in 9:16,
 * weil genau das das Ergebnis ist — kein Ausschnitt eines Querformats.
 * Die Plaketten sind `.glass-chip`, weil darunter immer Videobild liegt.
 */
export function ClipShowcase({
  clip,
  videoSrc,
}: {
  clip: ShowcaseClip
  videoSrc: string
}) {
  return (
    <figure className="glass-tile relative mx-auto w-full max-w-[300px] rounded-[2.25rem] p-2">
      <div className="relative aspect-[9/16] overflow-hidden rounded-[1.8rem] bg-black">
        <video
          className="size-full object-cover opacity-90"
          src={videoSrc}
          muted
          autoPlay
          loop
          playsInline
          aria-label={`Beispielclip: ${clip.title}`}
        />

        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-between">
          <span className="glass-chip rounded-full px-2 py-0.5 text-[0.6875rem] font-medium">
            9:16
          </span>
          <span className="glass-chip rounded-full px-2 py-0.5 font-mono text-[0.6875rem] tabular-nums">
            {formatClock(clip.end_seconds - clip.start_seconds)}
          </span>
        </div>

        <figcaption className="glass-chip pointer-events-none absolute inset-x-4 bottom-5 rounded-xl px-3 py-2 text-center text-sm leading-snug font-semibold text-balance">
          {clip.title}
        </figcaption>
      </div>
    </figure>
  )
}
