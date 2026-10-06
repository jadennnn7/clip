'use client'

import React from 'react'
import { Check, CircleAlert, Copy, HandCoins, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { KpiCards } from '@/components/analytics/KpiCards'
import { Panel } from '@/components/analytics/Panel'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PARTNER } from '@/lib/partner'
import { cn } from '@/lib/utils'
import type { PartnerCommission, PartnerOverview } from '@/services/billing/partner'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const date = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })
/** Für Freigabedaten: Sie liegen höchstens ein paar Wochen voraus, das Jahr ist klar. */
const shortDate = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' })
const cents = (value: number) => euro.format(value / 100)
const percent = `${Math.round(PARTNER.rate * 100)} %`

interface PartnerProgramProps {
  overview: PartnerOverview | null
  link: string | null
  error: string | null
  contactEmail: string
}

/**
 * Partnerseite: der eigene Link, was er gebracht hat und wann ausgezahlt
 * wird. Geworbene Konten bleiben anonym — der Partner sieht Beträge, keine
 * Namen oder Adressen.
 *
 * Gebaut aus denselben Formen wie Analytics (`KpiCards`, `Panel`), damit
 * Zahlen in der App überall gleich aussehen. Oben steht, was man hier tut —
 * den Link teilen —, darunter, was er gebracht hat, zuletzt das Kleingedruckte.
 */
export function PartnerProgram({ overview, link, error, contactEmail }: PartnerProgramProps) {
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <PageHeader
          title="Partnerprogramm"
          description="Empfiehl Ocuris weiter und verdiene an jedem Konto mit, das über deinen Link kommt."
        />

        <div className="flex flex-col gap-4">
          {overview && link ? (
            <>
              <LinkCard link={link} />
              <KpiCards items={kpis(overview)} />
              <PayoutPanel overview={overview} contactEmail={contactEmail} />
              <CommissionsPanel overview={overview} />
              {overview.payouts.length ? <PayoutsPanel overview={overview} /> : null}
            </>
          ) : (
            <div role="alert" className="glass-tile flex items-start gap-3 rounded-2xl p-5">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{error ?? 'Das Partnerprogramm ist gerade nicht verfügbar.'}</p>
            </div>
          )}

          <TermsPanel />
        </div>
      </div>
    </ScrollArea>
  )
}

/** Der Link ist das Einzige, was man hier tun muss — deshalb die erste und größte Karte. */
function LinkCard({ link }: { link: string }) {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      toast.error('Kopieren nicht möglich', { description: 'Markiere den Link und kopiere ihn von Hand.' })
    }
  }

  return (
    <section aria-labelledby="partner-link" className="glass-tile rounded-2xl p-5 sm:p-6">
      <h2 id="partner-link" className="text-sm font-medium">Dein Partnerlink</h2>
      <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
        Teil ihn in deiner Bio, in Videobeschreibungen oder direkt mit Freunden.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          value={link}
          aria-label="Partnerlink"
          className="h-10 font-mono text-sm"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button onClick={() => { void copy() }} className="h-10 shrink-0 gap-1.5 sm:w-32">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Kopiert' : 'Kopieren'}
        </Button>
      </div>

      {/* Die drei Zahlen, nach denen jeder Partner zuerst fragt. */}
      <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-foreground/[0.06] pt-5 sm:gap-4">
        <Fact value={percent} label="von jeder Zahlung, ohne Umsatzsteuer" />
        <Fact value={`${PARTNER.months} Monate`} label="lang ab der ersten Zahlung" />
        <Fact value={`${PARTNER.cookieDays} Tage`} label="zählt eine Anmeldung nach dem Klick" />
      </dl>
    </section>
  )
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    // Im DOM erst der Begriff, dann der Wert — sichtbar steht die Zahl oben.
    <div className="flex min-w-0 flex-col">
      <dt className="order-2 mt-0.5 text-xs leading-snug text-muted-foreground">{label}</dt>
      <dd className="order-1 font-display text-lg font-semibold tracking-tight whitespace-nowrap tabular-nums sm:text-2xl">{value}</dd>
    </div>
  )
}

