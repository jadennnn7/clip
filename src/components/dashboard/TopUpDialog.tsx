'use client'

import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Dialog } from '@base-ui/react/dialog'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Tabs } from '@base-ui/react/tabs'
import { ArrowRight, Check, Loader2, Lock, Plus, Repeat, Scissors, X, Zap } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatCredits } from '@/lib/credit-format'
import {
  CREDIT_PACKS,
  FEATURED_TIER,
  PLANS,
  videoTimeFor,
  type CreditPack,
  type Plan,
} from '@/lib/stripe/plans'
import { startCheckout, type CheckoutRequest } from '@/lib/stripe/start-checkout'
import { useBillingUsage } from '@/stores/billing-usage-store'
import type { SubscriptionTier } from '@/types/database'
import { Button } from '@/components/ui/button'

type Mode = 'plans' | 'packs'

const PAID_PLANS = PLANS.filter((plan) => plan.priceEnv !== null)

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const euroCents = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })

/** Preis pro Minute Video — bei allen Tarifen und beim Paket vergleichbar. */
const perMinute = (price: number, credits: number) => euroCents.format(price / credits)
const rankOf = (tier: SubscriptionTier) => PLANS.findIndex((plan) => plan.tier === tier)
const channels = (n: number) => (n === 1 ? '1 Kanal' : `${n} Kanäle`)

interface TopUpDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Aufladen-Dialog: Tarif wählen oder Credits nachkaufen.
 *
 * Statt drei gleich gebauter Preisspalten nebeneinander steht links die Wahl
 * und rechts, was sie für genau dieses Konto bedeutet: wie viel mehr Credits
 * als jetzt, wie voll das Guthaben nach dem Nachkauf ist. Verglichen wird mit
 * dem eigenen Stand, nicht nur zwischen den Tarifen.
 */
