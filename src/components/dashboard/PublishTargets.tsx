'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowUpRight, ChevronDown, Plus, Settings2 } from 'lucide-react'
import type { AutomationMode, SocialAccount, SocialPlatform } from '@/types/database'
import { accountsInPlan, updateSocialAccount, useSocialAccounts, type PlatformCapability } from '@/lib/publishing-client'
import { PLATFORM_LABEL } from '@/lib/social-labels'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { LANDING_PLATFORMS, PlatformLogo } from '@/components/landing/PlatformLogo'

/**
 * Wohin die Clips gehen — als Glaspille über dem Feld, in das der Link kommt.
 *
 * Geschlossen zeigt sie auf einen Blick, wie viele Konten gerade beliefert
 * werden; geöffnet ein Schalter je Konto: an heißt „veröffentlichen", aus
 * heißt „nur Clips erstellen". Welche Stufe „an" ist, entscheidet die
 * Plattform — wo Ocuris selbst posten darf, vollautomatisch, sonst über die
 * Freigabe-Queue. Mindest-Score und Trennen bleiben auf der Kanäle-Seite.
 */
export function PublishTargets() {
  const { data, error, loading, setData } = useSocialAccounts()
  // Der Schalter steht sofort auf dem Ziel; schlägt das Speichern fehl,
  // springt er mit der Fehlermeldung zurück.
  const [pending, setPending] = useState<{ id: string; on: boolean } | null>(null)

  // Ohne Einrichtung lässt sich nichts verbinden; den Grund erklärt die
  // Kanäle-Seite. Auf der Übersicht bliebe nur eine Fehlermeldung über dem Hero.
  if (error || data?.configured === false) return null

  if (loading || !data) {
    return (
      <div aria-hidden className="flex h-12 items-center justify-center">
        <div className="h-12 w-60 animate-pulse rounded-full bg-foreground/[0.05]" />
      </div>
    )
  }

  const accounts = data.accounts.filter((account) => account.status !== 'revoked')
  const inPlan = accountsInPlan(accounts, data.channelLimit)
  const atLimit = data.channelLimit !== undefined && accounts.length >= data.channelLimit

  const rows = accounts.map((account) => {
    const capability = data.capabilities[account.platform]
    const overLimit = !inPlan.has(account.id)
    const healthy = account.status === 'active'
    const usable = healthy && capability.configured && !overLimit
    const mode: AutomationMode = pending?.id === account.id
      ? pending.on ? capability.canAutoPublish ? 'auto_publish' : 'review_queue' : 'manual'
      : account.automation_mode
    return { account, capability, overLimit, healthy, usable, mode, on: usable && mode !== 'manual' }
  })
  const activeCount = rows.filter((row) => row.on).length
  const attention = rows.some((row) => !row.usable)

  async function toggle(account: SocialAccount, capability: PlatformCapability, on: boolean) {
    // Eins nach dem anderen — ohne dafür alle Schalter auszugrauen.
    if (pending) return
    const mode: AutomationMode = !on ? 'manual' : capability.canAutoPublish ? 'auto_publish' : 'review_queue'
    const name = accountName(account)
    setPending({ id: account.id, on })
    try {
      const updated = await updateSocialAccount(account.id, {
        automation_mode: mode,
        auto_publish_min_score: account.auto_publish_min_score,
      })
      setData((current) => current
        ? { ...current, accounts: current.accounts.map((item) => item.id === updated.id ? updated : item) }
        : current)
      toast.success(
        mode === 'auto_publish' ? `${name}: Auto-Publish an` : mode === 'review_queue' ? `${name}: Freigabe-Queue an` : `${name}: Veröffentlichen aus`,
        {
          description: mode === 'auto_publish'
            ? `Clips ab Score ${account.auto_publish_min_score} aus neuen Links gehen automatisch online.`
            : mode === 'review_queue'
              ? 'Clips aus neuen Links warten auf deine Freigabe.'
              : 'Aus neuen Links entstehen nur Clips. Bereits eingeplante bleiben unverändert.',
        },
      )
    } catch (cause) {
      toast.error('Nicht gespeichert', { description: cause instanceof Error ? cause.message : 'Bitte versuche es erneut.' })
    } finally {
      setPending(null)
    }
  }

  const summary = !accounts.length ? 'Kein Konto verbunden'
    : activeCount === 0 ? 'Pausiert · nur Clips'
      : `${activeCount} von ${accounts.length} ${accounts.length === 1 ? 'Konto' : 'Konten'} aktiv`

  return (
    <div className="flex justify-center">
      <Popover>
        <PopoverTrigger
          className={cn(
            'glass liquid-press group/targets relative inline-flex h-12 items-center gap-3 rounded-full py-1.5 pr-4 pl-1.5 text-left outline-none',
            'focus-visible:ring-3 focus-visible:ring-ring/50',
          )}
        >
          <AccountStack accounts={accounts} activeIds={new Set(rows.filter((row) => row.on).map((row) => row.account.id))} />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-[13px] font-semibold tracking-tight">Auto-Publish</span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <LiveDot state={attention ? 'attention' : activeCount ? 'live' : 'idle'} />
              {summary}
            </span>
          </span>
          <ChevronDown className="ml-1 size-4 text-muted-foreground transition-transform duration-300 ease-(--ease-out-quint) group-aria-expanded/targets:rotate-180" />
        </PopoverTrigger>

        <PopoverContent sideOffset={10} className="w-[min(23rem,calc(100vw-2rem))] gap-0 p-0">
          <div className="flex items-start justify-between gap-4 px-4 pt-4 pb-3">
            <div className="min-w-0">
              <PopoverTitle className="font-display text-[15px] font-semibold tracking-tight">Automatisch veröffentlichen</PopoverTitle>
              <PopoverDescription className="mt-0.5 text-xs leading-relaxed">
                {accounts.length ? 'Auf welche Konten gehen Clips aus neuen Links?' : 'Verbinde ein Konto — danach gehen neue Clips von selbst raus.'}
              </PopoverDescription>
            </div>
            {accounts.length ? (
              <span className="mt-0.5 shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                {activeCount}/{accounts.length}
              </span>
            ) : null}
          </div>

          <ul className="flex flex-col gap-1 border-t border-foreground/[0.06] p-1.5">
            {rows.map(({ account, capability, overLimit, healthy, usable, mode, on }, index) => {
              const name = accountName(account)
              const stagger = { animationDelay: `${60 + index * 45}ms` }

              // Kein Schalter, wo er nichts schalten würde — stattdessen führt
              // die Zeile direkt zur Lösung: neu anmelden oder Tarif wechseln.
              if (overLimit || (!healthy && capability.configured)) {
                const content = <>
                  <AccountMark account={account} />
                  <RowText name={name} hint={overLimit ? 'Über dem Tarif-Limit' : 'Verbindung abgelaufen · neu verbinden'} tone="alert" />
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover/row:translate-x-0.5 group-hover/row:-translate-y-0.5" />
                </>
                const className = cn(ROW, 'group/row hover:bg-foreground/[0.05] outline-none focus-visible:ring-3 focus-visible:ring-ring/50')
                return (
                  <li key={account.id} className="rise-in" style={stagger}>
                    {overLimit
                      ? <Link href="/dashboard/billing" className={className}>{content}</Link>
                      // OAuth-Start ist eine Server-Route mit Weiterleitung, keine Seite.
                      : <a href={`/api/oauth/${account.platform}`} className={className}>{content}</a>}
                  </li>
                )
              }

              const hint = !usable ? 'Plattform gerade nicht verfügbar'
                : !on ? 'Aus · nur Clips erstellen'
                  : mode === 'auto_publish' ? `Vollautomatisch · ab Score ${account.auto_publish_min_score}`
                    : 'Nach deiner Freigabe'
              return (
                <li key={account.id} className="rise-in" style={stagger}>
                  <label
                    className={cn(
                      ROW,
                      on ? 'glass-lens' : 'hover:bg-foreground/[0.04]',
                      usable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                      'has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                    )}
                  >
                    <AccountMark account={account} />
                    <RowText name={name} hint={hint} tone={on ? 'on' : 'off'} />
                    <Switch
                      checked={on}
                      disabled={!usable}
                      onCheckedChange={(next) => void toggle(account, capability, next)}
                      aria-label={`Clips automatisch auf ${name} (${PLATFORM_LABEL[account.platform]}) veröffentlichen`}
                    />
                  </label>
                </li>
              )
            })}

            {/* Ohne Konto stehen hier die drei Plattformen selbst — ein Klick
                startet die Anmeldung, statt erst auf eine andere Seite zu führen. */}
            {!accounts.length ? LANDING_PLATFORMS.map((platform, index) => (
              <li key={platform} className="rise-in" style={{ animationDelay: `${60 + index * 45}ms` }}>
                <ConnectRow platform={platform} configured={data.capabilities[platform].configured} />
              </li>
            )) : null}
          </ul>

          <div className="flex items-center gap-1 border-t border-foreground/[0.06] p-1.5">
            {accounts.length && !atLimit ? (
              <Link href="/dashboard/connections" className={FOOTER_LINK}>
                <Plus className="size-3.5" />Konto hinzufügen
              </Link>
            ) : null}
            <Link href="/dashboard/connections" className={cn(FOOTER_LINK, accounts.length && !atLimit ? '' : 'flex-1 justify-center')}>
              <Settings2 className="size-3.5" />Kanäle verwalten
            </Link>
          </div>
          {accounts.length ? (
            <p className="px-4 pb-3 text-[11px] leading-relaxed text-muted-foreground/80">
              Gilt für neue Links. Bereits eingeplante Clips bleiben unverändert.
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}

const ROW = 'flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-[background-color,box-shadow,opacity] duration-200'
const FOOTER_LINK = 'flex h-9 flex-1 items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'

function accountName(account: SocialAccount): string {
  return account.platform_username ?? PLATFORM_LABEL[account.platform]
}

function RowText({ name, hint, tone }: { name: string; hint: string; tone: 'on' | 'off' | 'alert' }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col leading-tight">
      <span className="truncate text-[13px] font-medium text-foreground">{name}</span>
      <span className={cn('mt-0.5 truncate text-[11px]', tone === 'alert' ? 'text-destructive' : tone === 'on' ? 'text-foreground/70' : 'text-muted-foreground')}>
        {hint}
      </span>
    </span>
  )
}

function ConnectRow({ platform, configured }: { platform: SocialPlatform; configured: boolean }) {
  const content = <>
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.06]">
      <PlatformLogo platform={platform} className="size-4" />
    </span>
    <RowText name={PLATFORM_LABEL[platform]} hint={configured ? 'Mit deinem Konto anmelden' : 'Noch nicht verfügbar'} tone="off" />
    {configured ? <span className="shrink-0 rounded-full bg-foreground/[0.07] px-2.5 py-1 text-[11px] font-medium transition-colors group-hover/row:bg-foreground/[0.12]">Verbinden</span> : null}
  </>
  return configured
    ? <a href={`/api/oauth/${platform}`} className={cn(ROW, 'group/row hover:bg-foreground/[0.04] outline-none focus-visible:ring-3 focus-visible:ring-ring/50')}>{content}</a>
    : <div className={cn(ROW, 'opacity-60')}>{content}</div>
}

/**
 * Bis zu drei Konten übereinander, die belieferten voll, die pausierten
 * blass. Ohne Konto stehen dort die drei Plattformen als Versprechen.
 */
function AccountStack({ accounts, activeIds }: { accounts: SocialAccount[]; activeIds: Set<string> }) {
  const shown = accounts.slice(0, 3)
  const extra = accounts.length - shown.length
  return (
    <span className={cn('flex shrink-0 items-center pl-0.5', shown.length ? '-space-x-2.5' : 'gap-1')}>
      {shown.length ? shown.map((account) => (
        <span
          key={account.id}
          className={cn(
            'relative rounded-full ring-2 ring-background transition-[opacity,filter] duration-300',
            activeIds.has(account.id) ? '' : 'opacity-45 grayscale',
          )}
        >
          <AccountAvatar account={account} className="size-8" />
        </span>
      )) : LANDING_PLATFORMS.map((platform) => (
        <span key={platform} className="flex size-7 items-center justify-center rounded-full bg-foreground/[0.06]">
          <PlatformLogo platform={platform} className="size-3 opacity-60" />
        </span>
      ))}
      {extra > 0 ? (
        <span className="flex size-8 items-center justify-center rounded-full bg-foreground/[0.08] text-[10px] font-semibold tabular-nums ring-2 ring-background">+{extra}</span>
      ) : null}
    </span>
  )
}

function AccountAvatar({ account, className }: { account: SocialAccount; className?: string }) {
  return (
    <Avatar className={className}>
      {account.avatar_url ? <AvatarImage src={account.avatar_url} alt="" /> : null}
      <AvatarFallback className="bg-foreground/[0.08]"><PlatformLogo platform={account.platform} className="size-3.5" /></AvatarFallback>
    </Avatar>
  )
}

/** Profilbild mit Plattform-Plakette wie auf der Kanäle-Seite. */
function AccountMark({ account }: { account: SocialAccount }) {
  return (
    <span className="relative shrink-0">
      <AccountAvatar account={account} className="size-9" />
      {account.avatar_url ? (
        <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-background ring-1 ring-foreground/10">
          <PlatformLogo platform={account.platform} className="size-2" />
        </span>
      ) : null}
    </span>
  )
}

/** Pulsiert, solange wirklich etwas rausgeht — sonst steht er still. */
function LiveDot({ state }: { state: 'live' | 'idle' | 'attention' }) {
  return (
    <span aria-hidden className="relative flex size-1.5 shrink-0">
      {state === 'live' ? <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-70 motion-reduce:hidden" /> : null}
      <span className={cn(
        'relative size-1.5 rounded-full',
        state === 'live' ? 'bg-primary' : state === 'attention' ? 'bg-amber-500' : 'bg-foreground/30',
      )} />
    </span>
  )
}
