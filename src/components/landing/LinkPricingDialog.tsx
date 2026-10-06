'use client'

import { useState, type RefObject } from 'react'
import Link from 'next/link'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { ArrowRight, Check, Link2, Loader2, X } from 'lucide-react'
import { Dialog, DialogClose, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { BillingIntervalSwitch } from '@/components/ui/billing-interval-switch'
import {
  getPlan, INCLUDED_EVERYWHERE, planFacts, TRIAL, YEARLY_SAVING_PERCENT,
  YEARLY_TERM_NOTE, yearlyPerMonth, type BillingInterval,
} from '@/lib/stripe/plans'
import type { VideoPlanChoice } from '@/lib/pending-video'
import { cn } from '@/lib/utils'

const euro = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })
const plans = [getPlan('pro'), getPlan('agency')]
const actionClass = 'flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0074d9] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#005eb3] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#0074d9] disabled:cursor-wait disabled:opacity-60'

export function LinkPricingDialog({
  open, onOpenChange, url, yearlyAvailable, initialInterval = 'year', initialTier,
  authenticated = false, finalFocus, onChoose,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  url: string
  yearlyAvailable: boolean
  initialInterval?: BillingInterval
  initialTier?: VideoPlanChoice
  authenticated?: boolean
  finalFocus: RefObject<HTMLInputElement | null>
  onChoose: (tier: VideoPlanChoice, interval: BillingInterval) => Promise<string | null>
}) {
  const [pickedInterval, setInterval] = useState(initialInterval)
  const interval = yearlyAvailable ? pickedInterval : 'month'
  const [loading, setLoading] = useState<VideoPlanChoice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const choose = async (tier: VideoPlanChoice) => {
    if (loading) return
    setError(null)
    setLoading(tier)
    const message = await onChoose(tier, interval)
    if (message) { setError(message); setLoading(null) }
  }

  return (
    <Dialog open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) { setLoading(null); setError(null) }
        onOpenChange(nextOpen)
      }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/55 data-open:animate-in data-open:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Popup
          finalFocus={finalFocus}
          className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[900px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white px-5 pt-12 pb-5 text-[#172235] shadow-[0_24px_100px_rgb(0_0_0/0.25)] outline-none sm:px-9 sm:pt-8 sm:pb-6 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 motion-reduce:animate-none"
        >
          <DialogClose aria-label="Tarifauswahl schließen" className="absolute top-3 right-3 grid size-9 place-items-center rounded-full text-[#607087] transition-colors hover:bg-[#edf3f8] hover:text-[#172235] focus-visible:outline-2 focus-visible:outline-[#0074d9]">
            <X aria-hidden className="size-5" />
          </DialogClose>

          <header className="text-center">
            <DialogTitle className="px-8 font-display text-[1.65rem] leading-tight font-semibold tracking-tight sm:px-5 sm:text-[1.9rem]">Dein Link. Dein nächster Clip.</DialogTitle>
            <DialogDescription className="mt-3 text-sm leading-relaxed text-[#607087]">Wähle deinen Tarif oder <button type="button" disabled={loading !== null} onClick={() => void choose('free')} className="rounded-sm font-medium text-[#006fc9] underline underline-offset-3 focus-visible:outline-2 focus-visible:outline-[#0074d9] disabled:opacity-60">teste Ocuris kostenlos</button>. Dein Videolink bleibt erhalten.</DialogDescription>
            <p className="mx-auto mt-4 flex max-w-md items-center gap-2 rounded-lg bg-[#f3f6fa] px-3 py-2 text-xs text-[#526279]">
              <Link2 aria-hidden className="size-3.5 shrink-0 text-[#0074d9]" />
              <span className="min-w-0 truncate" title={url}>{url}</span>
              <span className="shrink-0 font-medium text-[#0074d9]">Link erkannt</span>
            </p>
            {yearlyAvailable && <div className="mt-5">
              <BillingIntervalSwitch value={interval} onChange={(value) => { if (!loading) setInterval(value) }} savingPercent={YEARLY_SAVING_PERCENT} className="border border-[#dce4ed] bg-[#f3f6fa] text-[#526279] [--muted-foreground:#526279] [--primary:#0074d9] [--liquid-fill:#0074d9] [--liquid-shadow:none]" />
            </div>}
          </header>

          <div className="mt-7 grid gap-6 sm:grid-cols-2 sm:gap-4">
            {plans.map((plan) => {
              const featured = plan.tier === 'pro'
              const tier = plan.tier as 'pro' | 'agency'
              return <article key={tier} className={cn('relative flex flex-col overflow-visible rounded-2xl border bg-white pt-6 shadow-[0_4px_22px_rgb(25_45_75/0.06)]', featured ? 'border-2 border-[#008ee8]' : 'border-[#dce4ed]')}>
                {featured && <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#0074d9] px-5 py-1.5 text-xs font-semibold text-white">Empfohlen</span>}
                <div className="px-6">
                  <h3 className="font-display text-xl font-semibold tracking-tight">{plan.name}</h3>
                  <p className="mt-1 min-h-5 text-sm leading-5 text-[#607087]">{plan.audience}</p>
                  <p className="mt-4 flex items-baseline gap-2"><span className="font-display text-[2.65rem] leading-none font-semibold tracking-[-0.045em] tabular-nums">{euro.format(interval === 'year' ? yearlyPerMonth(plan) : plan.priceMonthly)} €</span><span className="text-sm text-[#607087]">/ Monat</span></p>
                  <p className="mt-2 text-xs text-[#607087]">{interval === 'year' ? `${euro.format(plan.priceYearly)} € jährlich abgerechnet` : 'Monatlich kündbar'}</p>
                  <div className="mt-4 rounded-xl border border-[#e1e8f0] bg-[#f7f9fc] px-3.5 py-3 text-sm font-medium">{euro.format(plan.credits)} Credits pro Monat<span className="mt-1 block text-xs font-normal text-[#607087]">1 Credit = 1 Minute Ausgangsvideo</span></div>
                  <button type="button" disabled={loading !== null} onClick={() => void choose(tier)} className={cn(actionClass, 'mt-3')}>
                    {loading === tier && <Loader2 aria-hidden className="size-4 animate-spin" />}
                    {authenticated ? `${plan.name} buchen` : `Mit ${plan.name} fortfahren`}
                    {loading !== tier && <ArrowRight aria-hidden className="size-4" />}
                  </button>
                  <p className="mt-2 mb-4 text-center text-[11px] text-[#607087]">{authenticated ? initialTier === tier ? 'Deine Auswahl · weiter zum sicheren Checkout' : 'Weiter zum sicheren Checkout' : 'Zuerst anmelden, dann Tarif bestätigen'}</p>
                </div>
                <ul className="mt-auto space-y-2.5 rounded-b-2xl border-t border-[#e6ebf2] px-6 py-4 text-[13px] leading-5 text-[#526279]">
                  {[...planFacts(plan).slice(1), ...INCLUDED_EVERYWHERE.slice(0, 3)].map((fact) => <li key={fact} className="flex gap-2.5"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-[#0082d9]" />{fact}</li>)}
                </ul>
              </article>
            })}
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <footer className="mt-5">
            <div className="flex flex-col items-center justify-between gap-3 rounded-xl bg-[#f3f7fb] px-4 py-3 sm:flex-row sm:text-left">
              <p className="text-center text-xs leading-5 text-[#526279] sm:text-left"><strong className="block font-semibold text-[#172235]">Erst einmal ausprobieren?</strong>{TRIAL.credits} Credits einmalig · {TRIAL.exports} Exporte · ohne Kreditkarte</p>
              <button type="button" disabled={loading !== null} onClick={() => void choose('free')} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-[#006fc9] hover:bg-[#e3edf7] focus-visible:outline-2 focus-visible:outline-[#0074d9] disabled:opacity-60">{loading === 'free' && <Loader2 aria-hidden className="size-4 animate-spin" />}Kostenlos testen<ArrowRight aria-hidden className="size-4" /></button>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] text-[#607087]">
              <Link href={authenticated ? '/dashboard/billing' : '#preise'} onClick={(event) => {
                if (authenticated) return
                event.preventDefault()
                onOpenChange(false)
                // Let dialog cleanup restore focus and release the body scroll lock.
                requestAnimationFrame(() => requestAnimationFrame(() => {
                  window.history.pushState(null, '', '#preise')
                  document.getElementById('preise')?.scrollIntoView({ behavior: 'instant', block: 'start' })
                }))
              }} className="rounded-sm text-xs text-[#006fc9] underline underline-offset-3 focus-visible:outline-2 focus-visible:outline-[#0074d9]">Alle Tarife ansehen</Link>
              <p>Preise inkl. MwSt.{interval === 'year' ? ` ${YEARLY_TERM_NOTE}` : ''}</p>
            </div>
          </footer>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </Dialog>
  )
}
