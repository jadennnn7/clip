'use client'

import React, { useState } from 'react'
import { Check, Loader2, Settings2, Zap } from 'lucide-react'
import {
  CREDIT_PACKS,
  getPlan,
  PLANS,
  planFacts,
  ROLLOVER_NOTE,
  TRIAL,
  videoTimeFor,
  YEARLY_SAVING_PERCENT,
  YEARLY_TERM_NOTE,
  yearlyPerMonth,
  type BillingInterval,
} from '@/lib/stripe/plans'
import { startCheckout, type CheckoutRequest } from '@/lib/stripe/start-checkout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BillingIntervalSwitch } from '@/components/ui/billing-interval-switch'
import NumberFlow from '@number-flow/react'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { cn } from '@/lib/utils'
import { refreshBillingUsage, useBillingUsage } from '@/stores/billing-usage-store'
import { formatCredits } from '@/lib/credit-format'

const PAID_PLANS = PLANS.filter((plan) => plan.priceEnv !== null)
const day = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' })
const euro = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })

export default function BillingPageClient() {
  const [loading, setLoading] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const { usage, loading: usageLoading, error: usageError } = useBillingUsage()
  const subscribed = (usage?.monthlyCredits ?? 0) > 0
  const reference = subscribed ? usage!.monthlyCredits : TRIAL.credits
  // Ohne eigene Wahl zeigt die Seite die Laufzeit des laufenden Abos.
  const [pickedInterval, setPickedInterval] = useState<BillingInterval | null>(null)
  const yearlyAvailable = usage?.yearlyAvailable ?? false
  const interval: BillingInterval = yearlyAvailable ? pickedInterval ?? usage?.interval ?? 'month' : 'month'

  const handleCheckout = async (key: string, request: CheckoutRequest) => {
    setLoading(key)
    setCheckoutError(null)
    const message = await startCheckout(request)
    if (message === null) return
    setCheckoutError(message)
    setLoading(null)
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <PageHeader
          title="Abo & Verbrauch"
          description="1 Credit = 1 Minute Ausgangsvideo. Die Clips daraus, die Bearbeitung und die Exporte sind inklusive."
        />

        <Card className="mb-8">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Guthaben</CardTitle>
                <CardDescription>
                  {usage
                    ? `${formatCredits(usage.available)} Credits verfügbar — reicht für ${videoTimeFor(usage.available)} Video`
                    : usageLoading ? 'Guthaben wird geladen …' : usageError ?? 'Guthaben nicht verfügbar.'}
                </CardDescription>
              </div>
              {subscribed ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={loading !== null}
                  onClick={() => { void handleCheckout('portal', { kind: 'portal' }) }}
                >
                  {loading === 'portal' ? <Loader2 className="size-4 animate-spin" /> : <Settings2 className="size-4" />}
                  Abo verwalten
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {usage ? (
              <>
                <dl className="mb-4 grid gap-3 sm:grid-cols-3">
                  <Stat
                    label={subscribed ? `Aus dem ${getPlan(usage.tier).name}-Tarif` : 'Gratis-Test'}
                    value={`${formatCredits(usage.planCredits)} Credits`}
                  />
                  <Stat label="Nachgekauft" value={`${formatCredits(usage.packCredits)} Credits`} />
                  {subscribed ? (
                    <Stat
                      label="Nächste Gutschrift"
                      value={usage.nextGrantAt ? `+${formatCredits(usage.monthlyCredits)} am ${day.format(new Date(usage.nextGrantAt))}` : '–'}
                    />
                  ) : (
                    <Stat
                      label="Gratis-Exporte"
                      value={usage.trialExportsLeft !== null ? `${usage.trialExportsLeft} von ${TRIAL.exports} übrig` : 'Unbegrenzt'}
                    />
                  )}
                </dl>
                <Progress value={Math.min(100, (usage.planCredits / reference) * 100)} className="h-2" />
              </>
            ) : !usageLoading ? (
              <Button variant="outline" size="sm" onClick={() => { void refreshBillingUsage() }}>
                Erneut versuchen
              </Button>
            ) : null}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Abgebucht wird erst, wenn die Clips fertig sind — nach Länge des Ausgangsvideos, angefangene
              Minuten zählen voll. Für fehlgeschlagene Downloads oder Analysen fallen keine Credits an.{' '}
              {ROLLOVER_NOTE} Nachgekaufte Credits verfallen nicht.
            </p>
          </CardContent>
        </Card>

        {checkoutError ? (
          <p role="alert" className="mb-6 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {checkoutError}
          </p>
        ) : null}

        <div className="mb-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="mb-1 text-sm font-medium">Tarife</h2>
              <p className="text-xs text-muted-foreground">
                {interval === 'year'
                  ? `Preise inklusive Umsatzsteuer. ${YEARLY_TERM_NOTE}`
                  : 'Preise inklusive Umsatzsteuer, monatlich kündbar.'}
              </p>
            </div>
            {yearlyAvailable ? (
              <BillingIntervalSwitch
                value={interval}
                onChange={setPickedInterval}
                savingPercent={YEARLY_SAVING_PERCENT}
                size="sm"
                className="bg-muted ring-1 ring-border ring-inset"
              />
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {PAID_PLANS.map((plan) => {
              const isCurrent = subscribed && plan.tier === usage?.tier && (usage?.interval ?? 'month') === interval
              const key = `plan:${plan.tier}:${interval}`
              const yearly = interval === 'year'
              return (
                <Card
                  key={plan.tier}
                  className={cn(
                    'transition-ui',
                    isCurrent && 'outline outline-primary/60',
                  )}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{plan.name}</CardTitle>
                      {isCurrent ? <Badge variant="secondary">Aktuell</Badge> : null}
                    </div>
                    <CardDescription>
                      <NumberFlow
                        value={yearly ? yearlyPerMonth(plan) : plan.priceMonthly}
                        locales="de-DE"
                        suffix=" €"
                        className="text-3xl font-semibold tracking-tight text-foreground"
                      />
                      <span className="text-xs"> / Monat</span>
                      {yearly ? (
                        <span className="mt-1 block text-xs">
                          {euro.format(plan.priceYearly)} € jährlich abgerechnet · du sparst{' '}
                          {euro.format(plan.priceMonthly * 12 - plan.priceYearly)} €
                        </span>
                      ) : null}
                      <span className="mt-1 block text-xs">{plan.audience}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <ul className="flex flex-col gap-1.5">
                      {planFacts(plan).map((fact) => (
                        <li key={fact} className="flex items-start gap-2 text-xs">
                          <Check className="mt-0.5 size-3 shrink-0 text-primary" />
                          <span className="text-muted-foreground">{fact}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant={isCurrent ? 'outline' : 'default'}
                      size="sm"
                      className="w-full"
                      disabled={!usage || isCurrent || loading !== null}
                      onClick={() => { void handleCheckout(key, { kind: 'plan', tier: plan.tier, interval }) }}
                    >
                      {loading === key ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : isCurrent ? (
                        'Aktueller Tarif'
                      ) : subscribed ? (
                        'Wechseln'
                      ) : (
                        'Wählen'
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        <div>
          <h2 className="mb-1 text-sm font-medium">Credits nachkaufen</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Zusätzlich zum Abo, sofort verfügbar. Nachgekaufte Credits verfallen nicht und bleiben beim Tarifwechsel erhalten.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {CREDIT_PACKS.map((pack) => {
              const key = `pack:${pack.id}`
              return (
                <Card key={pack.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Zap className="size-4 text-primary" />
                      {pack.label}
                    </CardTitle>
                    <CardDescription>
                      <span className="text-3xl font-semibold tracking-tight text-foreground">
                        {pack.price} €
                      </span>
                      <span className="text-xs"> einmalig</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-4 text-xs text-muted-foreground">
                      {videoTimeFor(pack.credits)} Video · {(pack.price / pack.credits).toFixed(2).replace('.', ',')} € pro Minute
                    </p>
                    <Button
                      size="sm"
                      className="w-full"
                      variant="outline"
                      disabled={!subscribed || loading !== null}
                      onClick={() => { void handleCheckout(key, { kind: 'pack', packId: pack.id }) }}
                    >
                      {loading === key ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : subscribed ? (
                        'Nachkaufen'
                      ) : (
                        'Erst einen Tarif wählen'
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">{value}</dd>
    </div>
  )
}
