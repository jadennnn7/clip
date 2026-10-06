import Image from 'next/image'
import { PlatformLogo } from '@/components/landing/PlatformLogo'
import { PLATFORM_LABEL } from '@/lib/social-labels'
import type { SocialPlatform } from '@/types/database'
import { cn } from '@/lib/utils'

/**
 * Das Bild der Anmeldeseite: der Veröffentlichungs-Feed eines Kontos.
 *
 * Die Startseite zeigt, wie aus einem Video Clips werden. Hier steht, was
 * danach kommt — das, worin Ocuris sich von reinen Schnitt-Tools
 * unterscheidet: Clips, die geplant, freigegeben und veröffentlicht werden.
 * Die Zustände sind genau die der Warteschlange im Produkt, keine Kennzahlen
 * und keine erfundenen Kundenstimmen.
 *
 * Eine Spalte aus Glaskarten läuft endlos nach oben, leicht in den Raum
 * gekippt; oben und unten blendet sie aus. Die Liste steht zweimal
 * untereinander, die Bewegung verschiebt genau um eine Liste — so schließt
 * die Schleife ohne Sprung. Reines CSS, ohne Bewegungswunsch steht sie still.
 */

type Status = 'published' | 'scheduled' | 'review' | 'ready'

interface FeedItem {
  title: string
  platform: SocialPlatform
  status: Status
  /** Zeitpunkt oder Score, rechts neben dem Status. */
  detail: string
  /** Standbild eines eigenen Clips in `public/gallery/` — keine Stockfotos. */
  still: string
}

const FEED: FeedItem[] = [
  { title: 'Der wahre Grund, warum 90 % aufgeben', platform: 'tiktok', status: 'published', detail: 'gerade eben', still: 'podcast' },
  { title: 'Mein größter Fehler als Creator', platform: 'youtube', status: 'scheduled', detail: 'Di · 18:00', still: 'still-talkshow' },
  { title: 'So fängst du 2026 an', platform: 'instagram', status: 'review', detail: 'Score 79', still: 'fresh' },
  { title: 'Niemand sagt dir das', platform: 'youtube', status: 'ready', detail: 'Score 94', still: 'streak' },
  { title: 'Zehn Sekunden, jeden Montag', platform: 'tiktok', status: 'scheduled', detail: 'Mi · 12:30', still: 'family' },
  { title: 'Das ändert alles', platform: 'instagram', status: 'published', detail: 'vor 2 Std.', still: 'tunnel' },
  { title: 'Du sprichst zu allen – deshalb hört keiner zu', platform: 'youtube', status: 'scheduled', detail: 'Do · 19:00', still: 'delivery' },
  { title: '40.000 Euro – und ich würde es wieder tun', platform: 'tiktok', status: 'published', detail: 'gestern', still: 'got-it' },
]

const STATUS: Record<Status, { label: string; dot: string }> = {
  published: { label: 'Veröffentlicht', dot: 'bg-emerald-400' },
  scheduled: { label: 'Geplant', dot: 'bg-white/80' },
  review: { label: 'Freigabe nötig', dot: 'bg-amber-400' },
  ready: { label: 'Neuer Clip', dot: 'bg-white/40' },
}

const CSS = `
@keyframes auth-feed{from{transform:translateY(0)}to{transform:translateY(-50%)}}
.auth-feed{animation:auth-feed 42s linear infinite}
@media (prefers-reduced-motion:reduce){.auth-feed{animation:none}}
`

export function PublishingFeed({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('relative select-none', className)}>
      <style>{CSS}</style>
      <div className="[perspective:1600px]">
        <div
          className="h-[clamp(18rem,50dvh,30rem)] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_18%,#000_78%,transparent)]"
          style={{ transform: 'rotateX(12deg) rotateY(-14deg) rotateZ(2deg)', transformStyle: 'preserve-3d' }}
        >
          <div className="auth-feed">
            {[0, 1].map((copy) => (
              <ul key={copy} className="flex flex-col gap-3 pb-3">
                {FEED.map((item) => (
                  <FeedRow key={item.title} item={item} />
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function FeedRow({ item }: { item: FeedItem }) {
  const status = STATUS[item.status]
  return (
    <li className="glass-tile flex items-center gap-3.5 rounded-2xl p-2.5 pr-4">
      <span className="relative h-[3.75rem] w-[2.125rem] shrink-0 overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10">
        {/* Sofort laden: Die Spalte läuft per Transform, spät geladene Bilder ploppten sonst leer ins Bild. */}
        <Image src={`/gallery/${item.still}.jpg`} alt="" fill sizes="34px" loading="eager" className="object-cover" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-white">{item.title}</span>
        <span className="mt-1 flex items-center gap-1.5 text-xs text-white/50">
          <PlatformLogo platform={item.platform} className="size-3.5 text-white/70" />
          {PLATFORM_LABEL[item.platform]}
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-white/85 ring-1 ring-white/10 ring-inset">
          <span className={cn('size-1.5 rounded-full', status.dot)} />
          {status.label}
        </span>
        <span className="text-[11px] text-white/45 tabular-nums">{item.detail}</span>
      </span>
    </li>
  )
}
