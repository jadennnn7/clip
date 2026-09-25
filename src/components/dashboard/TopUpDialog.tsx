'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Lock, Plus, Repeat2, RotateCw, X, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type Mode = 'monthly' | 'once'

interface Option {
  id: string
  name: string
  tokens: number
  price: number
  channels?: number
  features: string[]
  recommended?: boolean
}

const numberFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })

// 1 Token ≈ 1 Minute fertige Clip-Länge, ein Short dauert im Schnitt 30 s.
const shortsFor = (tokens: number) => Math.floor(tokens * 2)

const PLANS: Option[] = [
  {
    id: 'starter',
    name: 'Starter',
    tokens: 150,
    price: 24,
    channels: 3,
    features: ['Kein Wasserzeichen', 'Freigabe-Queue', '3 verbundene Kanäle'],
  },
  {
    id: 'pro',
    name: 'Pro',
    tokens: 500,
    price: 79,
    channels: 9,
    features: ['Kein Wasserzeichen', 'Auto-Publish ab Score 80', 'Prioritäts-Rendering'],
    recommended: true,
  },
  {
    id: 'agency',
    name: 'Agency',
    tokens: 1600,
    price: 199,
    channels: 30,
    features: ['Alles aus Pro', 'Mehrere Workspaces', 'Eigene Untertitel-Vorlagen'],
  },
]

const PACK_FEATURES = ['Einmalige Zahlung, kein Abo', 'Kommt zu deinem Monatskontingent dazu']

const PACKS: Option[] = [
  { id: 'pack-50', name: '50 Token', tokens: 50, price: 15, features: PACK_FEATURES },
  {
    id: 'pack-150',
    name: '150 Token',
    tokens: 150,
    price: 39,
    features: PACK_FEATURES,
    recommended: true,
  },
  { id: 'pack-400', name: '400 Token', tokens: 400, price: 89, features: PACK_FEATURES },
]

const MODES: { value: Mode; label: string; icon: typeof Zap }[] = [
  { value: 'monthly', label: 'Monatsabo', icon: Repeat2 },
  { value: 'once', label: 'Einmal nachladen', icon: Zap },
]

interface TopUpDialogProps {
  tokensLeft: number
  tokensLimit: number
}

/**
 * Token aufladen: Monatsabo oder einmaliges Paket.
 *
 * Links die Auswahl, rechts nur das Nötigste zur gewählten Option — Preis,
 * drei Vorteile, ein Button. Verbrauch und Planvergleich stehen unter
 * „Abo & Verbrauch".
 */
