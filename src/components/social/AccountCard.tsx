'use client'

import React, { useId, useState } from 'react'
import { CircleCheck, TriangleAlert, Clock, Zap, Hand, Loader2, ExternalLink } from 'lucide-react'
import type { AutomationMode, SocialAccount } from '@/types/database'
import type { PlatformCapability } from '@/lib/publishing-client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { AUTOMATION_LABEL, PLATFORM_LABEL } from '@/lib/social-labels'
import { singleValue } from '@/lib/slider-value'
import { PlatformLogo } from '@/components/landing/PlatformLogo'

const AUTOMATION_OPTIONS: Array<{
  value: AutomationMode
  icon: React.ComponentType<{ className?: string }>
}> = [
  { value: 'auto_publish', icon: Zap },
  { value: 'review_queue', icon: Clock },
  { value: 'manual', icon: Hand },
]

interface AccountCardProps {
  account: SocialAccount
  capability: PlatformCapability
  onSave: (settings: { automation_mode: AutomationMode; auto_publish_min_score: number }) => Promise<void>
  onDisconnect: () => Promise<void>
}

export function AccountCard({ account, capability, onSave, onDisconnect }: AccountCardProps) {
  const [mode, setMode] = useState(account.automation_mode)
  const [minScore, setMinScore] = useState(account.auto_publish_min_score)
  const [busy, setBusy] = useState<'save' | 'disconnect' | null>(null)
  const modeId = useId()
  const scoreId = useId()
  const isHealthy = account.status === 'active'
  const changed = mode !== account.automation_mode || minScore !== account.auto_publish_min_score
  const canSave = changed && isHealthy && capability.configured && (mode !== 'auto_publish' || capability.canAutoPublish)
  const tiktok = account.platform === 'tiktok'
  const blockedReason = account.platform === 'youtube'
    ? 'YouTube muss zuerst die App von Clyp freigeben. Das erledigt der Betreiber von Clyp; du kannst diese Freigabe nicht in deinem Kanal aktivieren. Bis dahin sind Uploads privat.'
    : tiktok
      ? 'TikTok erlaubt in dieser Anbindung nur den Upload in deine Inbox. Den letzten Schritt zur Veröffentlichung erledigst du in TikTok.'
      : 'Der Betreiber von Clyp muss zuerst die Instagram-Anbindung für öffentliche Veröffentlichungen freischalten. Du benötigst zusätzlich ein Instagram-Professional-Konto.'

  async function save() {
    setBusy('save')
    try { await onSave({ automation_mode: mode, auto_publish_min_score: minScore }) }
    finally { setBusy(null) }
  }

  async function disconnect() {
    setBusy('disconnect')
    try { await onDisconnect() }
    finally { setBusy(null) }
  }

  return (
    <article className="glass-tile flex flex-col gap-4 rounded-[1.25rem] p-5">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          {account.avatar_url ? (
            <>
              <Avatar className="size-11">
                <AvatarImage src={account.avatar_url} alt="" />
                <AvatarFallback><PlatformLogo platform={account.platform} className="size-5" /></AvatarFallback>
              </Avatar>
              <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-background ring-1 ring-foreground/10">
                <PlatformLogo platform={account.platform} className="size-2.5" />
              </span>
            </>
          ) : (
            <span className="glass-lens flex size-11 items-center justify-center rounded-2xl">
              <PlatformLogo platform={account.platform} className="size-5" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{account.platform_username ?? PLATFORM_LABEL[account.platform]}</p>
          <p className="text-xs text-muted-foreground">{PLATFORM_LABEL[account.platform]}</p>
        </div>
        <span className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium ring-1',
          isHealthy ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400' : 'bg-destructive/10 text-destructive ring-destructive/25',
        )}>
          {isHealthy ? <CircleCheck className="size-3" /> : <TriangleAlert className="size-3" />}
          {isHealthy ? 'Verbunden' : 'Neu verbinden'}
        </span>
      </div>

      {/* Ist Vollautomatisch gesperrt, erklärt das der Kasten unter den Optionen — derselbe Hinweis zweimal übereinander las sich wie zwei Probleme. */}
      {capability.notice && (capability.canAutoPublish || !capability.configured) ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
          <p className="text-xs leading-relaxed">{capability.notice}</p>
        </div>
      ) : null}
      {account.last_error ? <p className="break-words text-xs text-destructive">{account.last_error}</p> : null}

      <fieldset className="min-w-0 space-y-2">
        <legend className="mb-2 text-[0.6875rem] font-medium tracking-[0.12em] text-muted-foreground uppercase">Nach deinem nächsten Link</legend>
        {AUTOMATION_OPTIONS.map((option) => {
          const unavailable = option.value === 'auto_publish' && !capability.canAutoPublish
          const selected = option.value === mode
          return (
            <label
              key={option.value}
              className={cn(
                'flex items-start gap-3 rounded-2xl p-3 transition-[background-color,box-shadow] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50',
                selected ? 'glass-lens' : 'ring-1 ring-foreground/[0.07]',
                unavailable ? 'opacity-60' : selected ? 'cursor-pointer' : 'cursor-pointer hover:bg-foreground/[0.03]',
              )}
            >
              <input type="radio" name={modeId} value={option.value} checked={selected} onChange={() => setMode(option.value)} disabled={!!busy || !isHealthy || !capability.configured || unavailable} className="sr-only" />
              <span aria-hidden className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ring-1 transition-colors', selected ? 'bg-foreground ring-foreground' : 'ring-foreground/25')}>
                {selected ? <span className="size-1.5 rounded-full bg-background" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium"><option.icon className="size-3.5" />{AUTOMATION_LABEL[option.value]}{unavailable ? <span className="text-[10px] font-normal text-amber-700 dark:text-amber-400">Noch nicht verfügbar</span> : null}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{option.value === 'auto_publish' ? 'Link einfügen → Clips erstellen → automatisch öffentlich posten.' : option.value === 'review_queue' ? tiktok ? 'Clips prüfen und freigeben. Anschließend in TikTok veröffentlichen.' : !capability.canAutoPublish ? 'Clips vorbereiten und einzeln freigeben. Plattformbeschränkungen gelten weiterhin.' : 'Clips prüfen und einmal freigeben. Clyp veröffentlicht sie danach.' : 'Clips erstellen und im Editor bearbeiten. Es wird nichts veröffentlicht.'}</span>
              </span>
            </label>
          )
        })}
      </fieldset>

      {!capability.canAutoPublish && capability.configured ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs leading-relaxed">
          <p className="font-medium text-amber-700 dark:text-amber-400">{tiktok ? 'Der letzte Schritt bleibt in TikTok' : 'Warum ist Vollautomatisch noch gesperrt?'}</p>
          <p className="mt-1 text-muted-foreground">{blockedReason}</p>
          <p className="mt-2 font-medium">Du kannst jetzt „Freigabe-Queue“ wählen und Clips vorbereiten lassen.</p>
        </div>
      ) : null}

      {mode === 'auto_publish' ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label id={scoreId} className="text-xs text-muted-foreground">Mindest-Score</Label>
            <span className="font-mono text-xs tabular-nums">{minScore}</span>
          </div>
          <Slider aria-labelledby={scoreId} value={[minScore]} min={0} max={100} step={5} disabled={!!busy || !isHealthy || !capability.configured} onValueChange={(value) => setMinScore(singleValue(value))} />
          <p className="text-xs leading-relaxed text-muted-foreground">KI-geprüfte Clips ab Score {minScore} werden automatisch veröffentlicht. Clips darunter oder ohne KI-Prüfung warten auf deine Freigabe.</p>
        </div>
      ) : null}

      {mode !== 'manual' ? <p className="text-xs leading-relaxed text-muted-foreground">Clyp plant die Clips mit 8 Stunden Abstand. Den genauen Zeitpunkt und Status siehst du bei jedem Clip und in der Veröffentlichungs-Queue.</p> : null}

      {mode === 'auto_publish' && changed ? (
        <p className="rounded-xl bg-foreground/[0.04] p-3 text-xs leading-relaxed">Mit „Vollautomatisch aktivieren“ erlaubst du die automatische öffentliche Veröffentlichung neuer Clips auf diesem Kanal. Bereits eingeplante Clips bleiben unverändert.</p>
      ) : null}

      <Button className="rounded-full" disabled={!canSave || !!busy} onClick={() => void save()}>
        {busy === 'save' ? <Loader2 className="size-3.5 animate-spin" /> : null}
        {mode === 'auto_publish' && changed ? 'Vollautomatisch aktivieren' : changed ? mode === 'review_queue' ? 'Freigabe-Queue aktivieren' : 'Nur Clips erstellen aktivieren' : mode === 'auto_publish' ? 'Vollautomatisch ist aktiv' : mode === 'review_queue' ? 'Freigabe-Queue ist aktiv' : 'Nur Clips erstellen ist aktiv'}
      </Button>

      {!isHealthy && capability.configured ? (
        <Button variant="outline" className="rounded-full" nativeButton={false} render={<a href={`/api/oauth/${account.platform}`} />}><ExternalLink className="size-3.5" />Kanal neu verbinden</Button>
      ) : null}
      <div className="border-t border-foreground/[0.06] pt-3">
        <Button variant="ghost" size="sm" className="w-full rounded-full text-muted-foreground hover:text-destructive" disabled={!!busy} onClick={() => void disconnect()}>
          {busy === 'disconnect' ? <Loader2 className="size-3.5 animate-spin" /> : null}Verbindung trennen
        </Button>
        <p className="mt-1 text-center text-[11px] leading-relaxed text-muted-foreground">Stoppt neue Aufträge und bricht wartende Veröffentlichungen dieses Kanals ab.</p>
      </div>
    </article>
  )
}
