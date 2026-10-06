import React from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Briefcase, Check, HandCoins, Link2, Megaphone, MonitorPlay, Plus, Users } from 'lucide-react'
import { CaptionMark } from '@/components/landing/CaptionMark'
import { MarkerLine } from '@/components/landing/Chapters'
import { LandingNav } from '@/components/landing/LandingNav'
import { PartnerCalculator } from '@/components/landing/PartnerCalculator'
import { PointerLight } from '@/components/landing/PointerLight'
import { AmbientLight, Section, SectionHeader, stagger } from '@/components/landing/Section'
import { SiteFooter } from '@/components/landing/SiteFooter'
import { PARTNER } from '@/lib/partner'
import { TRIAL } from '@/lib/stripe/plans'

const PERCENT = `${Math.round(PARTNER.rate * 100)} %`
const MIN_PAYOUT = `${PARTNER.minPayoutCents / 100} €`

export const metadata: Metadata = {
  title: 'Partnerprogramm — Ocuris',
  description: `Empfiehl Ocuris weiter und bekomm ${PERCENT} von jeder Zahlung deiner Empfehlungen, ${PARTNER.months} Monate lang. Kostenlos, ohne Bewerbung.`,
}

/**
 * Wer noch kein Konto hat, registriert sich und landet danach auf seiner
 * Partnerseite; wer angemeldet ist, kommt über den Proxy direkt hin.
 */
const GET_LINK = `/signup?redirect=${encodeURIComponent('/dashboard/partner')}`

const SECTION_LINKS = [
  { href: '#rechner', label: 'Rechner' },
  { href: '#so-gehts', label: 'So geht’s' },
  { href: '#fuer-wen', label: 'Für wen' },
  { href: '#konditionen', label: 'Konditionen' },
  { href: '#faq', label: 'FAQ' },
]

const enter = (delay: number) => ({ animationDelay: `${delay}ms` })

/**
 * Öffentliche Seite des Partnerprogramms — für Creator, Agenturen und alle,
 * deren Publikum Ocuris brauchen könnte. Dieselben Bausteine wie die
 * Landingpage, aber ohne das „lange Video": keine Kapitel-Timeline, die
 * Marken zählen Schritte statt Minuten. Alle Zahlen kommen aus `PARTNER`.
 */
export default function PartnerLandingPage() {
  return (
    <div className="landing-root dark ambient flex min-h-dvh flex-col overflow-x-clip bg-none text-white">
      <LandingNav links={SECTION_LINKS} cta={{ href: GET_LINK, label: 'Partner werden' }} chapters={false} />
      <PointerLight />

      <main className="flex-1">
        <Hero />
        <Calculator />
        <Steps />
        <Audiences />
        <Terms />
        <Faq />
        <ClosingCta />
      </main>

      <SiteFooter links={[{ href: '/', label: 'Startseite' }, { href: '/#preise', label: 'Preise' }, { href: '/#faq', label: 'FAQ' }]} />
    </div>
  )
}

/* ========================================================================== */

const HERO_PROOF = [
  `${PERCENT} für ${PARTNER.months} Monate`,
  `Auszahlung ab ${MIN_PAYOUT}`,
  'Kostenlos, ohne Bewerbung',
] as const

