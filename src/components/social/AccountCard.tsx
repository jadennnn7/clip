'use client'

import React, { useId, useState } from 'react'
import { Clock, Ellipsis, ExternalLink, Hand, Info, Loader2, Lock, TriangleAlert, Unplug, Zap } from 'lucide-react'
import type { AutomationMode, SocialAccount, SocialPlatform } from '@/types/database'
import type { PlatformCapability } from '@/lib/publishing-client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { AUTOMATION_LABEL, PLATFORM_LABEL } from '@/lib/social-labels'
import { singleValue } from '@/lib/slider-value'
import { PlatformLogo } from '@/components/landing/PlatformLogo'

/** `short` steht auf dem Telefon, wo drei volle Namen nebeneinander nicht passen. */
const MODES: Array<{ value: AutomationMode; short: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'auto_publish', short: 'Automatisch', icon: Zap },
  { value: 'review_queue', short: 'Freigabe', icon: Clock },
  { value: 'manual', short: 'Nur rendern', icon: Hand },
]

/** Warum Vollautomatisch gesperrt ist: kurz in der Karte, ausführlich hinter „Mehr". */
const LOCKED: Record<SocialPlatform, { short: string; long: string }> = {
  youtube: {
    short: 'Vollautomatisch folgt, sobald YouTube Ocuris freigegeben hat. Bis dahin sind Uploads privat.',
    long: 'YouTube muss zuerst die App von Ocuris freigeben. Das erledigt der Betreiber von Ocuris; du kannst diese Freigabe nicht in deinem Kanal aktivieren. Bis dahin sind Uploads privat.',
  },
  instagram: {
    short: 'Vollautomatisch folgt, sobald Meta Ocuris für Instagram freigegeben hat.',
    long: 'Der Betreiber von Ocuris muss zuerst die Instagram-Anbindung für öffentliche Veröffentlichungen freischalten. Du benötigst zusätzlich ein Instagram-Professional-Konto.',
  },
  tiktok: {
    short: 'Bei TikTok gibst du jeden Post selbst frei, mit Sichtbarkeit pro Clip.',
    long: 'TikTok benötigt für jeden Direct Post deine Sichtbarkeitsauswahl und Freigabe in der Clip-Vorschau. Öffentliche Direct Posts benötigen zusätzlich das TikTok-App-Audit.',
  },
}

function describe(mode: AutomationMode, platform: SocialPlatform, canAutoPublish: boolean): string {
  if (mode === 'auto_publish') return 'Neue Clips gehen ab dem Mindest-Score automatisch öffentlich raus.'
  if (mode === 'manual') return 'Ocuris erstellt nur Clips. Es wird nichts veröffentlicht.'
  if (platform === 'tiktok') return 'Du prüfst jeden Clip, gibst ihn frei und veröffentlichst ihn in TikTok.'
  return canAutoPublish
    ? 'Du gibst Clips frei, Ocuris veröffentlicht sie danach zum geplanten Zeitpunkt.'
    : 'Du prüfst jeden Clip und gibst ihn einzeln frei.'
}

interface AccountCardProps {
  account: SocialAccount
  capability: PlatformCapability
  onSave: (settings: { automation_mode: AutomationMode; auto_publish_min_score: number }) => Promise<void>
  onDisconnect: () => Promise<void>
}

/**
 * Ein verbundener Kanal als eine Zeile: wer, wie verbunden, was nach dem
 * nächsten Link passiert.
 *
 * Der Modus speichert beim Umschalten. Nur Vollautomatisch fragt vorher nach
 * dem Mindest-Score und einer Bestätigung — das ist der eine Schritt, nach
 * dem Ocuris ohne Rückfrage öffentlich postet. Trennen liegt im Menü und
 * fragt nach, weil es wartende Veröffentlichungen abbricht.
 */
