import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowRight,
  Brain,
  CalendarClock,
  Captions,
  Check,
  CircleSlash,
  Crop,
  Gauge,
  Quote,
  Scissors,
  Send,
  Timer,
  Type,
  Upload,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LandingNav } from '@/components/landing/LandingNav'
import { ClipShowcase } from '@/components/landing/ClipShowcase'
import { PlatformIcon } from '@/components/social/PlatformIcon'
import { MOCK_VIDEO_SRC, mockClips } from '@/lib/mock-data'
import { PLANS } from '@/lib/stripe/plans'
import type { SocialPlatform } from '@/types/database'
import { cn } from '@/lib/utils'

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden">
      <LandingNav />

      <main className="flex-1">
        <Hero />
        <Proof />
        <Difference />
        <HowItWorks />
        <Features />
        <Honesty />
        <Pricing />
        <ClosingCta />
      </main>

      <SiteFooter />
    </div>
  )
}

/* ========================================================================== */

function Hero() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-10 pb-20 sm:px-6 lg:pt-16">
      {/* Zweispaltig statt zentriert: Der Text behält eine lesbare Zeilenlänge,
          und das Produktbild bekommt echten Raum. Es läuft rechts über den
          Containerrand hinaus — dadurch wirkt die Oberfläche größer als der
          Ausschnitt und der Blick wird in sie hineingezogen. */}
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,30rem)_1fr] lg:gap-12">
        <div>
          <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl">
            Ein Video rein.
            <br />
            Zehn Shorts raus.
            <br />
            <span className="text-muted-foreground">Ohne dich.</span>
          </h1>

          <p className="mt-6 max-w-md text-base leading-relaxed text-pretty text-muted-foreground">
            OmegaClip schneidet Langform-Videos zu vertikalen Kurzclips und veröffentlicht
            sie selbstständig auf deinen Kanälen. Andere Tools hören beim Download auf —
            hier läuft die Kette bis zum fertigen Post durch.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              size="lg"
              className="gap-1.5"
              nativeButton={false}
              render={<Link href="/dashboard" />}
            >
              Loslegen
              <ArrowRight className="size-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={<Link href="/dashboard/projects/mock" />}
            >
              Editor ansehen
            </Button>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Kostenlos starten · 10 Render-Minuten inklusive · keine Kreditkarte
          </p>
        </div>

        <div className="relative lg:-mr-32 xl:-mr-52">
          <div className="overflow-hidden rounded-xl border bg-card shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
            <Image
              src="/hero-editor.png"
              alt="Der OmegaClip-Editor: links die 9:16-Vorschau mit animierten Untertiteln, rechts die nach Viralitäts-Score sortierten Clips und das Transkript, unten die Timeline."
              width={1600}
              height={1000}
              priority
              className="w-full"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

/* ========================================================================== */

/**
 * Der Beweis.
 *
 * Nicht „wir machen animierte Untertitel", sondern ein laufender Clip, der es
 * vorführt — gerendert mit derselben Composition wie im Editor. Daneben steht
 * die Begründung der KI, warum sie genau dieses Segment gewählt hat. Das belegt
 * beide Versprechen auf einmal: die Ausgabe und die Nachvollziehbarkeit.
 */
