'use client'

import React from 'react'
import Link from 'next/link'
import { CheckCheck, Clock, Coins, Download, Link2 } from 'lucide-react'
import { MotionConfig } from 'motion/react'
import { CaptionMark } from '@/components/landing/CaptionMark'
import { ChapterMarker } from '@/components/landing/Chapters'
import { Button } from '@/components/ui/button'
import {
  CREDIT_PACKS,
  FEATURED_TIER,
  INCLUDED_EVERYWHERE,
  PLANS,
  ROLLOVER_NOTE,
  TRIAL,
  videoTimeFor,
  type Plan,
} from '@/lib/stripe/plans'
import type { SubscriptionTier } from '@/types/database'
import { cn } from '@/lib/utils'

/**
 * Wofür die Credits konkret reichen — Material, das Besucher kennen, statt
 * einer nackten Minutenzahl.
 */
const EXAMPLE: Record<SubscriptionTier, string> = {
  free: `ein Video bis ${TRIAL.credits} Minuten`,
  starter: '5 halbstündige Videos',
  pro: '5 Podcastfolgen mit 90 Minuten',
  agency: '20 einstündige Webinare',
}

const euro = new Intl.NumberFormat('de-DE')
const PACK = CREDIT_PACKS[0]

/** Zeile / Spalte der n-ten Karte in einem Raster mit `columns` Spalten. */
function gridArea(index: number, columns: number) {
  return `${Math.floor(index / columns) + 1} / ${(index % columns) + 1}`
}

const stagger = (index: number) => ({ '--i': index }) as React.CSSProperties

/**
 * Tarife aus `PLANS`, nur Monatspreise — einen Jahrestarif gibt es nicht.
 *
 * Alles im Logo-Blau statt im Standard-Blau der Vorlage: Der empfohlene Tarif
 * hebt sich über echtes Glas mit blau aufleuchtender Kante und eine
 * Lichtinsel dahinter ab. Grün bleibt für Status reserviert, nicht für
 * Aufzählungen.
 *
 * Die Karten unterscheiden sich nur in Credits und Kanälen — mehr trennt die
 * Tarife auch nicht. Was alle können, steht einmal darunter.
 */
export function PricingSection() {
  const featuredIndex = PLANS.findIndex((plan) => plan.tier === FEATURED_TIER)

  return (
    <MotionConfig reducedMotion="user">
      <header className="mx-auto max-w-2xl text-center">
        <ChapterMarker id="preise" className="scroll-rise justify-center" />
        <h2 className="scroll-rise mt-5 font-display text-4xl leading-[1.15] font-semibold tracking-[-0.035em] text-balance text-white sm:text-5xl">
          Der Tarif, der zu deinem <CaptionMark on="scroll">Kanal</CaptionMark>{' '}
          passt
        </h2>
        <p className="scroll-rise mx-auto mt-5 max-w-xl text-base leading-relaxed text-pretty text-white/60 sm:text-lg">
          Bezahlt wird, wie viel Video du verarbeiten lässt: 1 Credit pro Minute. Die Clips daraus,
          die Bearbeitung und die Exporte sind inklusive.
        </p>
      </header>

      <div className="relative mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Lichtinsel hinter dem empfohlenen Tarif. Absolut positioniert, aber
            über die Rasterlinien platziert — sie liegt so immer genau hinter
            der Karte, egal in welcher Spalte die gerade steht. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(closest-side,rgb(111_186_253/0.24),transparent)] [grid-area:var(--at)] md:[grid-area:var(--at-md)] lg:[grid-area:var(--at-lg)]"
          style={
            {
              '--at': gridArea(featuredIndex, 1),
              '--at-md': gridArea(featuredIndex, 2),
              '--at-lg': gridArea(featuredIndex, 4),
            } as React.CSSProperties
          }
        />

        {PLANS.map((plan, index) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            featured={index === featuredIndex}
            style={stagger(index)}
          />
        ))}
      </div>

      <div className="glass-tile scroll-rise mt-4 rounded-3xl px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
          <h3 className="shrink-0 text-sm font-medium text-white">In allen Tarifen</h3>
          <ul className="grid flex-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {INCLUDED_EVERYWHERE.map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm text-white/65">
                <span className="grid size-6 shrink-0 place-content-center rounded-full bg-brand/10 ring-1 ring-brand/40 ring-inset">
                  <CheckCheck aria-hidden className="size-3.5 text-brand" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="scroll-rise mx-auto mt-6 max-w-3xl text-center text-xs leading-relaxed text-pretty text-white/45">
        Preise inklusive Umsatzsteuer. {ROLLOVER_NOTE} Mehr gebraucht? {PACK.label} für{' '}
        {euro.format(PACK.price)}&nbsp;€ zusätzlich zum Abo — sie verfallen nicht.
      </p>
    </MotionConfig>
  )
}

function PlanCard({
  plan,
  featured,
  style,
}: {
  plan: Plan
  featured: boolean
  style: React.CSSProperties
}) {
  const trial = plan.priceEnv === null

  const highlights = [
    { icon: Coins, text: `${euro.format(plan.credits)} Credits ${trial ? 'einmalig' : 'pro Monat'}` },
    { icon: Clock, text: `${videoTimeFor(plan.credits)} Video${trial ? '' : ' im Monat'}` },
    { icon: Download, text: trial ? `${TRIAL.exports} Exporte` : 'Exporte inklusive' },
    {
      icon: Link2,
      text: `${plan.socialAccounts} verbundene${plan.socialAccounts === 1 ? 'r Kanal' : ' Kanäle'}`,
    },
  ]

  return (
    <article
      className={cn(
        'scroll-rise relative flex flex-col rounded-3xl p-6',
        featured ? 'glass landing-featured' : 'glass-tile',
      )}
      style={style}
    >
      {featured ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-brand-light/80 to-transparent"
        />
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-2xl font-semibold tracking-tight text-white">{plan.name}</h3>
        {featured ? (
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-[0.6875rem] font-semibold text-brand-ink shadow-[0_0_14px_-2px_rgb(111_186_253/0.7)]">
            Empfohlen
          </span>
        ) : null}
      </div>
      <p className="mt-2 min-h-[2.5rem] text-sm leading-snug text-pretty text-white/55">{plan.audience}</p>

      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="text-4xl leading-none font-semibold tracking-[-0.03em] text-white tabular-nums">
          {euro.format(plan.priceMonthly)}&nbsp;€
        </span>
        <span className="text-sm text-white/55">{trial ? 'zum Testen' : '/ Monat'}</span>
      </p>
      <p className="mt-2 h-4 text-xs text-white/45">
        {trial ? 'Einmalig, ohne Kreditkarte' : 'Monatlich kündbar'}
      </p>

      <Button
        variant={featured ? 'prominent' : 'outline'}
        className={cn('mt-6 h-11 w-full rounded-full text-sm', featured && 'liquid-brand dark:hover:brightness-[1.06]')}
        nativeButton={false}
        render={<Link href="/dashboard" />}
      >
        {trial ? 'Kostenlos testen' : `${plan.name} wählen`}
      </Button>

      <ul className="mt-6 flex flex-col gap-3">
        {highlights.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3 text-sm font-medium text-white/80">
            <Icon aria-hidden className="size-[1.125rem] shrink-0 text-brand" strokeWidth={1.75} />
            {text}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-6">
        <div className="border-t border-white/[0.08] pt-5">
          <h4 className="text-xs font-medium text-white/45">Reicht zum Beispiel für</h4>
          <p className="mt-1.5 text-sm text-white/75">{EXAMPLE[plan.tier]}</p>
        </div>
      </div>
    </article>
  )
}