function kpis(overview: PartnerOverview) {
  const conversion = overview.signups > 0 ? Math.round((overview.customers / overview.signups) * 100) : null
  return [
    { label: 'Anmeldungen', value: String(overview.signups), note: 'über deinen Link' },
    {
      label: 'Zahlende Kunden',
      value: String(overview.customers),
      note: conversion !== null ? `${conversion} % Quote` : 'noch keine',
    },
    {
      label: 'In Wartezeit',
      value: cents(overview.pendingCents),
      note: overview.nextReleaseAt && overview.pendingCents > 0
        ? `nächste am ${shortDate.format(new Date(overview.nextReleaseAt))}`
        : `${PARTNER.holdDays} Tage nach Zahlung`,
    },
    { label: 'Auszahlbar', value: cents(Math.max(0, overview.availableCents)), note: `ab ${cents(PARTNER.minPayoutCents)}` },
    {
      label: 'Ausgezahlt',
      value: cents(overview.paidOutCents),
      note: overview.payouts.length
        ? `${overview.payouts.length} ${overview.payouts.length === 1 ? 'Überweisung' : 'Überweisungen'}`
        : 'noch nichts',
    },
  ]
}

function PayoutPanel({ overview, contactEmail }: { overview: PartnerOverview; contactEmail: string }) {
  const payable = overview.availableCents >= PARTNER.minPayoutCents
  const subject = encodeURIComponent(`Auszahlung Partnerprogramm (${overview.code})`)
  const progress = Math.min(100, (Math.max(0, overview.availableCents) / PARTNER.minPayoutCents) * 100)

  return (
    <Panel
      title="Auszahlung"
      id="partner-payout"
      action={payable ? (
        <Button size="sm" className="gap-1.5" nativeButton={false} render={<a href={`mailto:${contactEmail}?subject=${subject}`} />}>
          <Mail className="size-3.5" />
          Auszahlung anfordern
        </Button>
      ) : null}
    >
      <div className="px-4 py-4 sm:px-5">
        {/* Der Weg bis zur Mindestsumme — ab dort ist der Balken voll. */}
        <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium tabular-nums">{cents(Math.max(0, overview.availableCents))}</span>
          <span className="text-xs text-muted-foreground tabular-nums">Mindestbetrag {cents(PARTNER.minPayoutCents)}</span>
        </div>
        <Progress value={progress} aria-label="Fortschritt bis zur Auszahlung" />
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {payable
            ? `${cents(overview.availableCents)} sind auszahlbar. Schreib uns mit Name, Anschrift und IBAN oder PayPal-Adresse — wir überweisen innerhalb von 14 Tagen.`
            : overview.availableCents < 0
              ? `Eine Erstattung nach der letzten Auszahlung (${cents(-overview.availableCents)}) wird mit deinen nächsten Provisionen verrechnet.`
              : `Ausgezahlt wird ab ${cents(PARTNER.minPayoutCents)}. Noch ${cents(PARTNER.minPayoutCents - overview.availableCents)} bis dahin.`}
          {overview.nextReleaseAt && overview.pendingCents > 0
            ? ` Die nächste Provision wird am ${date.format(new Date(overview.nextReleaseAt))} auszahlbar.`
            : ''}
        </p>
      </div>
    </Panel>
  )
}

type StatusTone = 'ready' | 'waiting' | 'reversed'

const STATUS_DOT: Record<StatusTone, string> = {
  ready: 'bg-emerald-500',
  waiting: 'bg-muted-foreground/40',
  reversed: 'bg-destructive',
}

function status(item: PartnerCommission, now: number): { label: string; tone: StatusTone } {
  if (item.reversedCents >= item.commissionCents) return { label: 'Erstattet', tone: 'reversed' }
  const released = Date.parse(item.availableAt) <= now
  // Die Freigabe liegt höchstens `holdDays` voraus — das Jahr ist klar.
  const base = released ? 'Auszahlbar' : `Ab ${shortDate.format(new Date(item.availableAt))}`
  return { label: item.reversedCents > 0 ? `${base}, teilweise erstattet` : base, tone: released ? 'ready' : 'waiting' }
}

