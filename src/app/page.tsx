import React from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Briefcase,
  Check,
  GraduationCap,
  Link2,
  Mic,
  MonitorPlay,
  Plus,
} from 'lucide-react'
import { LandingNav } from '@/components/landing/LandingNav'
import { LongformToShorts } from '@/components/landing/LongformToShorts'
import { PricingSection } from '@/components/landing/PricingSection'
import { PointerLight } from '@/components/landing/PointerLight'
import { NightSky } from '@/components/landing/NightSky'
import { SkyFilmStrip } from '@/components/landing/SkyFilmStrip'
import { BrandMark } from '@/components/landing/BrandMark'
import { CaptionMark } from '@/components/landing/CaptionMark'
import {
  ChapterMarker,
  type ChapterId,
} from '@/components/landing/Chapters'
import { ClipGallery } from '@/components/landing/ClipGallery'
import { FeatureBento } from '@/components/landing/FeatureBento'
import {
  LANDING_PLATFORMS,
  PlatformLogo,
} from '@/components/landing/PlatformLogo'
import { ShaderBackground } from '@/components/ui/hero-shader'
import {
  ImageStreamHero,
  type CorridorPath,
  type StreamImage,
} from '@/components/ui/image-stream-hero'
import { PLATFORM_LABEL } from '@/lib/social-labels'
import { CREDIT_PACKS, getPlan, TRIAL } from '@/lib/stripe/plans'
import { cn } from '@/lib/utils'

/**
 * Anker der Seite in Lesereihenfolge. Eine Quelle für Navbar und Fußzeile —
 * die Navbar ist eine Client-Komponente und bekommt die Liste als Prop, statt
 * sie zu exportieren: Ein Wert aus einem Client-Modul käme hier nur als
 * Client-Referenz an.
 */
const SECTION_LINKS = [
  { href: '#beispiele', label: 'Beispiele' },
  { href: '#funktionen', label: 'Funktionen' },
  { href: '#fuer-wen', label: 'Für wen' },
  { href: '#preise', label: 'Preise' },
  { href: '#faq', label: 'FAQ' },
]

/**
 * Der Gratis-Test steht an drei Stellen der Seite. Er kommt deshalb aus
 * `TRIAL` und nicht aus dem Text — vorher versprachen Hero und Abschluss
 * „10 Render-Minuten", der Tarif gab 8 Token her.
 */
const FREE_ALLOWANCE = `${TRIAL.credits} Minuten Video gratis testen`

export default function LandingPage() {
  return (
    // `dark` setzt das dunkle Token-Set für den ganzen Teilbaum, also auch im
    // Light Mode: Der Hero ist immer dunkel, und die Seite darunter soll aus
    // ihm herausfließen statt auf Weiß umzubrechen. `.ambient` ist der Grund
    // mit Korn, auf dem die Glaskacheln erst als Glas lesbar werden.
    // `bg-none` nimmt dem Grund seinen Lichtkegel: Der ist auf 40 % der
    // Elementhöhe ausgelegt und reichte auf der langen Seite weit unter den
    // Hero — direkt unter dessen Auslauf stand eine hellere Stufe. Licht
    // setzen hier die Abschnitte selbst.
    // `overflow-x-clip` statt `hidden`: Es schneidet die Lichtinseln am Rand
    // ab, ohne einen Scroll-Container zu erzeugen.
    <div className="landing-root dark ambient flex min-h-dvh flex-col overflow-x-clip bg-none text-white">
      {/* Die Navbar liegt `fixed` über der Seite und steht deshalb nicht
          im Hero-Fluss: Sie muss über allen Abschnitten liegen, nicht nur über
          dem Shader. */}
      <LandingNav links={SECTION_LINKS} />
      <PointerLight />

      {/* Die Reihenfolge folgt der Frage, die sich ein Besucher gerade
          stellt: Was ist das? → Wie viel Arbeit ist das? → Wie sieht das
          Ergebnis aus? → Was steckt drin? → Ist das für mich? → Was kostet
          es? */}
      <main className="flex-1">
        <Hero />
        <Statement />
        <Examples />
        <Features />
        <Audiences />
        <Pricing />
        <Faq />
        <ClosingCta />
      </main>

      <SiteFooter />
    </div>
  )
}

/* ========================================================================== */

/**
 * Gestaffelte Einblendung entlang der Lesefolge.
 *
 * Alles gleichzeitig einzublenden wirkt wie ein Sprung; nacheinander wirkt es
 * wie eine Führung. Die Abstände sind bewusst kurz — der Hero soll fertig
 * sein, bevor jemand bewusst darauf wartet. `.rise-in` aus `globals.css` hat
 * `animation-fill-mode: both`, der Startzustand gilt also schon vor dem Delay.
 */
