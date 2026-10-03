import { cn } from '@/lib/utils'
import type { Clip } from '@/types/database'

const BANDS = [
  { label: '< 50', min: 0, max: 49 },
  { label: '50er', min: 50, max: 59 },
  { label: '60er', min: 60, max: 69 },
  { label: '70er', min: 70, max: 79 },
  { label: '80er', min: 80, max: 89 },
  { label: '90+', min: 90, max: 100 },
]

/**
 * Wie sich die Scores aller Clips verteilen. Sechs Säulen, jede mit ihrer
 * Zahl — bei so wenigen Werten ist die Zahl lesbarer als jede Achse, und ein
 * Tooltip hätte nichts mehr zu sagen.
 */
export function ScoreDistribution({ clips }: { clips: Clip[] }) {
  const counts = BANDS.map((band) => clips.filter((clip) => clip.virality_score >= band.min && clip.virality_score <= band.max).length)
  const max = Math.max(1, ...counts)

  return (
    <figure>
      <div role="img" aria-label={BANDS.map((band, index) => `Score ${band.label}: ${counts[index]}`).join(', ')} className="flex h-32 items-end gap-3">
        {BANDS.map((band, index) => {
          const count = counts[index]
          return (
            <div key={band.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              <span className={cn('mb-1.5 text-[11px] tabular-nums', count ? 'text-foreground' : 'text-muted-foreground/60')}>{count}</span>
              <span
                aria-hidden
                className={cn(
                  'w-full max-w-8 rounded-t-[3px]',
                  count === 0 ? 'h-px bg-foreground/10' : 'bg-foreground/60',
                )}
                style={count ? { height: `${(count / max) * 78}%` } : undefined}
              />
            </div>
          )
        })}
      </div>
      <div aria-hidden className="flex gap-3 border-t border-foreground/15 pt-2">
        {BANDS.map((band) => (
          <span key={band.label} className="min-w-0 flex-1 text-center text-[11px] text-muted-foreground">{band.label}</span>
        ))}
      </div>
    </figure>
  )
}
