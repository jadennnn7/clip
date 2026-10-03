'use client'

import Image from 'next/image'
import { ArrowRight, Sparkles, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatCredits } from '@/lib/credit-format'
import { CREDIT_PACKS, PLANS, TRIAL, videoTimeFor } from '@/lib/stripe/plans'
import type { BillingUsage } from '@/stores/billing-usage-store'

interface CreditMeterProps {
  usage: BillingUsage
  /** Öffnet den Aufladen-Dialog; das Popover schließt sich dabei selbst. */
  onTopUp: () => void
}

const LOWEST_PRICE = Math.min(...PLANS.filter((plan) => plan.priceMonthly > 0).map((plan) => plan.priceMonthly))
const day = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' })

/**
 * Guthaben-Popover: soll Lust auf Aufladen machen, nicht nur Status melden.
 *
 * Große Restzahl, konkreter Nutzen („reicht für … Video“) und ein
 * auffälliger CTA — der Balken allein verkauft nichts. Sonst im Blau des
 * Logos, das auch das Credit-Symbol selbst trägt; Gelb und Rot nur als
 * Warnung, wenn es knapp wird.
 *
 * Maßstab für „knapp“ ist ein Monatskontingent, im Gratis-Test der Test.
 */
export function CreditMeter({ usage, onTopUp }: CreditMeterProps) {
  const subscribed = usage.monthlyCredits > 0
  const reference = subscribed ? usage.monthlyCredits : TRIAL.credits
  const percentLeft = Math.min(100, (usage.available / reference) * 100)
  const low = percentLeft <= 25
  const critical = percentLeft <= 10
  const barTone = critical ? 'bg-destructive' : low ? 'bg-amber-500 dark:bg-amber-400' : 'bg-primary'

  return (
    <div className="relative overflow-hidden">
      {/* Atmosphäre */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 size-40 -translate-x-1/2 rounded-full bg-brand-deep/[0.12] blur-3xl dark:bg-brand/[0.16]"
      />

      <div className="relative flex flex-col items-center pt-1 pb-1 text-center">
        <div className="relative mb-3">
          <div
            aria-hidden
            className="absolute inset-0 scale-150 rounded-full bg-brand-deep/[0.14] blur-xl dark:bg-brand/[0.22]"
          />
          <Image
            src="/Token.png"
            alt=""
            width={64}
            height={64}
            className="relative size-14 object-contain drop-shadow-[0_8px_24px_rgb(0_0_0/0.45)]"
            priority
          />
        </div>

        <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {subscribed ? 'Deine Credits' : 'Gratis-Test'}
        </p>
        <p
          className={cn(
            'mt-1 font-display text-4xl font-semibold tracking-tight tabular-nums',
            critical ? 'text-destructive' : low ? 'text-amber-600 dark:text-amber-300' : 'text-foreground',
          )}
        >
          {formatCredits(usage.available)}
          <span className="ml-1.5 text-base font-medium text-muted-foreground">übrig</span>
        </p>

        {critical ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive ring-1 ring-destructive/25">
            <Zap className="size-3 fill-current" />
            Fast leer — neue Videos brauchen Credits
          </p>
        ) : low ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-200">
            <Zap className="size-3" />
            Weniger als ein Viertel übrig
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Reicht für <span className="font-medium text-foreground/85">{videoTimeFor(usage.available)} Video</span>
          </p>
        )}
      </div>

      <div className="relative mt-4 space-y-2">
        <div className="h-2 overflow-hidden rounded-full bg-primary/[0.12] ring-1 ring-primary/[0.1]">
          <div
            className={cn('h-full rounded-full transition-[width] duration-500', barTone)}
            style={{ width: `${percentLeft}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
          <span>{subscribed ? `${formatCredits(usage.planCredits)} aus dem Tarif` : `${formatCredits(usage.planCredits)} von ${TRIAL.credits} Test-Credits`}</span>
          {usage.packCredits > 0 ? <span>{formatCredits(usage.packCredits)} nachgekauft</span> : null}
        </div>
      </div>

      <ul className="relative mt-4 space-y-1.5 rounded-xl bg-foreground/[0.04] p-3 ring-1 ring-foreground/[0.06]">
        {[
          '1 Credit = 1 Minute Video, die Clips daraus inklusive',
          usage.trialExportsLeft !== null
            ? `Noch ${usage.trialExportsLeft} von ${TRIAL.exports} Gratis-Exporten, im Tarif unbegrenzt`
            : 'Bearbeitung und Exporte inklusive',
          subscribed && usage.nextGrantAt
            ? `+${formatCredits(usage.monthlyCredits)} Credits am ${day.format(new Date(usage.nextGrantAt))}`
            : 'Tarife füllen jeden Monat neu auf',
        ].map((line) => (
          <li key={line} className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <Sparkles className="mt-0.5 size-3 shrink-0 text-primary" />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <Button
        size="lg"
        variant="prominent"
        className={cn(
          'relative mt-4 h-11 w-full gap-2 rounded-full text-sm font-semibold tracking-tight',
          'shadow-[0_12px_28px_-14px_rgb(36_147_255/0.55)] dark:shadow-[0_12px_32px_-16px_rgb(111_186_253/0.5)]',
        )}
        onClick={onTopUp}
      >
        <Sparkles className="size-4" />
        {subscribed ? 'Mehr Credits' : 'Tarif wählen'}
        <ArrowRight className="size-4" />
      </Button>

      <p className="relative mt-2.5 text-center text-[10px] text-muted-foreground/70">
        {subscribed ? `Tarif wechseln oder ${CREDIT_PACKS[0].label} nachkaufen` : `Tarife ab ${LOWEST_PRICE} € · monatlich kündbar`}
      </p>
    </div>
  )
}