const enter = (delay: number) => ({ animationDelay: `${delay}ms` })

/**
 * Staffelung der Scroll-Animationen (`.scroll-rise` & Co. in `globals.css`)
 * für Kacheln, die in derselben Reihe gleichzeitig ins Bild kommen.
 */
const stagger = (index: number) => ({ '--i': index }) as React.CSSProperties

/** Belege statt Behauptungen — jeder Punkt steht so auch weiter unten auf der Seite. */
const HERO_PROOF = [
  FREE_ALLOWANCE,
  'Keine Kreditkarte',
  'Veröffentlicht, nicht nur geschnitten',
] as const

function Hero() {
  return (
    // `--hero-tail`: wie weit der Shader unter der Belegzeile weiterläuft.
    // Die Bühne darunter steht nicht mehr in ihm, sondern rückt um genau
    // diesen Betrag (weniger `--hero-gap`) wieder hinauf — sie liegt also wie
    // vorher im Auslauf des Shaders. Getrennt, weil sie beim Scrollen klebt:
    // Im Shader ginge das nicht (`overflow: hidden` fängt `sticky` ab), und
    // die Scroll-Strecke würde seine Leinwand um über 1000 px strecken.
    <section className="relative [--hero-gap:2.5rem] [--hero-tail:32rem] sm:[--hero-tail:48rem] lg:[--hero-gap:3.5rem] lg:[--hero-tail:59rem]">
      {/* Der Shader ist immer dunkel (MeshGradient rendert auf #000000) — alle
          Farben hier sind deshalb fest auf Weiß/Schwarz gesetzt.
          Sein eigener Auslauf endet auf reinem Schwarz; der Grund der Seite
          ist aber `--ambient-base` mit Korn. Deshalb `fade={false}` und
          stattdessen ein Auslauf aus genau diesem Grund — sonst stünde unter
          dem Hero eine sichtbare Stufe. */}
      <ShaderBackground fade={false}>
        {/* Nachthimmel über dem Shader (`NightSky`, selbst gezeichnet in
            den Farben des früheren Hintergrundvideos) mit dem Jungen aus
            dessen 4K-Original (`.omegaclip-data/hero-originals/herovid.mp4`,
            freigestellt als `hero-boy.webp`). Läuft nach unten in den Grund
            aus und wird abgedunkelt, damit die weiße Schrift lesbar bleibt. */}
        {/* Wo der Himmel unten ausläuft, schien der Shader mit seinen hellen
            Flecken milchig durch — mal links, mal beim Jungen rechts. Diese
            Schicht dunkelt ihn dort ab und läuft selbst weich aus, darunter
            leuchtet er wie gewohnt. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[135svh] bg-black/75 [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-svh overflow-hidden [mask-image:linear-gradient(to_bottom,#000_70%,transparent)]"
        >
          <NightSky className="absolute inset-0" />
          <div className="absolute inset-0 bg-black/55" />
          {/* Das Horizontlicht hinter dem Jungen unten rechts, eigens
              gedämpft — im selben Rahmen, so sitzt der Verlauf bei jedem
              Seitenverhältnis auf ihm. */}
          <div className="absolute top-1/2 left-1/2 aspect-video min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse_26%_40%_at_85%_80%,rgb(0_0_0/0.55),transparent_75%)]" />
          {/* Der 16:9-Rahmen des früheren Videos (wie `object-cover`): Darin
              steht der Junge genau, wo er im Video stand — unten rechts,
              die Füße im Auslauf. Er steht über der Abdunkelung des
              Himmels, sonst ginge er darin unter. */}
          <div className="absolute top-1/2 left-1/2 aspect-video min-h-full min-w-full -translate-x-1/2 -translate-y-1/2">
            {/* eslint-disable-next-line @next/next/no-img-element -- dekorativ, 12 KB, Lage in Prozent des Rahmens */}
            <img
              src="/hero-boy.webp"
              alt=""
              draggable={false}
              className="absolute top-[74.31%] left-[80.55%] w-[5.18%] brightness-125"
            />
          </div>
        </div>
        {/* Die fertigen Clips kommen links aus der Eingabeleiste und
            steigen als Filmstreifen im Bogen in den Himmel — über der
            Abdunkelung, aber hinter dem Text (ab 75rem). Oben treibt es
            mit der Drehung des Himmels (`sky-motion.ts`). */}
        <SkyFilmStrip />
        <div
          aria-hidden
          className="ambient pointer-events-none absolute inset-x-0 bottom-0 h-96 bg-none [mask-image:linear-gradient(to_bottom,transparent,#000_78%)]"
        />
        {/* Licht, das dem Zeiger träge folgt (`PointerLight`, `.hero-light`).
            Vor dem Text im Baum, also hinter ihm. */}
        <div
          aria-hidden
          data-hero-light
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="hero-light" />
        </div>

        {/* Mindestens einen Bildschirm hoch, Text darin mittig: Die Animation
            darunter beginnt erst unterhalb des ersten Bildschirms. */}
        <div className="relative flex min-h-[calc(100svh+var(--hero-tail)-var(--hero-gap))] flex-col justify-center px-4 pt-28 pb-[var(--hero-tail)] sm:px-6 lg:pt-32">
          <div className="mx-auto w-full max-w-6xl text-center">
            {/* Plakette, Headline und Lead treten beim Wegscrollen zurück
                (`.hero-exit`). Eingabeleiste und Animation darunter nicht:
                Die Leiste ist Glas, und `opacity`/`filter` an einem Vorfahren
                nähme ihr den Shader als Grund. */}
            <div className="hero-exit">
              {/* Die erste Kapitelmarke der Seite: Hier beginnt das lange
                  Video, das die Headline verspricht (siehe `Chapters.tsx`). */}
              <ChapterMarker
                id="intro"
                label="KI-Videoclipping für Creator"
                className="rise-in justify-center"
              />

              {/* Der Verlauf von Weiß nach Weiß/80 über die Zeilenhöhe ist der
                  Grund, warum große Headlines „gedruckt" statt „getippt" wirken.
                  `bg-clip-text` beschneidet dabei Unterlängen, deshalb die
                  Polsterung unten — sonst fehlt dem „g" in „langes" der Schwanz. */}
              <h1 className="mx-auto mt-7 max-w-5xl font-display text-[2.6rem] leading-[0.95] font-semibold tracking-[-0.04em] text-balance sm:text-6xl lg:text-[4.25rem] xl:text-[4.75rem]">
                <span
                  className="rise-in block bg-gradient-to-b from-white via-white to-white/80 bg-clip-text pb-[0.06em] text-transparent"
                  style={enter(60)}
                >
                  Ein langes Video.
                </span>
                <span className="rise-in block pb-[0.06em]" style={enter(120)}>
                  <span className="bg-gradient-to-b from-white/55 to-white/30 bg-clip-text text-transparent">
                    Zehn Clips.
                  </span>{' '}
                  <CaptionMark>Null Aufwand.</CaptionMark>
                </span>
              </h1>

              <p
                className="rise-in mx-auto mt-6 max-w-2xl text-base leading-relaxed text-pretty text-white/60 sm:text-[1.0625rem]"
                style={enter(180)}
              >
                Clyp findet automatisch deine stärksten Momente, schneidet
                sie für Social Media und plant die Veröffentlichung — in einem
                einzigen Workflow.
              </p>
            </div>

            <LinkBar
              filmOrigin
              className="rise-in mx-auto mt-9 max-w-xl"
              style={enter(240)}
            />

            <ul
              className="rise-in mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/55"
              style={enter(300)}
            >
              {HERO_PROOF.map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check aria-hidden className="size-3 shrink-0 text-brand" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </ShaderBackground>

      {/* Die Überschrift als Bewegung: Oben ein langes Video, unten fünf
          fertige Shorts — dazwischen zerfällt es. Wo der Browser es kann,
          steuert der Scrollweg die Verwandlung (siehe `LongformToShorts`). */}
      <div className="relative -mt-[calc(var(--hero-tail)-var(--hero-gap))] px-4 pb-16 text-center sm:px-6 lg:pb-20">
        <LongformToShorts
          className="rise-in mx-auto max-w-4xl"
          style={enter(380)}
        />

        <PlatformStrip />
      </div>
    </section>
  )
}

/**
 * Das Eingabefeld als Einstieg — oben im Hero und noch einmal am Ende.
 *
 * Die gesamte Leiste ist der Link. Vorher war das Feld eine tote Fläche: Man
 * klickt genau dorthin, wo man den Link einfügen würde, und nichts passierte.
 * Echtes Glas, weil darunter immer etwas läuft (Shader, Bildstrom) — die
 * Unschärfe hat etwas zu zeigen.
 */
function LinkBar({
  className,
  style,
  filmOrigin,
}: {
  className?: string
  style?: React.CSSProperties
  /** Hier kommt der Filmstreifen des Heros heraus (`SkyFilmStrip`). */
  filmOrigin?: boolean
}) {
  return (
    <div
      className={cn('w-full', className)}
      style={style}
      data-film-origin={filmOrigin || undefined}
    >
      <Link
        href="/dashboard"
        className="glass glass-interactive group flex w-full items-center gap-2.5 rounded-full p-1.5 pl-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
      >
        <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
        <Link2 aria-hidden className="size-4 shrink-0 text-brand/80" />
        {/* Auf 375 px brach der lange Satz mitten im Wort ab
            („Video-Link einfüg…") — die kurze Fassung sagt dasselbe,
            der Zusatz kommt erst, wenn Platz dafür da ist. */}
        <span className="min-w-0 flex-1 truncate text-sm text-white/55">
          <span className="sm:hidden">Link einfügen</span>
          <span className="hidden sm:inline">
            Video-Link einfügen oder Datei hochladen
          </span>
        </span>
        <span className="liquid liquid-brand transition-ui flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white group-hover:brightness-[1.06] sm:px-5">
          Gratis starten
          <ArrowRight
            aria-hidden
            className="size-3.5 transition-transform duration-300 ease-(--ease-out-quint) group-hover:translate-x-0.5"
          />
        </span>
      </Link>
    </div>
  )
}

/**
 * Wohin veröffentlicht wird — genau diese drei, nichts weiter.
 *
 * Sitzt im Auslauf des Heros statt als eigenes Band darunter: Die Leiste ist
 * die Pointe der Headline („Null Aufwand" heißt: bis dorthin), kein
 * Logo-Streifen für Kunden, die es nicht gibt.
 */
function PlatformStrip() {
  return (
    <div className="relative mx-auto mt-14 flex max-w-3xl flex-col items-center gap-4 sm:mt-16">
      <p className="flex items-center gap-3 text-[0.6875rem] font-medium tracking-[0.18em] text-white/55 uppercase">
        <span
          aria-hidden
          className="h-px w-8 bg-gradient-to-r from-transparent to-white/30"
        />
        Veröffentlicht direkt auf
        <span
          aria-hidden
          className="h-px w-8 bg-gradient-to-l from-transparent to-white/30"
        />
      </p>
      <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 sm:gap-x-12">
        {LANDING_PLATFORMS.map((platform) => (
          <li
            key={platform}
            className="flex items-center gap-2.5 text-sm font-medium text-white/80"
          >
            <PlatformLogo platform={platform} className="size-5 text-white" />
            {PLATFORM_LABEL[platform]}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ========================================================================== */

/**
 * „Lichtsatz": der Nutzen in einem Satz, der beim Scrollen Wort für Wort
 * aufleuchtet (`.statement` in `globals.css`). Er steht zwischen der
 * Verwandlung und den drei Schritten — erst sieht man es, dann liest man es.
 * Nur Aussagen, die die Seite weiter unten belegt: Queue und Kalender
 * verteilen die Clips über die Tage, gepostet wird auf drei Plattformen.
 * Die Pointen tragen das Blau des Logos.
 */
const STATEMENT: Array<{ text: string; key?: boolean }> = [
  { text: 'Du lieferst das Video. Clyp liefert' },
  { text: 'deinen Feed', key: true },
  { text: '—' },
  { text: 'jeden Tag,', key: true },
  { text: 'auf drei Plattformen.' },
]

const STATEMENT_WORDS = STATEMENT.flatMap(({ text, key }) =>
  text.split(' ').map((word) => ({ word, key })),
)

function Statement() {
  return (
    <section className="relative px-4 py-24 sm:px-6 sm:py-36">
      <AmbientLight className="top-1/2 left-1/2 size-[44rem] -translate-x-1/2 -translate-y-1/2" />
      {/* Echte Wörter in einem Absatz: Vorleser lesen den Satz am Stück,
          markieren und kopieren geht wie bei jedem Text. */}
      <p className="statement mx-auto max-w-5xl text-center font-display text-[2.1rem] leading-[1.12] font-semibold tracking-[-0.035em] text-balance text-white sm:text-5xl lg:text-[3.75rem]">
        {STATEMENT_WORDS.map(({ word, key }, index) => (
          <React.Fragment key={index}>
            {index > 0 ? ' ' : null}
            <span
              className={cn('statement-word', key && 'text-brand')}
              style={
                {
                  '--p': index / (STATEMENT_WORDS.length - 1),
                } as React.CSSProperties
              }
            >
              {word}
            </span>
          </React.Fragment>
        ))}
      </p>
    </section>
  )
}

/* ========================================================================== */

/**
 * Das Ergebnis vor dem Werkzeug. Die Galerie läuft über die volle Breite —
 * sie liegt deshalb außerhalb des Inhaltsrahmens, nur der Kopf steht darin.
 */
function Examples() {
  return (
    <section
      id="beispiele"
      data-chapter="beispiele"
      className="relative scroll-mt-16 py-16 sm:py-24"
    >
      <div className="px-4 sm:px-6">
        <div className="mx-auto w-full max-w-6xl">
          <SectionHeader
            chapter="beispiele"
            title="So sieht aus, was rauskommt."
            lead="Hochformat, Untertitel Wort für Wort, der Bildausschnitt auf dem, der gerade spricht. Funktioniert mit allem, wo geredet wird."
          />
        </div>
      </div>

      {/* Die Perspektive sitzt am Rahmen, gekippt wird die Galerie darin.
          Das Licht darunter wächst mit, während sie sich aufrichtet. */}
      <div className="relative mt-10 [perspective:1400px]">
        <div
          aria-hidden
          className="scroll-glow pointer-events-none absolute inset-x-[8%] -bottom-10 -z-10 h-48 rounded-full bg-[radial-gradient(closest-side,rgb(111_186_253/0.22),rgb(36_147_255/0.07)_60%,transparent)]"
        />
        <div className="scroll-tilt">
          <ClipGallery />
        </div>
      </div>

      <p className="mt-5 px-4 text-center text-xs text-white/45">
        Echte Clips aus Clyp · je die ersten 8 Sekunden, ohne Ton
      </p>
    </section>
  )
}

/* ========================================================================== */

/**
 * Was ein Clip mitbringt und wo du eingreifen kannst — als Raster
 * (`FeatureBento`). Der Ablauf selbst steht schon im Film unter „So geht’s".
 */
function Features() {
  return (
    <Section id="funktionen">
      <AmbientLight className="top-40 right-[-18rem] size-[46rem]" />
      <SectionHeader
        chapter="funktionen"
        title="Alles drin, was ein Clip braucht."
        lead="Clyp macht alles von selbst. Und wo du doch eingreifen willst, geht das ohne Schnittprogramm."
      />
      <FeatureBento />
    </Section>
  )
}

/* ========================================================================== */

/** Querformat für die Kartenköpfe, direkt so zugeschnitten ausgeliefert. */
const landscape = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=640&h=400&fit=crop&crop=faces,center&q=70&auto=format`

const AGENCY_PLAN = getPlan('agency')

/**
 * Für wen — beschrieben über das Material, nicht über Berufsbezeichnungen:
 * Jede Karte sagt, was hineingeht und was herauskommt. Die Bilder bleiben
 * schwarz-weiß; Farbe auf dieser Seite sind die Clips und das Blau des Logos.
 */
const AUDIENCES = [
  {
    icon: Mic,
    who: 'Podcaster',
    from: 'Aus einer Folge',
    to: 'Shorts für die ganze Woche',
    body: 'Die Queue verteilt die Clips über die Tage, bis die nächste Folge erscheint.',
    image: landscape('1590602847861-f357a9332bbc'),
  },
  {
    icon: MonitorPlay,
    who: 'YouTuber & Streamer',
    from: 'Aus einem Video oder Stream',
    to: 'Clips für drei Plattformen',
    body: 'Ein Upload — derselbe Moment läuft auf YouTube Shorts, TikTok und Reels.',
    image: landscape('1598550476439-6847785fcea6'),
  },
  {
    icon: GraduationCap,
    who: 'Coaches & Experten',
    from: 'Aus einem Webinar oder Kurs',
    to: 'Deine besten Antworten als Clips',
    body: 'Der Score zeigt, welche Erklärung auch ohne den Rest der Stunde funktioniert.',
    image: landscape('1551836022-d5d88e9218df'),
  },
  {
    icon: Briefcase,
    who: 'Agenturen & Teams',
    from: 'Aus dem Material mehrerer Kunden',
    to: 'Viele Kanäle, Freigabe vor dem Post',
    body: `Im ${AGENCY_PLAN.name}-Tarif mit bis zu ${AGENCY_PLAN.socialAccounts} Kanälen und Brand-Kits für einheitliche Untertitel.`,
    image: landscape('1559523161-0fc0d8b38a7a'),
  },
]

function Audiences() {
  return (
    <Section id="fuer-wen">
      <AmbientLight className="top-10 left-[-16rem] size-[40rem]" />
      <SectionHeader
        chapter="fuer-wen"
        title="Für alle, die mehr reden als schneiden."
        lead="Wenn dein Material lang ist und deine Kanäle kurze Clips brauchen, passt Clyp."
      />

      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AUDIENCES.map((audience, index) => (
          <li
            key={audience.who}
            className="glass-tile scroll-rise group flex flex-col overflow-hidden rounded-2xl"
            style={stagger(index)}
          >
            <div className="relative h-40 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- dekorativ, per URL zugeschnitten */}
              <img
                src={audience.image}
                alt=""
                loading="lazy"
                draggable={false}
                className="absolute inset-0 size-full object-cover brightness-[0.8] contrast-110 grayscale transition-transform duration-700 ease-(--ease-out-quint) group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />
              <span className="glass-chip absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
                <audience.icon aria-hidden className="size-3.5" />
                {audience.who}
              </span>
            </div>

            <div className="flex flex-1 flex-col p-5">
              <p className="text-xs text-white/50">{audience.from}</p>
              <h3 className="mt-1 text-base leading-snug font-medium text-balance text-white">
                {audience.to}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-pretty text-white/60">
                {audience.body}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/* ========================================================================== */

/** Tarife mit Monats-/Jahres-Umschalter — siehe `PricingSection`. */
function Pricing() {
  return (
    <Section id="preise">
      <PricingSection />
    </Section>
  )
}

/* ========================================================================== */

const FAQ: Array<{ question: string; answer: React.ReactNode }> = [
  {
    question: 'Welche Videos kann ich verarbeiten?',
    answer: (
      <>
        Du lädst eine Datei hoch, fügst einen Google-Drive-Link ein (Freigabe
        „Jeder mit dem Link“) oder einen YouTube-Link. Verarbeite nur Videos,
        an denen du die Rechte hältst. Ein Video darf bis zu drei Stunden lang
        sein; Livestreams gehen erst nach ihrem Ende.
      </>
    ),
  },
  {
    question: 'Brauche ich Schnitt-Erfahrung?',
    answer: (
      <>
        Nein. Clyp liefert fertige Clips — mit Untertiteln, Bildausschnitt,
        Titel und Hashtags. Der Editor ist für Korrekturen da, nicht Pflicht:
        Wenn dir ein Clip passt, geht er so raus.
      </>
    ),
  },
  {
    question: 'Was ist ein Credit?',
    answer: (
      <>
        1 Credit ist 1 Minute Ausgangsvideo. Ein Podcast mit 60 Minuten kostet
        60 Credits — alle Clips, die Clyp daraus schneidet, sind enthalten,
        ebenso Bearbeitung und Exporte. Abgebucht wird erst, wenn die Clips
        fertig sind; scheitert der Download oder die Analyse, kostet das
        nichts. Angefangene Minuten zählen als ganze Minute.
      </>
    ),
  },
  {
    question: 'Was passiert mit Credits, die ich nicht verbrauche?',
    answer: (
      <>
        Bis zu einem Monatskontingent nimmst du in den nächsten Monat mit.
        Reicht es einmal nicht, kaufst du {CREDIT_PACKS[0].credits} Credits
        für {CREDIT_PACKS[0].price}&nbsp;€ dazu — zusätzlich zum Abo. Diese
        Credits verfallen nicht, auch nicht bei einem Tarifwechsel.
      </>
    ),
  },
  {
    question: 'Veröffentlicht Clyp wirklich automatisch?',
    answer: (
      <>
        Ja, Auto-Publish gibt es in jedem Tarif: ab einem Score, den du pro
        Kanal festlegst; darunter landet der Clip zur Freigabe. Bei TikTok
        bekommst du bis zum bestandenen Content-Posting-Audit fertige Entwürfe
        in die Inbox.
      </>
    ),
  },
  {
    question: 'Kann ich Clips vor dem Veröffentlichen bearbeiten?',
    answer: (
      <>
        Ja, im Editor: Schnittgrenzen setzt du direkt im Transkript, dazu
        wählst du die Untertitel-Vorlage und den Bildausschnitt für 9:16.
      </>
    ),
  },
  {
    question: 'Wie kann ich Clyp testen?',
    answer: (
      <>
        Einmalig mit {TRIAL.credits} Minuten Video und {TRIAL.exports}{' '}
        Exporten, ohne Kreditkarte. Das reicht, um an einem echten Video zu
        sehen, welche Momente Clyp findet und wie die Clips aussehen. Die
        Tarife stehen oben unter{' '}
        <Link
          href="#preise"
          className="rounded-sm text-white underline decoration-brand/60 underline-offset-4 outline-none hover:decoration-brand focus-visible:ring-2 focus-visible:ring-white/50"
        >
          Preise
        </Link>
        .
      </>
    ),
  },
]

/**
 * Native `<details>`: aufklappbar ohne eine Zeile Client-JS, per Tastatur
 * bedienbar und von der Seitensuche des Browsers auch zugeklappt gefunden.
 */
function Faq() {
  return (
    <Section id="faq">
      <AmbientLight className="top-0 left-[-16rem] size-[38rem]" />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <SectionHeader
          chapter="faq"
          title="Bevor du loslegst"
          lead="Kurz beantwortet — so, wie es im Produkt heute funktioniert."
        />

        <div className="flex flex-col gap-3">
          {FAQ.map((item) => (
            <details key={item.question} className="group glass-tile scroll-rise rounded-2xl">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left text-[0.9375rem] font-medium text-white outline-none select-none focus-visible:ring-2 focus-visible:ring-white/50 sm:px-6 [&::-webkit-details-marker]:hidden">
                {item.question}
                <span className="glass-lens flex size-7 shrink-0 items-center justify-center rounded-full transition-transform duration-300 ease-(--ease-out-quint) group-open:rotate-45">
                  <Plus aria-hidden className="size-3.5 text-white/80 group-open:text-brand" />
                </span>
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-pretty text-white/65 sm:px-6">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  )
}

/* ========================================================================== */

/** Standbilder aus den Clips der Galerie, 360 × 640, mit eingebrannten Untertiteln. */
const still = (name: string) => `/gallery/stream/${name}.jpg`

/**
 * Echte Shorts aus Clyp, je zwei Momente aus den Clips der Galerie.
 * Gesichter und Szenen wechseln sich ab, und kein Clip steht neben sich
 * selbst.
 */
const CLIP_STREAM: StreamImage[] = [
  { src: still('holiday-cap'), alt: 'Talkshow: Gast mit Baseballcap' },
  { src: still('tunnel-rain'), alt: 'Doku: Arbeiter mit Helmen im Regen' },
  { src: still('fresh-woman'), alt: 'Interview: Frau erzählt am Tisch' },
  { src: still('streak'), alt: 'Gaming: Streamer mit Zähler' },
  { src: still('podcast-mic'), alt: 'Podcast: Mann am Mikrofon' },
  { src: still('family-map'), alt: 'Story: animierte Landkarte' },
  { src: still('got-it-guest'), alt: 'Livestream: Gast staunt in die Kamera' },
  { src: still('fresh-table'), alt: 'Interview: Runde im Restaurant' },
  { src: still('holiday-guest'), alt: 'Talkshow: Gast im Trainingsanzug' },
  { src: still('got-it-phone'), alt: 'Livestream: Handy vor dem Mikrofon' },
  { src: still('delivery'), alt: 'Comedy: Mann mit Cap von unten gefilmt' },
  { src: still('family-university'), alt: 'Story: Universitätswappen' },
]

/**
 * Hochformat wie ein Short (9 : 16) und rundere Ecken als die Vorlage —
 * dieselbe Kartensprache wie die Clips im Produkt.
 */
const CLIP_STREAM_PATH: CorridorPath = { cardWidth: 14, cardHeight: 25, cardRadius: 1.1 }

/**
 * Der Abschluss nimmt die Überschrift wörtlich: Aus der Mitte strömen Shorts
 * auf den Betrachter zu. Der Strom bleibt schwarz-weiß — Farbe trägt hier
 * nur das Licht in Logo-Blau, nicht die Bilder. Oben und unten dunkeln
 * Kappen den Strom für die Schrift ab; die Mitte bleibt offen, dort entspringt er.
 */
function ClosingCta() {
  return (
    <Section id="start">
      <div className="relative">
        {/* Zwei Lichtinseln halb hinter der Fläche: Erst durch sie wird die
            Unschärfe des Glases sichtbar. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 left-[8%] -z-10 size-72 rounded-full bg-[radial-gradient(closest-side,rgb(111_186_253/0.22),transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-[6%] -bottom-20 -z-10 size-80 rounded-full bg-[radial-gradient(closest-side,rgb(111_186_253/0.14),transparent)]"
        />

        {/* `before:z-20` hebt die Lichtkante des Glases über die Karten —
            sonst läge der Strom auf ihr. */}
        <ImageStreamHero
          images={CLIP_STREAM}
          path={CLIP_STREAM_PATH}
          cards={11}
          speed={24}
          axis={55}
          className="glass scroll-zoom h-[40rem] rounded-[2rem] text-center before:z-20 sm:h-[42rem] [&_img]:brightness-90 [&_img]:contrast-110 [&_img]:grayscale"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgb(0_0_0/0.86),rgb(0_0_0/0.5)_32%,transparent_50%,transparent_62%,rgb(0_0_0/0.55)_76%,rgb(0_0_0/0.9))]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(255_255_255/0.08),transparent)]"
          />

          <div className="relative z-10 flex h-full flex-col items-center justify-between px-6 py-12 sm:px-12 sm:py-16">
            <div>
              <ChapterMarker id="start" className="mb-5 justify-center" />
              <h2 className="mx-auto max-w-2xl font-display text-4xl leading-[1.05] font-semibold tracking-[-0.035em] text-balance text-white sm:text-5xl">
                Dein nächstes Video hat schon{' '}
                <CaptionMark on="scroll">zehn Shorts</CaptionMark> in sich.
              </h2>
              <p className="mx-auto mt-5 max-w-md text-base text-pretty text-white/70 sm:text-[1.0625rem]">
                Lade es hoch und sieh dir an, welche Momente Clyp findet.
              </p>
            </div>

            {/* Dasselbe Feld wie oben: Wer bis hierher gelesen hat, soll
                nicht erst zurückscrollen müssen, um anzufangen. */}
            <div className="flex w-full max-w-xl flex-col items-center">
              <LinkBar />

              <p className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-white/60">
                {FREE_ALLOWANCE} · keine Kreditkarte ·
                <Link
                  href="/demo"
                  className="rounded-sm text-white underline decoration-brand/60 underline-offset-4 outline-none hover:decoration-brand focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  Erst den Editor ansehen
                </Link>
              </p>
            </div>
          </div>
        </ImageStreamHero>
      </div>
    </Section>
  )
}

/* ========================================================================== */

function SiteFooter() {
  return (
    <footer className="px-4 pt-8 pb-10 sm:px-6">
      <div className="mx-auto w-full max-w-6xl">
        {/* Eine Lichtnaht statt einer Rahmenlinie — dasselbe Detail wie die
            Oberkanten der Glasflächen. */}
        <div
          aria-hidden
          className="h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
        />

        <div className="flex flex-col gap-8 pt-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <Link
              href="/"
              className="-ml-1 inline-flex rounded-full py-1 pr-2 pl-1 outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <BrandMark />
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-white/55">
              Du fügst einen Link ein. Clyp bewertet jeden Moment und
              veröffentlicht die besten Clips — vollautomatisch.
            </p>
          </div>

          <nav aria-label="Fußzeile">
            <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
              {[...SECTION_LINKS, { href: '/login', label: 'Anmelden' }].map(
                (link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded-sm text-white/60 outline-none transition-ui hover:text-white focus-visible:ring-2 focus-visible:ring-white/50"
                    >
                      {link.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-2 text-xs text-white/55 sm:flex-row sm:justify-between">
          <p>Verarbeite nur Videos, an denen du die Rechte hältst.</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/impressum" className="rounded-sm underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-white/50">
              Impressum
            </Link>
            <Link href="/datenschutz" className="rounded-sm underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-white/50">
              Datenschutz
            </Link>
            <span>© {new Date().getFullYear()} Clyp</span>
          </p>
        </div>
      </div>
    </footer>
  )
}

/* ========================================================================== */

/**
 * Ein Abschnitt der Seite — und ein Kapitel des Videos, das die Seite ist:
 * `data-chapter` ist der Anker, an dem der Scrubber in der Navbar das
 * Kapitel beginnen lässt. Keine Rahmenlinien und keine Farbbänder zwischen
 * den Abschnitten: Auf dem dunklen Grund trennt Abstand, und Licht gliedert.
 */
function Section({
  id,
  children,
}: {
  id?: ChapterId
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      data-chapter={id}
      className="relative scroll-mt-16 px-4 py-16 sm:px-6 sm:py-24"
    >
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  )
}

/**
 * Kopf jedes Abschnitts: Kapitelmarke, Überschrift, Lead. Überall gleich,
 * damit die lange Seite einen Takt hat — die Marke nimmt die aus dem Hero
 * wieder auf, jede mit der Zeit, zu der ihr Kapitel beginnt.
 */
function SectionHeader({
  chapter,
  title,
  lead,
  className,
}: {
  chapter: ChapterId
  title: string
  lead?: string
  className?: string
}) {
  return (
    <header className={cn('max-w-2xl', className)}>
      {/* Marke, Überschrift und Lead kommen nacheinander herein. */}
      <ChapterMarker id={chapter} className="scroll-rise" />
      <h2
        className="scroll-rise mt-5 font-display text-4xl leading-[1.05] font-semibold tracking-[-0.035em] text-balance text-white sm:text-5xl"
        style={stagger(0.5)}
      >
        {title}
      </h2>
      {lead ? (
        <p
          className="scroll-rise mt-5 max-w-xl text-base leading-relaxed text-pretty text-white/60 sm:text-[1.0625rem]"
          style={stagger(1)}
        >
          {lead}
        </p>
      ) : null}
    </header>
  )
}

/**
 * Weiches Umgebungslicht hinter einem Abschnitt, leicht ins Logo-Blau
 * gezogen — so hallt der Hero über die ganze Seite nach.
 */
function AmbientLight({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute -z-10 rounded-full bg-[radial-gradient(closest-side,rgb(111_186_253/0.08),transparent)]',
        className,
      )}
    />
  )
}
