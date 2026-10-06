'use client'

import React from 'react'
import NumberFlow from '@number-flow/react'
import { motion, MotionConfig } from 'motion/react'
import { Slider } from '@/components/ui/slider'
import { netCents, PARTNER } from '@/lib/partner'
import { FEATURED_TIER, PLANS } from '@/lib/stripe/plans'
import type { SubscriptionTier } from '@/types/database'
import { cn } from '@/lib/utils'

const PAID_PLANS = PLANS.filter((plan) => plan.priceEnv !== null)
const MAX_CUSTOMERS = 100
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

/** Provision je Kunde und Monat in Euro — wie der Webhook sie bucht: netto, abgerundet auf den Cent. */
function commissionPerMonth(priceMonthly: number): number {
  const cents = priceMonthly * 100
  return Math.floor(netCents({ paid: cents, total: cents, tax: 0, taxComputed: false }) * PARTNER.rate) / 100
}

/**
 * Verdienst-Rechner der Partnerseite: Kunden und Tarif wählen, Provision pro
 * Monat und über die ganze Laufzeit sehen. Gerechnet wird mit denselben
 * Zahlen wie bei der echten Abrechnung (`PARTNER`, `netCents`).
 */
export function PartnerCalculator({ className }: { className?: string }) {
  const [customers, setCustomers] = React.useState(10)
  const [tier, setTier] = React.useState<SubscriptionTier>(FEATURED_TIER)
  const layoutId = React.useId()
  const plan = PAID_PLANS.find((item) => item.tier === tier) ?? PAID_PLANS[0]
  const perCustomer = commissionPerMonth(plan.priceMonthly)
  const monthly = perCustomer * customers

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn('glass-tile grid gap-8 rounded-3xl p-6 sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12 lg:p-10', className)}>
        <div className="flex flex-col gap-8">
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <label id="partner-customers" className="text-sm font-medium text-white">
                Zahlende Kunden über deinen Link
              </label>
              <span className="font-display text-3xl font-semibold tracking-tight text-white tabular-nums">
                {customers}
              </span>
            </div>
            <Slider
              aria-labelledby="partner-customers"
              value={[customers]}
              min={1}
              max={MAX_CUSTOMERS}
              step={1}
              onValueChange={(next) => setCustomers(Array.isArray(next) ? next[0] : next)}
              className="mt-5"
            />
            <div aria-hidden className="mt-2 flex justify-between text-xs text-white/40 tabular-nums">
              <span>1</span>
              <span>{MAX_CUSTOMERS / 2}</span>
              <span>{MAX_CUSTOMERS}</span>
            </div>
          </div>

          <div>
            <p id="partner-plan" className="text-sm font-medium text-white">Tarif deiner Kunden</p>
            <div
              role="radiogroup"
              aria-labelledby="partner-plan"
              className="glass-field relative mt-3 inline-flex max-w-full flex-wrap items-center gap-1 rounded-full p-1"
            >
              {PAID_PLANS.map((option) => {
                const active = option.tier === tier
                return (
                  <button
                    key={option.tier}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTier(option.tier)}
                    className={cn(
                      'relative flex h-10 items-center rounded-full px-4 text-sm font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white/50 sm:px-5',
                      active ? 'text-white' : 'text-white/60 hover:text-white',
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId={layoutId}
                        aria-hidden
                        className="absolute inset-0"
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      >
                        <span className="liquid liquid-brand block size-full rounded-full" />
                      </motion.span>
                    ) : null}
                    <span className="relative">
                      {option.name} · {option.priceMonthly}&nbsp;€
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-2xl bg-white/[0.04] p-6 ring-1 ring-white/10 ring-inset sm:p-7">
          <p className="text-sm text-white/60">Deine Provision pro Monat</p>
          <NumberFlow
            value={monthly}
            locales="de-DE"
            format={{ style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }}
            className="mt-1 font-display text-5xl leading-none font-semibold tracking-[-0.03em] text-white tabular-nums"
          />
          <div className="mt-6 border-t border-white/[0.08] pt-5">
            <p className="text-sm text-white/60">In {PARTNER.months} Monaten</p>
            <NumberFlow
              value={monthly * PARTNER.months}
              locales="de-DE"
              format={{ style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }}
              className="mt-1 font-display text-3xl leading-none font-semibold tracking-tight text-brand-light tabular-nums"
            />
          </div>
          <p className="mt-6 text-xs leading-relaxed text-pretty text-white/45">
            {Math.round(PARTNER.rate * 100)}&nbsp;% von {plan.priceMonthly}&nbsp;€ ohne Umsatzsteuer, also{' '}
            {euro.format(perCustomer)} je Kunde und Monat. Bei Jahresabos kommt die Provision für das ganze Jahr auf
            einmal.
          </p>
        </div>
      </div>
    </MotionConfig>
  )
}
