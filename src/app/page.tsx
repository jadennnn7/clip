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
import { PLATFORM_LABEL } from '@/lib/social-labels'
import { CREDIT_PACKS, getPlan, TRIAL } from '@/lib/stripe/plans'
import { yearlyBillingAvailable } from '@/lib/stripe/availability'
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
  'Monatlich kündbar',
] as const

function Hero() {
  return (
    // `--hero-tail`: wie weit der dunkle Grund unter der Belegzeile
    // weiterläuft. Die Bühne darunter steht nicht mehr in ihm, sondern rückt
    // um genau diesen Betrag (weniger `--hero-gap`) wieder hinauf — sie liegt
    // also auf dem Planeten unter dem Horizont. Getrennt, weil sie beim
    // Scrollen klebt: `overflow: hidden` hier fängt `sticky` ab.
    <section className="relative [--hero-gap:2.5rem] [--hero-tail:32rem] sm:[--hero-tail:48rem] lg:[--hero-gap:3.5rem] lg:[--hero-tail:59rem]">
      <div className="relative isolate w-full overflow-hidden bg-black">
        {/* Kosmischer Nachthimmel: dezent abgedunkelt (ca. 35–40 % Deckkraft)
            mit linearem Maskierungsverlauf nach unten, damit der Sternenhimmel
            sanft hinter dem Text steht und über dem Horizont weich ausläuft. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,#000_55%,transparent_92%)]"
        >
          <NightSky className="absolute inset-0" />
          <div className="absolute inset-0 bg-black/40" />
        </div>

        {/* Der Horizont (`.hero-sky`): der Rand eines riesigen dunklen
            Planeten als feine Linie in Logo-Blau, knapp unter der
            Belegzeile, ohne Lichtschein. Statisch, kein Shader, kein Video:
            Der Hero kostet die Grafikkarte nichts. Die Bühne darunter steht
            auf dem Planeten. */}
        <div aria-hidden className="hero-sky">
          <div className="hero-horizon" />
          <div className="hero-rim" />
        </div>
        <div
          aria-hidden
          className="ambient pointer-events-none absolute inset-x-0 bottom-0 h-96 bg-none [mask-image:linear-gradient(to_bottom,transparent,#000_78%)]"
        />

        {/* Mindestens einen Bildschirm hoch, Text darin mittig: Die Animation
            darunter beginnt erst unterhalb des ersten Bildschirms. */}
        <div className="relative flex min-h-[calc(100svh+var(--hero-tail)-var(--hero-gap))] flex-col justify-center px-4 pt-28 pb-[var(--hero-tail)] sm:px-6 lg:pt-32">
          <div className="mx-auto w-full max-w-6xl text-center">
            {/* Plakette, Headline und Lead treten beim Wegscrollen zurück
                (`.hero-exit`). Eingabeleiste und Animation darunter nicht:
                Die Leiste ist Glas, und `opacity`/`filter` an einem Vorfahren
                nähme ihr den Grund dahinter. */}
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
                  Die Polsterung unten schützt Unterlängen vor `bg-clip-text`.
                  Die Pointe steht allein darunter, mittig wie ein Untertitel
                  unter dem Bild.
                  Die Botschaft ist „läuft ohne dich", ruhig und seriös gesagt:
                  „Autopilot" heißt, Ocuris findet, schneidet und postet, der
                  Creator muss nichts tun. Was Ocuris ist, sagen die
                  Kapitelmarke darüber und der Lead darunter. Keine Zahl Clips
                  (die Animation zeigt fünf). */}
              <h1 className="mx-auto mt-7 max-w-5xl font-display text-[clamp(2.4rem,12vw,2.6rem)] leading-[0.95] font-semibold tracking-[-0.04em] text-balance sm:text-6xl lg:text-[4rem] xl:text-[4.5rem]">
                <span
                  className="rise-in block bg-gradient-to-b from-white via-white to-white/80 bg-clip-text pb-[0.06em] text-transparent"
                  style={enter(60)}
                >
                  Deine Shorts.
                </span>
                <span className="rise-in mt-[0.14em] block" style={enter(120)}>
                  <CaptionMark>Auf Autopilot.</CaptionMark>
                </span>
              </h1>

              <p
                className="rise-in mx-auto mt-7 max-w-2xl text-base leading-relaxed text-pretty text-white/60 sm:text-[1.0625rem]"
                style={enter(180)}
              >
                Ocuris findet die stärksten Momente deines Videos, schneidet
                sie zu Shorts und postet sie automatisch über die Woche
                verteilt auf TikTok, YouTube und Instagram.
              </p>
            </div>

            <LinkBar
              className="rise-in mx-auto mt-9 max-w-xl"
              style={enter(240)}
            />

            <ul
              className="rise-in mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[0.8125rem] text-white/60"
              style={enter(300)}
            >
              {HERO_PROOF.map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check
                    aria-hidden
                    strokeWidth={2.5}
                    className="size-3.5 shrink-0 text-brand"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

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
 * Echtes Glas, auch wenn darunter wenig läuft — die
 * Unschärfe hat etwas zu zeigen.
 */
function LinkBar({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={cn('w-full', className)}
      style={style}
    >
      <Link
        href="/dashboard"
        className="glass glass-interactive group flex w-full items-center gap-3 rounded-full p-2 pl-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
      >
        <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
        <Link2 aria-hidden className="size-[1.125rem] shrink-0 text-brand/80" />
        {/* Auf 375 px brach der lange Satz mitten im Wort ab
            („Video-Link einfüg…") — die kurze Fassung sagt dasselbe,
            der Zusatz kommt erst, wenn Platz dafür da ist. */}
        <span className="min-w-0 flex-1 truncate text-sm text-white/55">
          <span className="sm:hidden">Link einfügen</span>
          <span className="hidden sm:inline">
            Video-Link einfügen oder Datei hochladen
          </span>
        </span>
        <span className="liquid liquid-brand transition-ui flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white group-hover:brightness-[1.06] sm:px-5">
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
 * die Ergänzung zur Headline mit den unterstützten Plattformen, kein
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
  { text: 'Du lieferst das Video. Ocuris liefert' },
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
          className="scroll-glow pointer-events-none absolute inset-x-[8%] -bottom-10 -z-10 h-48 rounded-full bg-[radial-gradient(closest-side,rgb(0_160_252/0.22),rgb(0_160_252/0.07)_60%,transparent)]"
        />
        <div className="scroll-tilt">
          <ClipGallery />
        </div>
      </div>

      <p className="mt-5 px-4 text-center text-xs text-white/45">
        Echte Clips aus Ocuris · je die ersten 8 Sekunden, ohne Ton
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
        lead="Ocuris macht alles von selbst. Und wo du doch eingreifen willst, geht das ohne Schnittprogramm."
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
        lead="Wenn dein Material lang ist und deine Kanäle kurze Clips brauchen, passt Ocuris."
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

/**
 * Tarife mit Monats-/Jahres-Umschalter — siehe `PricingSection`. Ob der
 * Jahrestarif buchbar ist, weiß nur der Server (Stripe-Preis-IDs).
 */
function Pricing() {
  return (
    <Section id="preise">
      <PricingSection yearlyAvailable={yearlyBillingAvailable()} />
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
        Nein. Ocuris liefert fertige Clips — mit Untertiteln, Bildausschnitt,
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
        60 Credits — alle Clips, die Ocuris daraus schneidet, sind enthalten,
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
    question: 'Veröffentlicht Ocuris wirklich automatisch?',
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
    question: 'Wie kann ich Ocuris testen?',
    answer: (
      <>
        Einmalig mit {TRIAL.credits} Minuten Video und {TRIAL.exports}{' '}
        Exporten, ohne Kreditkarte. Das reicht, um an einem echten Video zu
        sehen, welche Momente Ocuris findet und wie die Clips aussehen. Die
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

/**
 * Der Abschluss als Karte, in die von unten tiefes Logo-Blau steigt —
 * schlicht, ohne Bild. Vorher standen hier der Nachthimmel aus dem alten
 * Hero („mach da bitte was anderes hin nicht den himmel“), kurz das
 * Logo-Zeichen als Kontur und davor ein 3D-Korridor aus Clips, der die
 * Untertitel zu Fetzen schnitt.
 */
function ClosingCta() {
  return (
    <Section id="start">
      <div className="relative">
        {/* Zwei Lichtinseln halb hinter der Fläche: Erst durch sie wird die
            Kante der Karte sichtbar. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 left-[8%] -z-10 size-72 rounded-full bg-[radial-gradient(closest-side,rgb(0_160_252/0.22),transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-[6%] -bottom-20 -z-10 size-80 rounded-full bg-[radial-gradient(closest-side,rgb(0_160_252/0.14),transparent)]"
        />

        {/* `glass-tile` statt `glass`: Der Verlauf füllt die Karte, eine
            Unschärfe hätte nichts zu zeigen. `before:z-20` hebt die
            Lichtkante über den Verlauf. */}
        <div className="glass-tile scroll-zoom overflow-hidden rounded-[2rem] text-center before:z-20">
          {/* Von unten Mitte nach außen: das Logo-Blau, nur immer stärker
              mit Schwarz gemischt — derselbe Ton, kein zweites Blau. Unten
              eine Lichtnaht. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_90%_at_50%_120%,#0088d6_0%,#006097_22%,#003351_45%,#00131e_68%,#000_90%)]"
          >
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[rgb(0_160_252/0.6)] to-transparent" />
          </div>

          <div className="relative z-10 flex min-h-[36rem] flex-col items-center justify-center px-6 py-16 sm:min-h-[40rem] sm:px-12 sm:py-20">
            <ChapterMarker id="start" className="mb-5 justify-center" />
            <h2 className="mx-auto max-w-2xl font-display text-4xl leading-[1.05] font-semibold tracking-[-0.035em] text-balance text-white sm:text-5xl">
              Dein nächstes Video hat schon{' '}
              <CaptionMark on="scroll">zehn Shorts</CaptionMark> in sich.
            </h2>
            <p className="mx-auto mt-5 max-w-md text-base text-pretty text-white/70 sm:text-[1.0625rem]">
              Lade es hoch und sieh dir an, welche Momente Ocuris findet.
            </p>

            {/* Ohne Eingabefeld — auf Wunsch nur oben im Hero. Aber ein
                Knopf: Wer bis hier gelesen hat, soll nicht zurückscrollen
                müssen. Derselbe blaue Tropfen wie „Gratis starten" oben. */}
            <Link
              href="/dashboard"
              className="liquid liquid-brand transition-ui group mt-8 inline-flex h-12 items-center gap-2 rounded-full px-7 text-[0.9375rem] font-semibold text-white outline-none hover:brightness-[1.06] focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              Gratis starten
              <ArrowRight
                aria-hidden
                className="size-4 transition-transform duration-300 ease-(--ease-out-quint) group-hover:translate-x-0.5"
              />
            </Link>
            <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-white/75">
              {FREE_ALLOWANCE} · keine Kreditkarte
            </p>
          </div>
        </div>
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
              Du fügst einen Link ein. Ocuris bewertet jeden Moment und
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
            <span>© {new Date().getFullYear()} Ocuris</span>
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
        'pointer-events-none absolute -z-10 rounded-full bg-[radial-gradient(closest-side,rgb(0_160_252/0.08),transparent)]',
        className,
      )}
    />
  )
}