export function TopUpDialog({ open, onOpenChange }: TopUpDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 isolate z-50 bg-black/45 duration-200 supports-backdrop-filter:backdrop-blur-md data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup
          className={cn(
            'glass-menu fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-[60rem] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto overscroll-contain rounded-2xl text-popover-foreground outline-none',
            'duration-300 ease-(--ease-out-quint) data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          )}
        >
          {/* Lichtkante oben — dasselbe Glas wie die Kopfleiste. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent"
          />

          <Dialog.Close
            aria-label="Schließen"
            className="glass-lens liquid-press absolute top-4 right-4 z-10 flex size-9 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:top-5 sm:right-5"
          >
            <X className="size-4" />
          </Dialog.Close>

          {/* Eigene Komponente, damit Auswahl und Fehler bei jedem Öffnen
              frisch anfangen — das Popup wird beim Schließen ausgehängt. */}
          <TopUpContent onClose={() => onOpenChange(false)} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function TopUpContent({ onClose }: { onClose: () => void }) {
  const { usage } = useBillingUsage()
  const currentPlan = usage ? PLANS[rankOf(usage.tier)] ?? null : null
  const currentRank = currentPlan ? rankOf(currentPlan.tier) : -1
  const subscribed = (usage?.monthlyCredits ?? 0) > 0
  const atTop = currentRank === PLANS.length - 1

  // Vorauswahl: der nächste Schritt nach oben, mindestens das Hauptangebot.
  // Wer schon ganz oben ist, kauft eher nach.
  const [mode, setMode] = React.useState<Mode>(atTop && subscribed ? 'packs' : 'plans')
  const [tier, setTier] = React.useState<SubscriptionTier>(
    () => PLANS[Math.max(currentRank + 1, rankOf(FEATURED_TIER))]?.tier ?? PLANS[PLANS.length - 1].tier,
  )
  const [packId, setPackId] = React.useState(CREDIT_PACKS[0].id)
  const [pending, setPending] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const plan = PLANS[rankOf(tier)]
  const pack = CREDIT_PACKS.find((item) => item.id === packId) ?? CREDIT_PACKS[0]

  const checkout = async (key: string, request: CheckoutRequest) => {
    setPending(key)
    setError(null)
    const message = await startCheckout(request)
    if (message === null) return
    setError(message)
    setPending(null)
  }

  return (
    <>
      <div className="px-5 pt-6 pb-5 sm:px-8 sm:pt-8">
        <header className="flex items-start gap-4 pr-12">
          <span className="glass-lens flex size-14 shrink-0 items-center justify-center rounded-2xl">
            <Image
              src="/Token.png"
              alt=""
              width={125}
              height={125}
              className="size-9 object-contain drop-shadow-[0_6px_16px_rgb(0_0_0/0.35)]"
            />
          </span>
          <div className="min-w-0 pt-0.5">
            <Dialog.Title className="font-display text-2xl leading-tight font-semibold tracking-tight sm:text-[1.75rem]">
              {subscribed ? 'Mehr Credits' : 'Tarif wählen'}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              {usage && currentPlan ? (
                <>
                  Noch <span className="font-medium text-foreground tabular-nums">{formatCredits(usage.available)}</span> Credits
                  {subscribed ? ` im ${currentPlan.name}-Tarif` : ' im Gratis-Test'} — das reicht für{' '}
                  {videoTimeFor(usage.available)} Video.
                </>
              ) : (
                'Wähle einen Tarif, der jeden Monat neu auffüllt.'
              )}
            </Dialog.Description>
          </div>
        </header>

        <Tabs.Root
          value={mode}
          onValueChange={(value) => {
            setMode(value as Mode)
            setError(null)
          }}
          className="mt-7"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <Tabs.List
              aria-label="Art der Aufladung"
              className="glass-field relative flex h-11 w-full rounded-full p-1 sm:w-auto"
            >
              <Tabs.Indicator className="glass-lens absolute top-1 bottom-1 left-(--active-tab-left) w-(--active-tab-width) rounded-full transition-[left,width] duration-500 ease-spring" />
              <ModeTab value="plans" icon={Repeat} label="Tarif" />
              <ModeTab value="packs" icon={Zap} label="Nachkaufen" />
            </Tabs.List>
            <p className="text-xs text-muted-foreground">
              1 Credit = 1 Minute Video · Clips und Exporte inklusive
            </p>
          </div>

          <Tabs.Panel value="plans" className="mt-5 outline-none">
            <Chooser
              options={
                <RadioGroup
                  aria-label="Tarif"
                  value={tier}
                  onValueChange={(value) => {
                    setTier(value as SubscriptionTier)
                    setError(null)
                  }}
                  className="flex flex-col gap-1.5"
                >
                  {PAID_PLANS.map((item) => {
                    const rank = rankOf(item.tier)
                    return (
                      <OptionRow
                        key={item.tier}
                        value={item.tier}
                        selected={item.tier === tier}
                        title={item.name}
                        tag={
                          subscribed && rank === currentRank
                            ? 'Aktuell'
                            : item.tier === FEATURED_TIER && currentRank < rank
                              ? 'Empfohlen'
                              : null
                        }
                        detail={`${formatCredits(item.credits)} Credits · ${channels(item.socialAccounts)}`}
                        price={euro.format(item.priceMonthly)}
                        priceNote="pro Monat"
                      />
                    )
                  })}
                </RadioGroup>
              }
              note="Monatlich kündbar. Ungenutzte Credits wandern in den nächsten Monat mit, bis zu einem Monatskontingent."
            >
              <PlanDetail
                plan={plan}
                currentPlan={subscribed ? currentPlan : null}
                pending={pending === `plan:${plan.tier}`}
                disabled={pending !== null}
                error={error}
                onCheckout={() => { void checkout(`plan:${plan.tier}`, { kind: 'plan', tier: plan.tier }) }}
              />
            </Chooser>
          </Tabs.Panel>

          <Tabs.Panel value="packs" className="mt-5 outline-none">
            <Chooser
              options={
                <RadioGroup
                  aria-label="Credit-Paket"
                  value={packId}
                  onValueChange={(value) => {
                    setPackId(value as string)
                    setError(null)
                  }}
                  className="flex flex-col gap-1.5"
                >
                  {CREDIT_PACKS.map((item) => (
                    <OptionRow
                      key={item.id}
                      value={item.id}
                      selected={item.id === packId}
                      title={item.label}
                      tag={null}
                      detail={`${perMinute(item.price, item.credits)} pro Minute Video`}
                      price={euro.format(item.price)}
                      priceNote="einmalig"
                    />
                  ))}
                </RadioGroup>
              }
              note="Zusätzlich zum Abo, für den Monat, in dem mehr Videos anstehen als sonst. Nachgekaufte Credits verfallen nicht."
            >
              <PackDetail
                pack={pack}
                available={usage?.available ?? null}
                subscribed={subscribed}
                pending={pending === `pack:${pack.id}`}
                disabled={pending !== null}
                error={error}
                onCheckout={() => { void checkout(`pack:${pack.id}`, { kind: 'pack', packId: pack.id }) }}
                onShowPlans={atTop && subscribed ? null : () => setMode('plans')}
              />
            </Chooser>
          </Tabs.Panel>
        </Tabs.Root>
      </div>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-foreground/[0.06] px-5 py-4 text-xs text-muted-foreground sm:px-8">
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" />
            Sichere Zahlung über Stripe
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Scissors className="size-3.5" />
            Abgebucht wird erst, wenn die Clips fertig sind
          </span>
        </div>
        <Link
          href="/dashboard/billing"
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-sm font-medium outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Abo & Verbrauch
          <ArrowRight className="size-3" />
        </Link>
      </footer>
    </>
  )
}

function ModeTab({
  value,
  icon: Icon,
  label,
}: {
  value: Mode
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <Tabs.Tab
      value={value}
      className="relative flex h-full flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors duration-200 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-active:text-foreground sm:flex-none"
    >
      <Icon className="size-3.5" />
      {label}
    </Tabs.Tab>
  )
}

/** Links die Wahl, rechts ihre Bedeutung. Auf schmalen Bildschirmen untereinander. */
function Chooser({
  options,
  note,
  children,
}: {
  options: React.ReactNode
  note: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-4 md:grid-cols-[17.5rem_minmax(0,1fr)] md:gap-5">
      <div className="flex flex-col gap-4">
        {options}
        <p className="mt-auto hidden px-3.5 text-xs leading-relaxed text-muted-foreground md:block">{note}</p>
      </div>
      {children}
    </div>
  )
}

function OptionRow({
  value,
  selected,
  title,
  tag,
  detail,
  price,
  priceNote,
}: {
  value: string
  selected: boolean
  title: string
  tag: string | null
  detail: string
  price: string
  priceNote: string
}) {
  return (
    <Radio.Root
      value={value}
      className={cn(
        'relative flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3.5 py-3 text-left outline-none select-none',
        'transition-[background-color,box-shadow,transform] duration-300 ease-(--ease-out-quint) focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.985]',
        selected ? 'glass-lens' : 'hover:bg-foreground/[0.045]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full ring-1 transition-colors duration-200',
          selected ? 'bg-foreground ring-foreground' : 'ring-foreground/25',
        )}
      >
        <span
          className={cn(
            'size-1.5 rounded-full bg-background transition-transform duration-500 ease-spring',
            selected ? 'scale-100' : 'scale-0',
          )}
        />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {tag ? (
            <span className="shrink-0 rounded-full bg-foreground/[0.07] px-2 py-px text-[10px] font-medium text-muted-foreground ring-1 ring-foreground/[0.06]">
              {tag}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground tabular-nums">{detail}</span>
      </span>

      <span className="shrink-0 text-right">
        <span className="block font-display text-[15px] leading-5 font-semibold tracking-tight tabular-nums">{price}</span>
        <span className="block text-[10px] text-muted-foreground">{priceNote}</span>
      </span>
    </Radio.Root>
  )
}

interface DetailActions {
  pending: boolean
  disabled: boolean
  error: string | null
  onCheckout: () => void
}

function PlanDetail({
  plan,
  currentPlan,
  pending,
  disabled,
  error,
  onCheckout,
}: DetailActions & { plan: Plan; currentPlan: Plan | null }) {
  const rank = rankOf(plan.tier)
  const currentRank = currentPlan ? rankOf(currentPlan.tier) : -1
  const isCurrent = rank === currentRank
  const isUpgrade = currentPlan !== null && rank > currentRank

  // Beim Aufstieg zählt, was sich ändert; sonst, was der Tarif insgesamt enthält.
  const items = isUpgrade
    ? [
        `+${formatCredits(plan.credits - currentPlan.credits)} Credits jeden Monat`,
        `${videoTimeFor(plan.credits)} Video im Monat statt ${videoTimeFor(currentPlan.credits)}`,
        ...(plan.socialAccounts > currentPlan.socialAccounts
          ? [`+${channels(plan.socialAccounts - currentPlan.socialAccounts)}`]
          : []),
        'Die Differenz sofort, anteilig berechnet',
      ]
    : [
        `${formatCredits(plan.credits)} Credits jeden Monat`,
        `${videoTimeFor(plan.credits)} Video im Monat`,
        `${channels(plan.socialAccounts)} verbunden`,
        'Bearbeitung und Exporte inklusive',
      ]

  return (
    <DetailCard
      eyebrow={plan.name}
      price={euro.format(plan.priceMonthly)}
      priceUnit="/ Monat"
      priceNote={`${perMinute(plan.priceMonthly, plan.credits)} pro Minute Video · monatlich kündbar`}
      listTitle={isUpgrade ? 'Das kommt für dich dazu' : 'Enthalten'}
      listKey={`${currentPlan?.tier ?? 'none'}-${plan.tier}`}
      items={items}
      itemIcon={isUpgrade ? Plus : Check}
      action={
        <Button
          variant={isCurrent ? 'outline' : 'prominent'}
          className="h-12 w-full gap-2 rounded-full text-sm"
          disabled={isCurrent || disabled}
          onClick={onCheckout}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isCurrent ? (
            'Dein aktueller Tarif'
          ) : (
            <>
              {isUpgrade || !currentPlan ? `${plan.name} holen` : `Zu ${plan.name} wechseln`}
              <span className="font-normal opacity-60">· {euro.format(plan.priceMonthly)} / Monat</span>
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      }
      error={error}
    />
  )
}

function PackDetail({
  pack,
  available,
  subscribed,
  pending,
  disabled,
  error,
  onCheckout,
  onShowPlans,
}: DetailActions & { pack: CreditPack; available: number | null; subscribed: boolean; onShowPlans: (() => void) | null }) {
  const after = (available ?? 0) + pack.credits

  return (
    <DetailCard
      eyebrow={pack.label}
      price={euro.format(pack.price)}
      priceUnit="einmalig"
      priceNote={`${perMinute(pack.price, pack.credits)} pro Minute Video · ${videoTimeFor(pack.credits)} Video`}
      meter={
        available !== null && subscribed ? (
          <div>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium">Guthaben danach</span>
              <span className="text-muted-foreground tabular-nums">
                {formatCredits(available)} + {formatCredits(pack.credits)} ={' '}
                <span className="font-semibold text-foreground">{formatCredits(after)} Credits</span>
              </span>
            </div>
            <div className="glass-field mt-2 flex h-2.5 overflow-hidden rounded-full">
              <span
                className="h-full bg-foreground/30 transition-[width] duration-700 ease-(--ease-out-quint)"
                style={{ width: `${(available / after) * 100}%` }}
              />
              <span
                className="h-full rounded-r-full bg-foreground transition-[width] duration-700 ease-(--ease-out-quint)"
                style={{ width: `${(pack.credits / after) * 100}%` }}
              />
            </div>
            <div className="mt-1.5 flex gap-4 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-1.5 rounded-full bg-foreground/30" />
                Jetzt
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-1.5 rounded-full bg-foreground" />
                Dieses Paket
              </span>
            </div>
          </div>
        ) : null
      }
      listTitle="So funktioniert's"
      listKey="pack"
      items={['Sofort verfügbar', 'Zusätzlich zum Abo', 'Verfällt nicht', 'Bleibt beim Tarifwechsel erhalten']}
      itemIcon={Check}
      action={
        subscribed ? (
          <>
            <Button
              variant="prominent"
              className="h-12 w-full gap-2 rounded-full text-sm"
              disabled={disabled}
              onClick={onCheckout}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  {pack.label} kaufen
                  <span className="font-normal opacity-60">· {euro.format(pack.price)}</span>
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
            {onShowPlans ? (
              <button
                type="button"
                onClick={onShowPlans}
                className="mx-auto mt-3 flex items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Jeden Monat mehr nötig? Der größere Tarif ist günstiger pro Minute
                <ArrowRight className="size-3" />
              </button>
            ) : null}
          </>
        ) : (
          <>
            <p className="mb-3 text-center text-xs text-muted-foreground">
              Nachkaufen geht zusätzlich zu einem Tarif.
            </p>
            <Button
              variant="prominent"
              className="h-12 w-full gap-2 rounded-full text-sm"
              onClick={() => onShowPlans?.()}
            >
              Erst einen Tarif wählen
              <ArrowRight className="size-4" />
            </Button>
          </>
        )
      }
      error={error}
    />
  )
}

function DetailCard({
  eyebrow,
  price,
  priceUnit,
  priceNote,
  meter,
  listTitle,
  listKey,
  items,
  itemIcon: ItemIcon,
  action,
  error,
}: {
  eyebrow: string
  price: string
  priceUnit: string
  priceNote: string
  meter?: React.ReactNode
  listTitle: string
  listKey: string
  items: string[]
  itemIcon: React.ComponentType<{ className?: string }>
  action: React.ReactNode
  error: string | null
}) {
  return (
    <section className="glass-tile flex flex-col rounded-3xl p-5 sm:p-7 md:min-h-[28rem]">
      <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{eyebrow}</p>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-5xl leading-none font-semibold tracking-[-0.03em] tabular-nums">{price}</span>
        <span className="text-sm text-muted-foreground">{priceUnit}</span>
      </p>
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">{priceNote}</p>

      {meter ? <div className="mt-6">{meter}</div> : null}

      <div className="mt-6 border-t border-foreground/[0.07] pt-5">
        <p className="text-xs font-medium text-muted-foreground">{listTitle}</p>
        {/* Neu eingehängt, sobald sich die Wahl ändert — die Liste taucht
            auf, statt stumm auszutauschen. */}
        <ul key={listKey} className="mt-3 grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
          {items.map((item, index) => (
            <li
              key={item}
              className="rise-in flex items-start gap-2.5 text-sm"
              style={{ animationDelay: `${index * 35}ms` }}
            >
              <span className="glass-lens mt-px flex size-[1.125rem] shrink-0 items-center justify-center rounded-full">
                <ItemIcon className="size-2.5" />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto pt-7">
        {action}
        {error ? (
          <p role="alert" className="mt-3 text-center text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  )
}