function Proof() {
  const clip = mockClips[0]

  return (
    <section id="beweis" className="scroll-mt-20 border-t bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <SectionLabel>Ein echtes Ergebnis</SectionLabel>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Das kommt dabei raus.
        </h2>
        <p className="mt-4 max-w-xl text-base text-pretty text-muted-foreground">
          Kein Screenshot, kein vorgerendertes GIF — der Clip unten läuft gerade wirklich,
          mit derselben Engine, die auch deine Videos rendert.
        </p>

        <div className="mt-12 grid items-center gap-10 lg:grid-cols-[320px_minmax(0,36rem)] lg:gap-14">
          <ClipShowcase clip={clip} videoSrc={MOCK_VIDEO_SRC} />

          <div className="min-w-0 max-w-xl">
            <div className="flex items-start gap-4">
              <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25 ring-inset">
                <span className="text-xl leading-none font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                  {clip.virality_score}
                </span>
                <span className="mt-0.5 text-xs leading-none text-emerald-600/70 dark:text-emerald-400/70">
                  Score
                </span>
              </div>

              <div className="min-w-0">
                <h3 className="text-xl leading-snug font-medium text-balance">{clip.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Sekunde {Math.round(clip.start_seconds)} bis{' '}
                  {Math.round(clip.end_seconds)} aus einem 10-Minuten-Podcast
                </p>
              </div>
            </div>

            {clip.score_reasoning ? (
              <figure className="mt-7 border-l-2 pl-4">
                <figcaption className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Quote className="size-3" />
                  Warum die KI diesen Moment gewählt hat
                </figcaption>
                <blockquote className="text-sm leading-relaxed text-pretty">
                  {clip.score_reasoning}
                </blockquote>
              </figure>
            ) : null}

            <div className="mt-7">
              <p className="mb-2 text-xs text-muted-foreground">
                Automatisch erzeugte Beschreibung und Hashtags
              </p>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                {clip.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {clip.hashtags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="font-normal">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ========================================================================== */

const OTHER_TOOLS = ['Video hochladen', 'Transkribieren', 'Clips erkennen', 'Clips schneiden']
const OMEGA_CHAIN = [
  'Video hochladen',
  'Transkribieren',
  'Clips erkennen',
  'Clips schneiden',
  'Einplanen',
]

/**
 * Das Alleinstellungsmerkmal, sichtbar gemacht.
 *
 * Zwei Ketten nebeneinander: Links bricht sie sichtbar ab, rechts läuft sie
 * durch. Kein Absatz Text erklärt das besser als diese Gegenüberstellung.
 */
function Difference() {
  return (
    <section id="unterschied" className="scroll-mt-20 border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <SectionLabel>Der Unterschied</SectionLabel>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Die meisten Tools hören genau da auf, wo die Arbeit anfängt.
        </h2>
        <p className="mt-4 max-w-xl text-base text-pretty text-muted-foreground">
          Clips schneiden können viele. Danach liegen zehn Dateien im
          Download-Ordner — und das Einplanen, Hochladen und Beschriften machst wieder du.
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <ChainCard
            title="Andere Tools"
            steps={OTHER_TOOLS}
            ending={{ label: 'Herunterladen. Ende.', tone: 'dead' }}
          />
          <ChainCard
            title="OmegaClip"
            steps={OMEGA_CHAIN}
            ending={{ label: 'Veröffentlicht.', tone: 'live' }}
            highlighted
          />
        </div>
      </div>
    </section>
  )
}

function ChainCard({
  title,
  steps,
  ending,
  highlighted,
}: {
  title: string
  steps: readonly string[]
  ending: { label: string; tone: 'dead' | 'live' }
  highlighted?: boolean
}) {
  const isLive = ending.tone === 'live'

  return (
    <div
      className={cn(
        'rounded-xl border p-6 shadow-xs',
        highlighted ? 'border-foreground/20 bg-card shadow-sm' : 'bg-card',
      )}
    >
      <p className="mb-5 text-sm font-medium">{title}</p>

      <ol className="flex flex-col">
        {steps.map((step) => (
          <li key={step} className="flex items-center gap-3 py-1.5">
            {/* Die senkrechte Linie trägt die Aussage: Sie verbindet die
                Schritte und macht sichtbar, wo die Kette endet. */}
            <span className="relative flex w-4 shrink-0 justify-center">
              <span className="absolute top-1/2 bottom-[-1rem] w-px bg-border" />
              <span className="relative size-1.5 rounded-full bg-muted-foreground/40" />
            </span>
            <span className="text-sm text-muted-foreground">{step}</span>
          </li>
        ))}

        <li className="flex items-center gap-3 pt-1.5">
          <span className="flex w-4 shrink-0 justify-center">
            {isLive ? (
              <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500/15">
                <Check className="size-2.5 text-emerald-600 dark:text-emerald-400" />
              </span>
            ) : (
              <CircleSlash className="size-4 text-muted-foreground/60" />
            )}
          </span>
          <span
            className={cn(
              'text-sm font-medium',
              isLive ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
            )}
          >
            {ending.label}
          </span>
        </li>
      </ol>
    </div>
  )
}

/* ========================================================================== */

const STEPS = [
  {
    icon: Upload,
    title: 'Verbinden',
    body: 'Datei hochladen, Google-Drive-Link einfügen oder ein YouTube-Video verbinden, an dem du die Rechte hältst.',
  },
  {
    icon: Brain,
    title: 'Verstehen',
    body: 'Transkription auf Wortebene, dann bewertet Claude jedes Segment nach Viralitätspotenzial — mit Begründung, nicht als Blackbox.',
  },
  {
    icon: Scissors,
    title: 'Schneiden',
    body: 'Reframing auf 9:16 mit aktiver Sprechererkennung, dazu animierte Untertitel. Jeder Schnitt bleibt im Editor korrigierbar.',
  },
  {
    icon: Send,
    title: 'Veröffentlichen',
    body: 'Automatisch ab einem Score, den du festlegst — oder mit Freigabe, wenn du lieber vorher draufschaust.',
  },
] as const

function HowItWorks() {
  return (
    <section className="border-t bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <SectionLabel>Ablauf</SectionLabel>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Was zwischen Upload und Veröffentlichung passiert
        </h2>

        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-card text-sm font-semibold tabular-nums shadow-xs">
                  {index + 1}
                </span>
                <step.icon className="size-4 text-muted-foreground" />
              </div>
              <h3 className="text-base font-medium">{step.title}</h3>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ========================================================================== */

const FEATURES = [
  {
    icon: Type,
    title: 'Transkript auf Wortebene',
    body: 'Jedes Wort mit eigenem Zeitstempel. Nur so lässt sich das gerade gesprochene Wort hervorheben — und im Text statt auf der Timeline schneiden.',
  },
  {
    icon: Gauge,
    title: 'Score mit Begründung',
    body: 'Jedes Segment bekommt 1 bis 100 und zwei Sätze dazu, was den Clip trägt und was ihn herunterzieht. Du kannst die Einschätzung prüfen.',
  },
  {
    icon: Crop,
    title: 'Reframing auf 9:16',
    body: 'Die Kamera folgt dem aktiven Sprecher, glättet über Szenen und schneidet an Szenengrenzen hart. Die Position bleibt manuell korrigierbar.',
  },
  {
    icon: Captions,
    title: 'Vier Untertitel-Vorlagen',
    body: 'Hormozi, Karaoke, Minimal und Beast — Schrift, Farbe, Kontur, Position und Animation frei einstellbar, mit Vorschau ohne Wartezeit.',
  },
  {
    icon: Zap,
    title: 'Auto-Publish ab Score',
    body: 'Lege pro Kanal fest, ab welchem Score ohne Rückfrage veröffentlicht wird. Alles darunter landet zur Freigabe in der Queue.',
  },
  {
    icon: CalendarClock,
    title: 'Queue und Kalender',
    body: 'Clips werden über den Tag verteilt statt im Block gepostet. Du siehst, was wann rausgeht, und kannst jederzeit umplanen.',
  },
  {
    icon: Timer,
    title: 'Abrechnung nach Minuten',
    body: 'Bezahlt wird die Cliplänge, nicht die Renderdauer. Schlägt ein Render fehl, wird das Guthaben automatisch zurückgebucht.',
  },
] as const

function Features() {
  return (
    <section id="funktionen" className="scroll-mt-20 border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <SectionLabel>Funktionen</SectionLabel>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Was drin ist
        </h2>

        <div className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="flex flex-col gap-2.5">
              <feature.icon className="size-4 text-muted-foreground" />
              <h3 className="text-base font-medium">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                {feature.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ========================================================================== */

const LIMITS: Array<{
  platform: SocialPlatform
  name: string
  limit: string
  instead: string
}> = [
  {
    platform: 'tiktok',
    name: 'TikTok',
    limit:
      'Vollautomatisches Veröffentlichen erlaubt TikTok erst nach einem bestandenen Content-Posting-Audit.',
    instead:
      'Bis dahin landet jeder Clip fertig geschnitten als Entwurf in deiner TikTok-Inbox. Du tippst einmal auf „Posten".',
  },
  {
    platform: 'youtube',
    name: 'YouTube Shorts',
    limit:
      'Ohne abgeschlossenes Google-Compliance-Audit lädt die API ausschließlich als „privat" hoch, und es gibt ein Tageskontingent.',
    instead:
      'Der Scheduler kennt das Kontingent und verteilt Uploads darüber, statt in ein Limit zu laufen.',
  },
  {
    platform: 'instagram',
    name: 'Instagram Reels',
    limit:
      'Meta verlangt ein Professional-Konto, eine verknüpfte Facebook-Seite und ein App Review, das zwei bis vier Wochen dauert.',
    instead:
      'Danach läuft es vollautomatisch — 100 Beiträge pro 24 Stunden, deren Stand wir vor jedem Post abfragen.',
  },
]

/**
 * Der Abschnitt, den sonst niemand hat.
 *
 * Dieselbe Information wirkt gegenteilig, je nachdem wann sie kommt: Wer
 * „Set it and forget it" kauft und erst danach merkt, dass TikTok nur Entwürfe
 * bekommt, fühlt sich getäuscht. Wer es vorher liest, fühlt sich ernst
 * genommen.
 */
function Honesty() {
  return (
    <section className="border-t bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <SectionLabel>Ehrlich gesagt</SectionLabel>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Was wir dir nicht versprechen
        </h2>
        <p className="mt-4 max-w-xl text-base text-pretty text-muted-foreground">
          Vollautomatisch geht nicht überall — nicht weil wir es nicht gebaut hätten, sondern
          weil die Plattformen es begrenzen. Lieber du weißt das vorher als hinterher.
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {LIMITS.map((entry) => (
            <div key={entry.platform} className="rounded-xl border bg-card p-5 shadow-xs">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg border bg-muted/50">
                  <PlatformIcon
                    platform={entry.platform}
                    className="size-4 text-muted-foreground"
                  />
                </div>
                <span className="text-sm font-medium">{entry.name}</span>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-pretty text-muted-foreground">
                {entry.limit}
              </p>

              <p className="mt-3 flex gap-2 border-t pt-3 text-sm leading-relaxed text-pretty">
                <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{entry.instead}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ========================================================================== */

function Pricing() {
  return (
    <section id="preise" className="scroll-mt-20 border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <SectionLabel>Preise</SectionLabel>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Bezahlt wird, was tatsächlich Kosten verursacht
        </h2>
        <p className="mt-4 max-w-xl text-base text-pretty text-muted-foreground">
          Render-Minuten und verbundene Kanäle. Keine Staffelung nach Funktionen, die dich
          zum nächsten Tarif drängt.
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => {
            const isFeatured = plan.tier === 'pro'
            return (
              <div
                key={plan.tier}
                className={cn(
                  'transition-ui flex flex-col rounded-xl border bg-card p-5 shadow-xs hover:shadow-sm',
                  isFeatured && 'border-foreground/20 shadow-sm',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{plan.name}</span>
                  {isFeatured ? (
                    <Badge variant="secondary" className="font-normal">
                      Beliebt
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl leading-none font-semibold tracking-tight">
                    {plan.priceMonthly} €
                  </span>
                  <span className="text-sm text-muted-foreground">/ Monat</span>
                </div>

                {/* `flex-1` lässt die Merkmalsliste den Überschuss aufnehmen, damit
                    die Buttons aller vier Karten auf einer Linie stehen — die
                    Tarife haben unterschiedlich viele Punkte. */}
                <ul className="mt-5 flex flex-1 flex-col gap-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={isFeatured ? 'default' : 'outline'}
                  size="sm"
                  className="mt-6 w-full"
                  nativeButton={false}
                  render={<Link href="/dashboard" />}
                >
                  {plan.priceMonthly === 0 ? 'Kostenlos starten' : `${plan.name} wählen`}
                </Button>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ========================================================================== */

function ClosingCta() {
  return (
    <section className="border-t bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6">
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Dein nächstes Video hat schon zehn Shorts in sich.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-base text-pretty text-muted-foreground">
          Lade es hoch und sieh dir an, welche Momente OmegaClip findet.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button
            size="lg"
            className="gap-1.5"
            nativeButton={false}
            render={<Link href="/dashboard" />}
          >
            Loslegen
            <ArrowRight className="size-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link href="/dashboard/projects/mock" />}
          >
            Erst den Editor ansehen
          </Button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          10 Render-Minuten kostenlos · keine Kreditkarte
        </p>
      </div>
    </section>
  )
}

/* ========================================================================== */

function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-xs text-muted-foreground sm:px-6">
        <span>Verarbeite nur Videos, an denen du die Rechte hältst.</span>
        <span>© {new Date().getFullYear()} OmegaClip</span>
      </div>
    </footer>
  )
}

/** Kleines Kennzeichen über jeder Abschnittsüberschrift — gibt der langen Seite Takt. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-muted-foreground">{children}</p>
}
