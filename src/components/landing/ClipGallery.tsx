import { GalleryVideo } from '@/components/landing/GalleryVideo'
import { PlatformLogo } from '@/components/landing/PlatformLogo'
import type { SocialPlatform } from '@/types/database'

interface Example {
  genre: string
  /** Datei in `public/gallery/`: `<slug>.mp4` und das Standbild `<slug>.jpg`. */
  slug: string
  /** Der Titel, den Clyp dem Clip gegeben hat. */
  title: string
  score: number
  platform: SocialPlatform
}

/**
 * Echte Clips aus Clyp, je die ersten acht Sekunden, stumm. Untertitel sind
 * eingebrannt — die Karte legt deshalb keine eigenen darüber. Acht Genres,
 * damit man sieht: Es funktioniert mit allem, wo geredet wird.
 */
const EXAMPLES: Example[] = [
  { genre: 'Doku', slug: 'tunnel', title: 'The current tunnel to stop flooding is three feet', score: 94, platform: 'youtube' },
  { genre: 'Talkshow', slug: 'holiday', title: 'I was. Where’s your holiday?', score: 89, platform: 'tiktok' },
  { genre: 'Gaming', slug: 'streak', title: 'How does the streak look, Chad?', score: 91, platform: 'youtube' },
  { genre: 'Podcast', slug: 'podcast', title: 'Was mich auch interessiert ist, Du hast auch, das habe ich…', score: 87, platform: 'instagram' },
  { genre: 'Comedy', slug: 'delivery', title: 'Are you a piece of delivery?', score: 92, platform: 'tiktok' },
  { genre: 'Story', slug: 'family', title: 'When he was 15 years old, his family left their comfortable…', score: 86, platform: 'youtube' },
  { genre: 'Livestream', slug: 'got-it', title: 'I did. I got it.', score: 88, platform: 'instagram' },
  { genre: 'Interview', slug: 'fresh', title: 'How do you find out it’s fresh?', score: 84, platform: 'tiktok' },
]

/**
 * Das Ergebnis, nicht das Werkzeug: ein Band fertiger Shorts, das langsam
 * durchläuft. Die Liste steht zweimal darin, `.gallery-track` verschiebt um
 * genau eine Länge — deshalb Abstand per `pr` statt `gap`, sonst fehlte
 * beim Übergang ein halber Zwischenraum. Beim Zeigen hält das Band an.
 */
export function ClipGallery() {
  return (
    <div className="gallery-band relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_7%,#000_93%,transparent)]">
      <ul className="gallery-track flex w-max py-4">
        {[...EXAMPLES, ...EXAMPLES].map((example, index) => (
          <ExampleCard
            key={index}
            example={example}
            duplicate={index >= EXAMPLES.length}
          />
        ))}
      </ul>
    </div>
  )
}

function ExampleCard({ example, duplicate }: { example: Example; duplicate: boolean }) {
  return (
    <li aria-hidden={duplicate || undefined} className="w-[11.5rem] shrink-0 pr-4 sm:w-[14.25rem] sm:pr-5">
      <figure>
        <div className="relative aspect-[9/16] overflow-hidden rounded-[1.35rem] bg-neutral-900 shadow-[0_28px_50px_-26px_rgb(0_0_0/0.9)] ring-1 ring-white/12">
          <GalleryVideo
            src={`/gallery/${example.slug}.mp4`}
            poster={`/gallery/${example.slug}.jpg`}
            label={duplicate ? '' : `Beispielclip ${example.genre}: ${example.title}`}
          />
          <div className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-black/45 to-transparent" />

          <div className="absolute inset-x-[5%] top-[4%] flex items-center justify-between">
            <span className="glass-chip inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold tabular-nums">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              {example.score}
            </span>
            <span className="glass-chip flex size-5 items-center justify-center rounded-full">
              <PlatformLogo platform={example.platform} className="size-2.5" />
            </span>
          </div>
        </div>

        <figcaption className="mt-3 flex items-baseline justify-between gap-2 px-0.5 text-xs">
          <span className="shrink-0 font-medium text-white/85">{example.genre}</span>
          <span className="truncate text-white/45">{example.title}</span>
        </figcaption>
      </figure>
    </li>
  )
}