export function TopUpDialog({ tokensLeft, tokensLimit }: TopUpDialogProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('monthly')
  const [selected, setSelected] = useState<Record<Mode, string>>({
    monthly: 'pro',
    once: 'pack-150',
  })

  const monthly = mode === 'monthly'
  const options = monthly ? PLANS : PACKS
  const choice = options.find((option) => option.id === selected[mode]) ?? options[0]

  const checkout = () => {
    // Phase 2: Stripe-Checkout-Session anlegen und weiterleiten.
    toast.success(`${choice.name} ausgewählt`, {
      description: 'Der Stripe-Checkout folgt mit Phase 2.',
    })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Zap />
        Aufladen
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-3xl p-0 sm:max-w-3xl"
      >
        {/* --- Kopf --- */}
        <div className="flex items-start gap-4 px-6 pt-6 sm:px-8 sm:pt-8">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl border bg-linear-to-b from-foreground/10 to-foreground/[0.02] shadow-sm">
            <RotateCw className="size-5" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <DialogTitle className="text-2xl font-semibold tracking-tight">
              Token aufladen
            </DialogTitle>
            <DialogDescription className="mt-1.5">
              Noch{' '}
              <span className="font-medium text-foreground tabular-nums">
                {numberFormat.format(tokensLeft)}
              </span>{' '}
              von {numberFormat.format(tokensLimit)} Token — reicht für ca.{' '}
              {numberFormat.format(shortsFor(tokensLeft))} Shorts.
            </DialogDescription>
          </div>
          <DialogClose
            render={<Button variant="outline" size="icon" className="rounded-full" />}
            aria-label="Schließen"
          >
            <X />
          </DialogClose>
        </div>

        {/* --- Umschalter --- */}
        <div className="px-6 pt-6 sm:px-8">
          <div className="flex w-full rounded-full border bg-muted/50 p-1 sm:inline-flex sm:w-auto">
            {MODES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  'transition-ui flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap sm:flex-none sm:px-4',
                  'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                  mode === value
                    ? 'bg-background text-foreground shadow-sm dark:bg-foreground/10'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="hidden size-4 sm:block" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* --- Auswahl + Details --- */}
        <div className="grid gap-4 px-6 pt-5 pb-6 sm:px-8 sm:pb-8 md:grid-cols-[17rem_1fr]">
          <div role="radiogroup" aria-label={monthly ? 'Tarif' : 'Paket'} className="flex flex-col gap-1.5">
            {options.map((option) => {
              const isSelected = option.id === choice.id
              return (
                <label
                  key={option.id}
                  className={cn(
                    'transition-ui flex cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-3',
                    'has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                    isSelected
                      ? 'border-foreground/15 bg-foreground/[0.06] shadow-sm'
                      : 'border-transparent hover:bg-foreground/[0.03]',
                  )}
                >
                  <input
                    type="radio"
                    name={`topup-${mode}`}
                    value={option.id}
                    checked={isSelected}
                    onChange={() => setSelected((prev) => ({ ...prev, [mode]: option.id }))}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      'size-4 shrink-0 rounded-full border',
                      isSelected ? 'border-[5px] border-foreground' : 'border-muted-foreground/50',
                    )}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {option.name}
                      {option.recommended ? (
                        <span className="rounded-full bg-foreground/10 px-1.5 py-px text-[0.65rem] font-normal text-muted-foreground">
                          Empfohlen
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {option.channels
                        ? `${numberFormat.format(option.tokens)} Token · ${option.channels} Kanäle`
                        : `ca. ${numberFormat.format(shortsFor(option.tokens))} Shorts`}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="text-sm font-semibold tabular-nums">{option.price} €</span>
                    <span className="text-[0.65rem] text-muted-foreground">
                      {monthly ? 'pro Monat' : 'einmalig'}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>

          <div className="flex flex-col rounded-3xl border bg-linear-to-b from-foreground/[0.06] to-foreground/[0.01] p-6 shadow-sm">
            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
              {choice.name}
            </p>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="text-5xl font-semibold tracking-tight tabular-nums">
                {choice.price} €
              </span>
              <span className="text-muted-foreground">{monthly ? '/ Monat' : 'einmalig'}</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              ≈ {numberFormat.format(shortsFor(choice.tokens))} Shorts
              {monthly ? ' im Monat' : ''}
            </p>

            <ul className="mt-6 flex min-h-27 flex-col gap-3 border-t pt-6">
              {choice.features.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full border bg-foreground/5">
                    <Plus className="size-3 text-muted-foreground" />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <Button onClick={checkout} className="mt-8 h-11 w-full rounded-full text-sm shadow-md">
              {monthly ? `${choice.name} holen` : `${choice.name} kaufen`}
              <span className="font-normal opacity-60">
                · {choice.price} €{monthly ? ' / Monat' : ''}
              </span>
              <ArrowRight />
            </Button>
          </div>
        </div>

        {/* --- Fuß --- */}
        <div className="flex items-center justify-between gap-4 border-t px-6 py-4 text-xs text-muted-foreground sm:px-8">
          <span className="flex items-center gap-1.5">
            <Lock className="size-3.5 shrink-0" />
            Sichere Zahlung über Stripe · {monthly ? 'Jederzeit kündbar' : 'Kein Abo'}
          </span>
          <Link
            href="/dashboard/billing"
            onClick={() => setOpen(false)}
            className="transition-ui flex shrink-0 items-center gap-1 hover:text-foreground"
          >
            Abo & Verbrauch
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  )
}