export function AccountCard({ account, capability, onSave, onDisconnect }: AccountCardProps) {
  const [busy, setBusy] = useState<AutomationMode | 'disconnect' | null>(null)
  const [confirmAuto, setConfirmAuto] = useState(false)
  const [minScore, setMinScore] = useState(account.auto_publish_min_score)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const scoreId = useId()

  const mode = account.automation_mode
  const shown = confirmAuto ? 'auto_publish' : mode
  const isHealthy = account.status === 'active'
  const editable = isHealthy && capability.configured && !busy
  // Bei abgelaufener Verbindung zählt nur der eine Hinweis: neu verbinden.
  const locked = isHealthy && capability.configured && !capability.canAutoPublish
  const name = account.platform_username ?? PLATFORM_LABEL[account.platform]

  async function save(next: AutomationMode, score = minScore) {
    setBusy(next)
    try { await onSave({ automation_mode: next, auto_publish_min_score: score }) }
    finally { setBusy(null) }
  }

  function choose(next: AutomationMode) {
    if (next === 'auto_publish') {
      if (mode !== 'auto_publish') setConfirmAuto(true)
      return
    }
    setConfirmAuto(false)
    setMinScore(account.auto_publish_min_score)
    if (next !== mode) void save(next)
  }

  async function disconnect() {
    setBusy('disconnect')
    try { await onDisconnect() }
    finally { setBusy(null); setDisconnectOpen(false) }
  }

  return (
    <article className="glass-tile rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ChannelAvatar account={account} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className={cn('size-1.5 rounded-full', isHealthy ? 'bg-emerald-500' : 'bg-destructive')} />
              {PLATFORM_LABEL[account.platform]}
              <span className="sr-only">{isHealthy ? ', verbunden' : ', Verbindung abgelaufen'}</span>
            </p>
          </div>
        </div>

        <div className="order-last flex w-full items-center gap-2 sm:order-none sm:w-auto">
          <div role="radiogroup" aria-label={`Nach dem nächsten Link bei ${name}`} className="grid flex-1 grid-cols-3 gap-0.5 rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] p-0.5 sm:inline-grid sm:flex-none">
            {MODES.map((option) => {
              const selected = shown === option.value
              const unavailable = option.value === 'auto_publish' && !capability.canAutoPublish
              const Icon = busy === option.value ? Loader2 : unavailable ? Lock : option.icon
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!editable || (unavailable && !selected)}
                  title={unavailable ? 'Noch nicht verfügbar' : undefined}
                  onClick={() => choose(option.value)}
                  className={cn(
                    'transition-ui inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-[10px] px-1.5 text-xs sm:px-2.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed',
                    selected ? 'glass-lens font-medium text-foreground' : 'text-muted-foreground enabled:hover:text-foreground',
                    unavailable && !selected && 'opacity-50',
                  )}
                >
                  <Icon className={cn('size-3.5', busy === option.value ? 'animate-spin' : 'max-sm:hidden')} />
                  <span className="sm:hidden">{option.short}</span>
                  <span className="max-sm:hidden">{AUTOMATION_LABEL[option.value]}</span>
                </button>
              )
            })}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="shrink-0 rounded-full text-muted-foreground" />} aria-label={`Weitere Aktionen für ${name}`}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-44">
              {capability.configured ? (
                <DropdownMenuItem render={<a href={`/api/oauth/${account.platform}`} />}><ExternalLink />Neu verbinden</DropdownMenuItem>
              ) : null}
              <DropdownMenuItem variant="destructive" onClick={() => setDisconnectOpen(true)}><Unplug />Verbindung trennen</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-xs leading-relaxed">
        {!isHealthy ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-destructive">
            <TriangleAlert className="size-3.5 shrink-0" />
            Die Verbindung ist abgelaufen. Bis du den Kanal neu verbindest, wird nichts veröffentlicht.
            {capability.configured ? (
              <a href={`/api/oauth/${account.platform}`} className="font-medium text-foreground underline underline-offset-4">Neu verbinden</a>
            ) : null}
          </p>
        ) : (
          <p className="text-muted-foreground">{describe(shown, account.platform, capability.canAutoPublish)}</p>
        )}

        {locked ? (
          <p className="flex items-start gap-1.5 text-muted-foreground">
            <Lock className="mt-0.5 size-3 shrink-0" />
            <span>
              {LOCKED[account.platform].short}{' '}
              <Popover>
                <PopoverTrigger className="rounded-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
                  Mehr
                </PopoverTrigger>
                <PopoverContent align="start" className="p-3.5 text-xs leading-relaxed">
                  {LOCKED[account.platform].long}
                </PopoverContent>
              </Popover>
            </span>
          </p>
        ) : null}

        {/* Ist Vollautomatisch gesperrt, erklärt das die Zeile darüber — derselbe Hinweis zweimal las sich wie zwei Probleme. */}
        {capability.notice && !locked ? (
          <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
            <Info className="mt-0.5 size-3 shrink-0" />
            {capability.notice}
          </p>
        ) : null}
        {account.last_error ? <p className="break-words text-destructive">{account.last_error}</p> : null}
      </div>

      {shown === 'auto_publish' && capability.canAutoPublish && isHealthy ? (
        <div className="mt-4 space-y-3 rounded-xl bg-foreground/[0.03] p-3.5 ring-1 ring-foreground/[0.06]">
          <div className="flex items-center justify-between">
            <Label id={scoreId} className="text-xs text-muted-foreground">Mindest-Score</Label>
            <span className="font-mono text-xs tabular-nums">{minScore}</span>
          </div>
          <Slider aria-labelledby={scoreId} value={[minScore]} min={0} max={100} step={5} disabled={!editable} onValueChange={(value) => setMinScore(singleValue(value))} />
          <p className="text-xs leading-relaxed text-muted-foreground">
            KI-geprüfte Clips ab Score {minScore} werden automatisch veröffentlicht. Clips darunter oder ohne KI-Prüfung warten auf deine Freigabe.
          </p>
          {confirmAuto ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" className="rounded-full" disabled={!!busy} onClick={() => { setConfirmAuto(false); setMinScore(account.auto_publish_min_score) }}>Abbrechen</Button>
              <Button size="sm" className="rounded-full" disabled={!editable} onClick={() => void save('auto_publish')}>
                {busy === 'auto_publish' ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                Vollautomatisch aktivieren
              </Button>
            </div>
          ) : minScore !== account.auto_publish_min_score ? (
            <div className="flex justify-end">
              <Button size="sm" className="rounded-full" disabled={!editable} onClick={() => void save('auto_publish')}>
                {busy === 'auto_publish' ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Mindest-Score speichern
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog open={disconnectOpen} onOpenChange={(open) => { if (!open && busy !== 'disconnect') setDisconnectOpen(false) }}>
        <DialogContent>
          <DialogTitle>{name} trennen?</DialogTitle>
          <DialogDescription>
            Ocuris nimmt für diesen Kanal keine neuen Aufträge mehr an und bricht wartende Veröffentlichungen ab. Du kannst ihn jederzeit wieder verbinden.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy === 'disconnect'} onClick={() => setDisconnectOpen(false)}>Behalten</Button>
            <Button variant="destructive" disabled={busy === 'disconnect'} aria-busy={busy === 'disconnect'} onClick={() => void disconnect()}>
              {busy === 'disconnect' ? <><Loader2 className="animate-spin" />Wird getrennt …</> : 'Verbindung trennen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  )
}

function ChannelAvatar({ account }: { account: SocialAccount }) {
  if (!account.avatar_url) {
    return (
      <span className="glass-lens flex size-10 shrink-0 items-center justify-center rounded-xl">
        <PlatformLogo platform={account.platform} className="size-5" />
      </span>
    )
  }
  return (
    <span className="relative shrink-0">
      <Avatar className="size-10">
        <AvatarImage src={account.avatar_url} alt="" />
        <AvatarFallback><PlatformLogo platform={account.platform} className="size-5" /></AvatarFallback>
      </Avatar>
      <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-background ring-1 ring-foreground/10">
        <PlatformLogo platform={account.platform} className="size-2.5" />
      </span>
    </span>
  )
}