function CommissionsPanel({ overview }: { overview: PartnerOverview }) {
  // Einmal pro Darstellung, damit alle Zeilen denselben Zeitpunkt sehen.
  const [now] = React.useState(() => Date.now())

  return (
    <Panel
      title="Provisionen"
      id="partner-commissions"
      description={`Je Zahlung eines geworbenen Kontos, ${percent} vom Betrag ohne Umsatzsteuer.`}
    >
      {overview.commissions.length ? (
        <div className="px-2 pb-2 sm:px-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead className="text-right max-sm:hidden">Zahlung netto</TableHead>
                <TableHead className="text-right">Provision</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.commissions.map((item) => {
                const state = status(item, now)
                return (
                  <TableRow key={item.id}>
                    <TableCell className="text-muted-foreground">{date.format(new Date(item.paidAt))}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums max-sm:hidden">{cents(item.netCents)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {cents(item.commissionCents - item.reversedCents)}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
                        <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[state.tone])} />
                        {state.label}
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <span className="glass-lens flex size-10 items-center justify-center rounded-full">
            <HandCoins className="size-4 text-muted-foreground" />
          </span>
          <p className="mt-3 text-sm font-medium">Noch keine Provisionen</p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Sobald ein geworbenes Konto zahlt, steht die Provision hier — mit Datum, Betrag und wann sie auszahlbar wird.
          </p>
        </div>
      )}
    </Panel>
  )
}

function PayoutsPanel({ overview }: { overview: PartnerOverview }) {
  return (
    <Panel title="Auszahlungen" id="partner-payouts">
      <ul className="divide-y divide-foreground/[0.06] px-4 sm:px-5">
        {overview.payouts.map((payout) => (
          <li key={payout.id} className="flex items-center justify-between py-3 text-sm">
            <span className="text-muted-foreground">{date.format(new Date(payout.createdAt))}</span>
            <span className="font-medium tabular-nums">{cents(payout.amountCents)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/** Das Kleingedruckte in sechs kurzen Abschnitten statt einer langen Liste. */
function TermsPanel() {
  const terms = [
    {
      title: 'Provision',
      text: `${percent} vom Betrag ohne Umsatzsteuer, den ein geworbenes Konto für Abos und Credit-Pakete zahlt — ${PARTNER.months} Monate lang ab seiner ersten Zahlung.`,
    },
    {
      title: 'Wer zählt',
      text: `Wer innerhalb von ${PARTNER.cookieDays} Tagen nach dem Klick auf deinen Link ein Konto anlegt und noch nie ein Abo hatte. Klickt jemand mehrere Partnerlinks, zählt der letzte.`,
    },
    {
      title: 'Auszahlung',
      text: `${PARTNER.holdDays} Tage nach der Zahlung, ab ${cents(PARTNER.minPayoutCents)}. Erstattungen und Rückbuchungen werden abgezogen, auch wenn schon ausgezahlt wurde.`,
    },
    {
      title: 'Ausgeschlossen',
      text: 'Eigene oder doppelte Konten, Anzeigen auf den Namen „Ocuris“ in Suchmaschinen und unerwünschte Werbung (Spam). Provisionen daraus verfallen.',
    },
    {
      title: 'Steuern',
      text: 'Trägst du selbst. Für die Auszahlung brauchen wir Name, Anschrift und Zahlungsdaten, bei Umsatzsteuerpflicht auch deine Steuernummer oder USt-IdNr.',
    },
    {
      title: 'Änderungen',
      text: 'Löschst du dein Konto, verfallen noch nicht ausgezahlte Provisionen. Änderungen am Programm gelten nur für Zahlungen danach.',
    },
  ]

  return (
    <Panel title="Bedingungen" id="partner-terms">
      <dl className="grid gap-x-8 gap-y-5 px-4 py-5 sm:grid-cols-2 sm:px-5">
        {terms.map((term) => (
          <div key={term.title}>
            <dt className="text-xs font-medium">{term.title}</dt>
            <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{term.text}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}
