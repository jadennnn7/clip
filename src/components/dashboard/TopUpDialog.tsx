'use client'

import React, { useState } from 'react'
import { ArrowRight, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

type Mode = 'monthly' | 'once'

interface Option {
  id: string
  name: string
  tokens: number
  price: number
  detail?: string
  recommended?: boolean
}

const numberFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })

// 1 Token ≈ 1 Minute fertige Clip-Länge, ein Short dauert im Schnitt 30 s.
const shortsFor = (tokens: number) => Math.floor(tokens * 2)

const PLANS: Option[] = [
  { id: 'starter', name: 'Starter', tokens: 150, price: 24, detail: '3 Kanäle' },
  { id: 'pro', name: 'Pro', tokens: 500, price: 79, detail: '9 Kanäle', recommended: true },
  { id: 'agency', name: 'Agency', tokens: 1600, price: 199, detail: '30 Kanäle' },
]

const PACKS: Option[] = [
  { id: 'pack-50', name: '50 Token', tokens: 50, price: 15 },
  { id: 'pack-150', name: '150 Token', tokens: 150, price: 39, detail: '', recommended: true },
  { id: 'pack-400', name: '400 Token', tokens: 400, price: 89 },
]

/**
 * Token aufladen: Monatsabo oder einmaliges Paket.
 *
 * Absichtlich schlank — eine Liste, ein Button. Alles Weitere (Verbrauch,
 * Planvergleich) steht unter „Abo & Verbrauch".
 */
export function TopUpDialog({ tokensLeft }: { tokensLeft: number }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('monthly')
  const [selected, setSelected] = useState<Record<Mode, string>>({
    monthly: 'pro',
    once: 'pack-150',
  })

  const options = mode === 'monthly' ? PLANS : PACKS
  const choice = options.find((option) => option.id === selected[mode]) ?? options[0]

  const checkout = () => {
    // Phase 2: Stripe-Checkout-Session anlegen und weiterleiten.
    toast.success(`${choice.name} ausgewählt`, {
      description: 'Der Stripe-Checkout folgt mit Phase 2.',
    })
    setOpen(false)
  }

  const renderOptions = (list: Option[]) => (
    <div role="radiogroup" className="flex flex-col gap-2">
      {list.map((option) => {
        const isSelected = option.id === selected[mode]
        return (
          <label
            key={option.id}
            className={cn(
              'transition-ui flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3',
              'has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
              isSelected ? 'border-foreground/40 bg-muted/60' : 'hover:bg-muted/40',
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
                {mode === 'monthly'
                  ? `${numberFormat.format(option.tokens)} Token · ${option.detail}`
                  : `ca. ${numberFormat.format(shortsFor(option.tokens))} Shorts`}
              </span>
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {option.price} €
            </span>
          </label>
        )
      })}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Zap />
        Aufladen
      </DialogTrigger>

      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Token aufladen</DialogTitle>
          <DialogDescription>
            Noch{' '}
            <span className="font-medium text-foreground tabular-nums">
              {numberFormat.format(tokensLeft)}
            </span>{' '}
            Token · reicht für ca. {numberFormat.format(shortsFor(tokensLeft))} Shorts
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
          <TabsList className="w-full">
            <TabsTrigger value="monthly">Monatsabo</TabsTrigger>
            <TabsTrigger value="once">Einmalig</TabsTrigger>
          </TabsList>
          <TabsContent value="monthly" className="mt-2">
            {renderOptions(PLANS)}
          </TabsContent>
          <TabsContent value="once" className="mt-2">
            {renderOptions(PACKS)}
          </TabsContent>
        </Tabs>

        <div className="flex flex-col gap-2">
          <Button size="lg" className="h-10 w-full" onClick={checkout}>
            {mode === 'monthly' ? `${choice.name} holen` : `${choice.name} kaufen`}
            <span className="font-normal opacity-60">
              · {choice.price} €{mode === 'monthly' ? ' / Monat' : ''}
            </span>
            <ArrowRight />
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {mode === 'monthly' ? 'Jederzeit kündbar' : 'Kein Abo'} · Sichere Zahlung über
            Stripe
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
