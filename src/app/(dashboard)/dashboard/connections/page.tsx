'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarClock, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { SocialPlatform } from '@/types/database'
import { AccountCard } from '@/components/social/AccountCard'
import { PlatformConnectCard } from '@/components/social/PlatformConnectCard'
import { PlatformLogo } from '@/components/landing/PlatformLogo'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { useOAuthCallbackToast } from '@/hooks/use-oauth-callback'
import { PublishingNotice } from '@/components/publishing/PublishingNotice'
import { accountsInPlan, disconnectSocialAccount, updateSocialAccount, useSocialAccounts, type PlatformCapability } from '@/lib/publishing-client'
import { PLATFORM_LABEL } from '@/lib/social-labels'

const PLATFORMS: SocialPlatform[] = ['youtube', 'instagram', 'tiktok']
const UNAVAILABLE: PlatformCapability = { configured: false, canAutoPublish: false, notice: 'Die Plattform-Verbindung ist noch nicht eingerichtet.' }

export default function ConnectionsPage() {
  const { data, error, loading, refresh, setData } = useSocialAccounts()
  const accounts = data?.accounts.filter((account) => account.status !== 'revoked') ?? []
  const connected = new Set(accounts.map((account) => account.platform))
  // Kanal-Limit des Tarifs: Darüber gibt es keine neuen Verbindungen, und
  // Kanäle aus einem früheren, größeren Tarif werden nicht mehr beliefert.
  const limit = data?.channelLimit
  const atLimit = limit !== undefined && accounts.length >= limit
  const inPlan = accountsInPlan(accounts, limit)
  const outsidePlan = accounts.filter((account) => !inPlan.has(account.id))
  const available = atLimit ? [] : PLATFORMS.filter((platform) => !connected.has(platform))
  const more = atLimit || data?.configured === false || error ? []
    : PLATFORMS.filter((platform) => connected.has(platform) && data?.capabilities[platform]?.configured)

  useOAuthCallbackToast('Wähle jetzt die gewünschte Automatisierung. Neue Kanäle starten ohne Auto-Publish.')

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <PageHeader
          title="Kanäle"
          description="Verbinde deine Kanäle einmal. Danach bestimmst du pro Kanal, ob Ocuris Clips nur erstellt, dir zur Freigabe vorlegt oder selbst veröffentlicht."
          action={
            <Button variant="outline" size="sm" className="rounded-full" nativeButton={false} render={<Link href="/dashboard/calendar" />}>
              <CalendarClock className="size-3.5" />Zur Queue<ArrowRight className="size-3.5" />
            </Button>
          }
        />

        <PublishingNotice error={error} configured={data?.configured} detail={data?.error} onRetry={refresh} />

        {loading ? (
          <div role="status" aria-label="Kanäle werden geladen" className="mt-10 grid gap-4 sm:grid-cols-3">
            {PLATFORMS.map((platform) => <div key={platform} className="glass-tile h-64 animate-pulse rounded-2xl" />)}
          </div>
        ) : null}

        {accounts.length ? (
          <section aria-labelledby="connected-heading" className="mt-10">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="connected-heading" className="flex items-baseline gap-2 text-base font-semibold tracking-tight">
                Verbunden
                <span className="text-sm font-normal text-muted-foreground tabular-nums">
                  {limit !== undefined ? `${accounts.length} von ${limit}` : accounts.length}
                </span>
              </h2>
              {atLimit && !outsidePlan.length ? (
                <p className="text-xs text-muted-foreground">
                  Alle Kanäle deines Tarifs sind belegt ·{' '}
                  <Link href="/dashboard/billing" className="font-medium text-foreground underline underline-offset-4">Tarif wechseln</Link>
                </p>
              ) : more.length ? (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="rounded-full" />}>
                    <Plus className="size-3.5" />Kanal hinzufügen
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-auto min-w-48">
                    {more.map((platform) => (
                      <DropdownMenuItem key={platform} render={<a href={`/api/oauth/${platform}`} />}>
                        <PlatformLogo platform={platform} className="size-4" />{PLATFORM_LABEL[platform]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
            {outsidePlan.length ? (
              <p role="alert" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm leading-relaxed">
                {outsidePlan.map((account) => account.platform_username ?? PLATFORM_LABEL[account.platform]).join(', ')}{' '}
                {outsidePlan.length === 1 ? 'liegt' : 'liegen'} über dem Kanal-Limit deines Tarifs und {outsidePlan.length === 1 ? 'wird' : 'werden'} nicht beliefert.
                Trenne einen Kanal oder <Link href="/dashboard/billing" className="font-medium underline underline-offset-4">wechsle den Tarif</Link>.
              </p>
            ) : null}
            <div className="flex flex-col gap-3">
              {accounts.map((account) => (
                <AccountCard
                  key={`${account.id}:${account.updated_at}:${account.automation_mode}:${account.auto_publish_min_score}`}
                  account={account}
                  capability={data?.capabilities[account.platform] ?? UNAVAILABLE}
                  onSave={async (settings) => {
                    try {
                      const updated = await updateSocialAccount(account.id, settings)
                      setData((current) => current ? { ...current, accounts: current.accounts.map((item) => item.id === updated.id ? updated : item) } : current)
                      toast.success(settings.automation_mode === 'auto_publish' ? 'Auto-Publish aktiviert' : 'Einstellungen gespeichert', { description: 'Gilt für neue Link-Importe. Bereits eingeplante Clips bleiben unverändert.' })
                    } catch (cause) {
                      toast.error('Einstellungen nicht gespeichert', { description: cause instanceof Error ? cause.message : 'Bitte versuche es erneut.' })
                    }
                  }}
                  onDisconnect={async () => {
                    try {
                      await disconnectSocialAccount(account.id)
                      setData((current) => current ? { ...current, accounts: current.accounts.filter((item) => item.id !== account.id) } : current)
                      toast.success('Kanal getrennt', { description: 'Wartende Veröffentlichungen dieses Kanals wurden abgebrochen.' })
                    } catch (cause) {
                      toast.error('Kanal konnte nicht getrennt werden', { description: cause instanceof Error ? cause.message : 'Bitte versuche es erneut.' })
                    }
                  }}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!loading && available.length > 0 ? (
          <section aria-labelledby="platforms-heading" className="mt-10">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="platforms-heading" className="text-base font-semibold tracking-tight">
                {accounts.length ? 'Weitere Plattformen' : 'Plattform verbinden'}
              </h2>
              <p className="text-xs text-muted-foreground">Die Anmeldung läuft direkt bei der Plattform.</p>
            </div>
            <div className={cn('grid gap-4', available.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
              {available.map((platform) => {
                const capability = data?.capabilities[platform] ?? UNAVAILABLE
                return (
                  <PlatformConnectCard
                    key={platform}
                    platform={platform}
                    capability={capability}
                    enabled={capability.configured && data?.configured !== false && !error}
                    primary={accounts.length === 0}
                  />
                )
              })}
            </div>
          </section>
        ) : null}

        {!loading && data ? (
          <footer className="mt-10 flex flex-wrap items-start justify-between gap-4 border-t border-foreground/[0.06] pt-5">
            <ul className="max-w-xl space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              <FooterNote>Gilt ab deinem nächsten Link. Bereits erstellte Clips werden nicht nachträglich veröffentlicht.</FooterNote>
              <FooterNote>Veröffentlicht wird die ursprüngliche Clip-Version, ohne spätere Änderungen im Editor.</FooterNote>
              <FooterNote>
                Zwischen zwei Clips eines Kanals liegen 8 Stunden. Zeitpunkt und Status siehst du in der{' '}
                <Link href="/dashboard/calendar" className="text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground">Queue</Link>.
              </FooterNote>
            </ul>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={refresh}><RefreshCw className="size-3.5" />Aktualisieren</Button>
          </footer>
        ) : null}
      </div>
    </ScrollArea>
  )
}

function FooterNote({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className="mt-[0.5rem] size-1 shrink-0 rounded-full bg-muted-foreground/50" />
      <span>{children}</span>
    </li>
  )
}