function Hero() {
  return (
    <section className="relative isolate px-4 pt-36 pb-16 sm:px-6 sm:pt-44 sm:pb-24">
      {/* Dasselbe Licht wie unter dem Hero der Landingpage, nur ohne Planet:
          Die Seite soll als Teil von Ocuris erkennbar sein, nicht als Kopie. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[34rem] w-[64rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(0_160_252/0.16),transparent)]"
      />
      <div className="mx-auto w-full max-w-4xl text-center">
        <MarkerLine lead={PERCENT} label="Partnerprogramm" className="rise-in justify-center" />
        <h1 className="mx-auto mt-7 max-w-4xl font-display text-[clamp(2.4rem,11vw,2.6rem)] leading-[0.98] font-semibold tracking-[-0.04em] text-balance sm:text-6xl lg:text-[4.25rem]">
          <span className="rise-in block bg-gradient-to-b from-white via-white to-white/80 bg-clip-text pb-[0.06em] text-transparent" style={enter(60)}>
            Empfiehl Ocuris.
          </span>
          <span className="rise-in mt-[0.14em] block" style={enter(120)}>
            <CaptionMark>Verdien mit.</CaptionMark>
          </span>
        </h1>
        <p className="rise-in mx-auto mt-7 max-w-2xl text-base leading-relaxed text-pretty text-white/60 sm:text-[1.0625rem]" style={enter(180)}>
          Du bekommst {PERCENT} von allem, was deine Empfehlungen bei Ocuris zahlen — {PARTNER.months} Monate lang.
          Für Creator, die über ihren Workflow sprechen, und Agenturen, deren Kunden mehr aus langen Videos machen wollen.
        </p>

        <div className="rise-in mt-9 flex flex-wrap items-center justify-center gap-3" style={enter(240)}>
          <Link
            href={GET_LINK}
            className="liquid liquid-brand transition-ui group inline-flex h-12 items-center gap-2 rounded-full px-7 text-[0.9375rem] font-semibold text-white outline-none hover:brightness-[1.06] focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            Partnerlink holen
            <ArrowRight aria-hidden className="size-4 transition-transform duration-300 ease-(--ease-out-quint) group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="#rechner"
            className="inline-flex h-12 items-center rounded-full px-6 text-[0.9375rem] font-medium text-white/75 outline-none transition-ui hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50"
          >
            Was bringt mir das?
          </Link>
        </div>

        <ul className="rise-in mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[0.8125rem] text-white/60" style={enter(300)}>
          {HERO_PROOF.map((item) => (
            <li key={item} className="flex items-center gap-1.5">
              <Check aria-hidden strokeWidth={2.5} className="size-3.5 shrink-0 text-brand" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ========================================================================== */

function Calculator() {
  return (
    <Section id="rechner">
      <AmbientLight className="top-20 right-[-16rem] size-[42rem]" />
      <SectionHeader
        marker={<MarkerLine lead="01" label="Rechner" className="scroll-rise" />}
        title="Was eine Empfehlung wert ist."
        lead="Schieb den Regler: So viel bringen dir die Kunden, die über deinen Link zu Ocuris kommen."
      />
      <PartnerCalculator className="scroll-rise mt-12" />
    </Section>
  )
}

/* ========================================================================== */

const STEPS = [
  {
    icon: Link2,
    title: 'Link holen',
    body: 'Leg ein kostenloses Konto an. Unter „Partnerprogramm“ steht dein persönlicher Link, fertig zum Kopieren.',
  },
  {
    icon: Megaphone,
    title: 'Teilen',
    body: `In der Videobeschreibung, im Newsletter, bei deinen Kunden. Wer innerhalb von ${PARTNER.cookieDays} Tagen ein Konto anlegt, gehört zu dir.`,
  },
  {
    icon: HandCoins,
    title: 'Verdienen',
    body: `${PERCENT} jeder Zahlung, ${PARTNER.months} Monate lang. Ab ${MIN_PAYOUT} überweisen wir, per Banküberweisung oder PayPal.`,
  },
] as const

function Steps() {
  return (
    <Section id="so-gehts">
      <SectionHeader
        marker={<MarkerLine lead="02" label="So geht’s" className="scroll-rise" />}
        title="Drei Schritte, kein Vertrag."
        lead="Keine Bewerbung, keine Mindestmenge. Dein Link funktioniert, sobald du ihn hast."
      />
      <ol className="mt-12 grid gap-4 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="glass-tile scroll-rise flex flex-col rounded-2xl p-5 sm:p-6" style={stagger(index)}>
            <div className="flex items-center justify-between">
              <span className="grid size-10 place-content-center rounded-xl bg-brand/10 ring-1 ring-brand/40 ring-inset">
                <step.icon aria-hidden className="size-5 text-brand" strokeWidth={1.75} />
              </span>
              <span aria-hidden className="font-mono text-xs text-white/35 tabular-nums">0{index + 1}</span>
            </div>
            <h3 className="mt-5 text-lg font-medium text-white">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-pretty text-white/60">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

/* ========================================================================== */

const AUDIENCES = [
  {
    icon: MonitorPlay,
    who: 'YouTuber & Tutorial-Creator',
    body: 'Du zeigst deinen Workflow, testest Tools oder erklärst Content-Produktion? Ocuris passt in jedes Video über Shorts, Podcasts und Reichweite.',
  },
  {
    icon: Briefcase,
    who: 'Agenturen & Freelancer',
    body: 'Deine Kunden haben Podcasts, Webinare oder Interviews und brauchen Shorts? Empfiehl Ocuris und verdien an jedem Abo mit.',
  },
  {
    icon: Users,
    who: 'Coaches, Communities & Newsletter',
    body: 'Du berätst Creator oder schreibst für sie? Gib ihnen ein Werkzeug, das ihnen Stunden im Schnitt spart.',
  },
] as const

function Audiences() {
  return (
    <Section id="fuer-wen">
      <AmbientLight className="top-10 left-[-16rem] size-[40rem]" />
      <SectionHeader
        marker={<MarkerLine lead="03" label="Für wen" className="scroll-rise" />}
        title="Für alle, denen Creator zuhören."
        lead="Am besten funktioniert ein Link dort, wo Leute ohnehin über Videos, Podcasts und Reichweite reden."
      />
      <ul className="mt-12 grid gap-4 md:grid-cols-3">
        {AUDIENCES.map((audience, index) => (
          <li key={audience.who} className="glass-tile scroll-rise rounded-2xl p-5 sm:p-6" style={stagger(index)}>
            <audience.icon aria-hidden className="size-6 text-brand" strokeWidth={1.75} />
            <h3 className="mt-4 text-base font-medium text-white">{audience.who}</h3>
            <p className="mt-2 text-sm leading-relaxed text-pretty text-white/60">{audience.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/* ========================================================================== */

const TERMS = [
  { label: 'Provision', value: PERCENT, note: 'vom Betrag ohne Umsatzsteuer' },
  { label: 'Laufzeit', value: `${PARTNER.months} Monate`, note: 'ab der ersten Zahlung des Kunden' },
  { label: 'Gilt für', value: 'Abos & Pakete', note: 'jede Zahlung, auch Credit-Nachkäufe' },
  { label: 'Zuordnung', value: `${PARTNER.cookieDays} Tage`, note: 'nach dem Klick auf deinen Link' },
  { label: 'Freigabe', value: `${PARTNER.holdDays} Tage`, note: 'nach der Zahlung, wegen Widerruf und Erstattung' },
  { label: 'Auszahlung', value: `ab ${MIN_PAYOUT}`, note: 'per Überweisung oder PayPal' },
] as const

function Terms() {
  return (
    <Section id="konditionen">
      <SectionHeader
        marker={<MarkerLine lead="04" label="Konditionen" className="scroll-rise" />}
        title="Alles auf einen Blick."
        lead="Dieselben Bedingungen für alle Partner — egal, ob du einen Kunden wirbst oder hundert."
      />
      <dl className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TERMS.map((term, index) => (
          <div key={term.label} className="glass-tile scroll-rise rounded-2xl p-5 sm:p-6" style={stagger(index % 3)}>
            <dt className="text-sm text-white/55">{term.label}</dt>
            <dd className="mt-1.5">
              <span className="font-display text-3xl font-semibold tracking-tight text-white">{term.value}</span>
              <span className="mt-1 block text-sm text-white/55">{term.note}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="scroll-rise mt-6 max-w-3xl text-xs leading-relaxed text-pretty text-white/45">
        Ausgeschlossen sind eigene oder doppelte Konten, Suchmaschinen-Anzeigen auf den Namen „Ocuris“ und unerwünschte
        Werbung. Erstattungen und Rückbuchungen werden mit der Provision verrechnet. Die vollständigen Bedingungen stehen
        in deinem Konto unter „Partnerprogramm“.
      </p>
    </Section>
  )
}

/* ========================================================================== */

const FAQ: Array<{ question: string; answer: React.ReactNode }> = [
  {
    question: 'Muss ich selbst Kunde sein?',
    answer: (
      <>
        Nein, ein kostenloses Konto genügt für deinen Link. Ausprobieren lohnt sich trotzdem: Mit dem Gratis-Test
        verarbeitest du {TRIAL.credits} Minuten Video, und wer das Tool selbst kennt, empfiehlt es überzeugender.
      </>
    ),
  },
  {
    question: 'Wer zählt als von mir geworben?',
    answer: (
      <>
        Jeder, der über deinen Link kommt und innerhalb von {PARTNER.cookieDays} Tagen ein Konto anlegt, sofern er vorher
        noch kein Abo bei Ocuris hatte. Klickt jemand mehrere Partnerlinks, zählt der letzte.
      </>
    ),
  },
  {
    question: 'Wann und wie werde ich bezahlt?',
    answer: (
      <>
        Jede Provision wird {PARTNER.holdDays} Tage nach der Zahlung des Kunden freigegeben — so lange laufen Widerruf
        und Erstattungen. Sind {MIN_PAYOUT} freigegeben, forderst du die Auszahlung in deinem Konto an; wir überweisen
        per Banküberweisung oder PayPal.
      </>
    ),
  },
  {
    question: 'Was passiert, wenn ein Kunde sein Geld zurückbekommt?',
    answer: (
      <>
        Dann entfällt die Provision für diese Zahlung, bei einer Teilerstattung anteilig. War sie schon ausgezahlt,
        verrechnen wir sie mit deinen nächsten Provisionen.
      </>
    ),
  },
  {
    question: 'Muss ich meinen Link als Werbung kennzeichnen?',
    answer: (
      <>
        Ja. Weil du für Empfehlungen Geld bekommst, ist dein Link Werbung. Kennzeichne ihn deutlich, etwa mit
        „Anzeige“ oder „Affiliate-Link“ — in der Beschreibung und, wenn du im Video darüber sprichst, auch dort.
      </>
    ),
  },
  {
    question: 'Darf ich Anzeigen schalten?',
    answer: (
      <>
        Ja, mit einer Ausnahme: keine Suchmaschinen-Anzeigen auf den Namen „Ocuris“ oder Schreibweisen davon. Spam und
        gekaufte Klicks sind ausgeschlossen.
      </>
    ),
  },
  {
    question: 'Wie ist das mit Steuern?',
    answer: (
      <>
        Provisionen sind Einnahmen, die du selbst versteuerst. Für die Auszahlung brauchen wir Name, Anschrift und
        Zahlungsdaten, bei Umsatzsteuerpflicht auch Steuernummer oder USt-IdNr.
      </>
    ),
  },
]

function Faq() {
  return (
    <Section id="faq">
      <AmbientLight className="top-0 left-[-16rem] size-[38rem]" />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <SectionHeader
          marker={<MarkerLine lead="05" label="FAQ" className="scroll-rise" />}
          title="Bevor du teilst"
          lead="Kurz beantwortet — so, wie das Programm heute funktioniert."
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
              <p className="px-5 pb-5 text-sm leading-relaxed text-pretty text-white/65 sm:px-6">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  )
}

/* ========================================================================== */

function ClosingCta() {
  return (
    <Section id="start">
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 left-[8%] -z-10 size-72 rounded-full bg-[radial-gradient(closest-side,rgb(0_160_252/0.22),transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-[6%] -bottom-20 -z-10 size-80 rounded-full bg-[radial-gradient(closest-side,rgb(0_160_252/0.14),transparent)]"
        />
        <div className="glass-tile scroll-zoom overflow-hidden rounded-[2rem] text-center before:z-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_90%_at_50%_120%,#0088d6_0%,#006097_22%,#003351_45%,#00131e_68%,#000_90%)]"
          >
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[rgb(0_160_252/0.6)] to-transparent" />
          </div>
          <div className="relative z-10 flex min-h-[30rem] flex-col items-center justify-center px-6 py-16 sm:min-h-[34rem] sm:px-12 sm:py-20">
            <MarkerLine lead="06" label="Loslegen" className="mb-5 justify-center" />
            <h2 className="mx-auto max-w-2xl font-display text-4xl leading-[1.05] font-semibold tracking-[-0.035em] text-balance text-white sm:text-5xl">
              Dein Link ist in <CaptionMark on="scroll">einer Minute</CaptionMark> fertig.
            </h2>
            <p className="mx-auto mt-5 max-w-md text-base text-pretty text-white/70 sm:text-[1.0625rem]">
              Konto anlegen, Link kopieren, teilen. Den Rest rechnet Ocuris für dich ab.
            </p>
            <Link
              href={GET_LINK}
              className="liquid liquid-brand transition-ui group mt-8 inline-flex h-12 items-center gap-2 rounded-full px-7 text-[0.9375rem] font-semibold text-white outline-none hover:brightness-[1.06] focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              Partnerlink holen
              <ArrowRight aria-hidden className="size-4 transition-transform duration-300 ease-(--ease-out-quint) group-hover:translate-x-0.5" />
            </Link>
            <p className="mt-4 text-xs text-white/75">Kostenlos · ohne Bewerbung · {PERCENT} für {PARTNER.months} Monate</p>
          </div>
        </div>
      </div>
    </Section>
  )
}
