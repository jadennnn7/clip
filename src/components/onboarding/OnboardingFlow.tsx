'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ArrowLeft, ArrowRight, Check, ExternalLink, Link2, Loader2, Scissors, Send, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import type { SocialAccount, SocialPlatform } from '@/types/database'
import { PlatformIcon } from '@/components/social/PlatformIcon'
import { PublishingNotice } from '@/components/publishing/PublishingNotice'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useOAuthCallbackToast } from '@/hooks/use-oauth-callback'
import { useSocialAccounts, type PlatformCapability } from '@/lib/publishing-client'
import { PLATFORM_LABEL } from '@/lib/social-labels'
import { cn } from '@/lib/utils'

const PLATFORMS: SocialPlatform[] = ['youtube', 'tiktok', 'instagram']

/** Ein Satz je Plattform: was nach dem Verbinden passiert — und was sie verlangt. */
const PLATFORM_PITCH: Record<SocialPlatform, string> = {
  youtube: 'Shorts landen direkt auf deinem Kanal.',
  tiktok: 'Clips landen in deiner TikTok-Inbox, du postest mit einem Tipp.',
  instagram: 'Reels über ein Professional-Konto mit verknüpfter Facebook-Seite.',
}

type Step = 'connect' | 'ready'
const STEPS: Step[] = ['connect', 'ready']

const HEADING_ID: Record<Step, string> = {
  connect: 'onboarding-connect-title',
  ready: 'onboarding-ready-title',
}

const TITLE_CLASS =
  'rise-in-blur mt-3 bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text pb-1 font-display text-4xl font-semibold tracking-[-0.035em] text-balance text-transparent outline-none sm:text-5xl sm:leading-[1.05]'

export function OnboardingFlow({ firstName }: { firstName: string | null }) {
  const [step, setStep] = useState<Step>('connect')
  const [finishing, setFinishing] = useState(false)
  const { data, error, loading, refresh } = useSocialAccounts()
  const accounts = data?.accounts.filter((account) => account.status !== 'revoked') ?? []
  const shownStep = useRef(step)

  useOAuthCallbackToast('Neue Clips für diesen Kanal warten in deiner Freigabe-Queue.')

  // Beim Schrittwechsel liest der Screenreader die neue Überschrift vor,
  // statt auf dem verschwundenen Knopf stehen zu bleiben.
  useEffect(() => {
    if (shownStep.current === step) return
    shownStep.current = step
    window.scrollTo({ top: 0 })
    document.getElementById(HEADING_ID[step])?.focus({ preventScroll: true })
  }, [step])

  async function finish() {
    if (finishing) return
    setFinishing(true)
    try {
      const response = await fetch('/api/onboarding', { method: 'POST' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Bitte versuche es erneut.')
      }
      // Volle Navigation statt Router: Der Proxy soll den Abschluss sehen,
      // bevor das Dashboard lädt — und „Zurück“ führt nicht hierher.
      window.location.replace('/dashboard')
    } catch (cause) {
      setFinishing(false)
      toast.error('Einrichtung nicht gespeichert', {
        description: cause instanceof Error ? cause.message : undefined,
      })
    }
  }

  return (
    <main className="ambient flex min-h-dvh flex-col text-foreground">
      <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <BrandMark />
        {step === 'connect' ? (
          <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={finishing} onClick={() => void finish()}>
            {finishing ? <Loader2 className="animate-spin" /> : null}
            Überspringen
          </Button>
        ) : null}
      </header>

      <div className="flex flex-1 justify-center px-5 pt-4 pb-20 sm:pt-12">
        <div className="w-full max-w-xl">
          <StepRail current={step} />

          <div key={step} className="mt-10 sm:mt-12">
            {step === 'connect' ? (
              <ConnectStep
                firstName={firstName}
                accounts={accounts}
                capabilities={data?.capabilities}
                configured={data?.configured}
                detail={data?.error}
                error={error}
                loading={loading}
                onRetry={refresh}
                onNext={() => setStep('ready')}
              />
            ) : (
              <ReadyStep
                accounts={accounts}
                finishing={finishing}
                onBack={() => setStep('connect')}
                onFinish={() => void finish()}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <span className="relative size-8 shrink-0 overflow-hidden">
        <Image src="/Logo.png" alt="" width={32} height={32} className="size-8 scale-[1.45] object-contain" priority />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight">Clyp</span>
    </div>
  )
}

function StepRail({ current }: { current: Step }) {
  const index = STEPS.indexOf(current)
  return (
    <div className="flex items-center gap-4">
      <p className="font-mono text-[11px] tracking-wider text-muted-foreground tabular-nums">
        <span className="sr-only">Schritt </span>
        {String(index + 1).padStart(2, '0')}
        <span aria-hidden> / </span>
        <span className="sr-only"> von </span>
        {String(STEPS.length).padStart(2, '0')}
      </p>
      <div aria-hidden className="flex flex-1 gap-1.5">
        {STEPS.map((step, position) => (
          <span
            key={step}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-500',
              position <= index ? 'bg-foreground' : 'bg-foreground/10',
            )}
          />
        ))}
      </div>
    </div>
  )
}

function ConnectStep({
  firstName,
  accounts,
  capabilities,
  configured,
  detail,
  error,
  loading,
  onRetry,
  onNext,
}: {
  firstName: string | null
  accounts: SocialAccount[]
  capabilities?: Record<SocialPlatform, PlatformCapability>
  configured?: boolean
  detail?: string
  error: Error | null
  loading: boolean
  onRetry: () => void
  onNext: () => void
}) {
  const [connecting, setConnecting] = useState<SocialPlatform | null>(null)
  const publishingReady = !error && configured !== false
  const connectedCount = accounts.filter((account) => account.status === 'active').length

  // Zurück vom Anbieter über den Browser-Verlauf: Die Seite kommt dann aus dem
  // bfcache, und der Knopf dreht sonst ewig weiter.
  useEffect(() => {
    function reset(event: PageTransitionEvent) {
      if (event.persisted) setConnecting(null)
    }
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])

  return (
    <section aria-labelledby={HEADING_ID.connect}>
      <p className="rise-in text-sm font-medium text-muted-foreground">
        {firstName ? `Willkommen, ${firstName}.` : 'Willkommen bei Clyp.'}
      </p>
      <h1 id={HEADING_ID.connect} tabIndex={-1} className={TITLE_CLASS}>
        Wo sollen deine Clips landen?
      </h1>
      <p className="rise-in mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground" style={{ animationDelay: '80ms' }}>
        Verbinde deine Kanäle, und Clyp lädt fertige Clips direkt dort hoch. Das geht auch später jederzeit.
      </p>

      {!loading && (error || configured === false) ? (
        <div className="mt-8 [&>[role=alert]]:mb-0">
          <PublishingNotice error={error} configured={configured} detail={detail} onRetry={onRetry} />
        </div>
      ) : null}

      <ul
        aria-label="Plattformen"
        aria-busy={loading}
        className="rise-in glass-tile mt-8 divide-y divide-foreground/[0.07] rounded-2xl"
        style={{ animationDelay: '140ms' }}
      >
        {PLATFORMS.map((platform) => (
          <PlatformRow
            key={platform}
            platform={platform}
            account={accounts.find((account) => account.platform === platform)}
            available={publishingReady && Boolean(capabilities?.[platform].configured)}
            loading={loading}
            connecting={connecting}
            onConnect={() => setConnecting(platform)}
          />
        ))}
      </ul>

      <p className="rise-in mt-5 flex gap-2.5 text-xs leading-relaxed text-muted-foreground" style={{ animationDelay: '200ms' }}>
        <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden />
        <span>
          Nichts geht ohne dich online. Neue Kanäle starten in der Freigabe-Queue: Du siehst jeden Clip, bevor er
          veröffentlicht wird.
        </span>
      </p>

      <div className="mt-10 flex flex-wrap items-center justify-end gap-x-4 gap-y-3">
        {!loading && connectedCount === 0 ? (
          <p className="mr-auto text-xs text-muted-foreground">Ohne Kanal kannst du Clips trotzdem erstellen und exportieren.</p>
        ) : null}
        <Button
          size="lg"
          variant={connectedCount ? 'prominent' : 'outline'}
          className="h-11 rounded-xl px-5"
          disabled={connecting !== null}
          onClick={onNext}
        >
          Weiter
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </section>
  )
}

function PlatformRow({
  platform,
  account,
  available,
  loading,
  connecting,
  onConnect,
}: {
  platform: SocialPlatform
  account?: SocialAccount
  available: boolean
  loading: boolean
  connecting: SocialPlatform | null
  onConnect: () => void
}) {
  const active = account?.status === 'active'
  const href = `/api/oauth/${platform}?return=onboarding`

  return (
    <li className="flex items-center gap-4 px-4 py-4 sm:px-5">
      <span className="glass-lens flex size-11 shrink-0 items-center justify-center rounded-xl text-xs font-semibold tracking-wide">
        <PlatformIcon platform={platform} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{PLATFORM_LABEL[platform]}</p>
        {account ? (
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Avatar className="size-4">
              {account.avatar_url ? <AvatarImage src={account.avatar_url} alt="" /> : null}
              <AvatarFallback className="text-[8px]">{(account.platform_username ?? '?').slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="truncate">{account.platform_username ?? 'Konto verbunden'}</span>
          </p>
        ) : (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {loading || available ? PLATFORM_PITCH[platform] : 'Noch nicht verfügbar.'}
          </p>
        )}
      </div>

      {loading ? (
        <span aria-hidden className="h-9 w-24 shrink-0 animate-pulse rounded-xl bg-foreground/[0.06]" />
      ) : active ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <Check className="size-3.5" aria-hidden />
          Verbunden
        </span>
      ) : available ? (
        <Button
          variant="outline"
          className="h-9 shrink-0 rounded-xl px-3.5"
          nativeButton={false}
          disabled={connecting !== null}
          onClick={onConnect}
          render={<a href={href} />}
        >
          {connecting === platform ? <Loader2 className="animate-spin" /> : <ExternalLink className="size-3.5" />}
          {account ? 'Neu verbinden' : 'Verbinden'}
        </Button>
      ) : null}
    </li>
  )
}

function ReadyStep({
  accounts,
  finishing,
  onBack,
  onFinish,
}: {
  accounts: SocialAccount[]
  finishing: boolean
  onBack: () => void
  onFinish: () => void
}) {
  const channels = accounts.filter((account) => account.status === 'active').map((account) => PLATFORM_LABEL[account.platform])
  const flow = [
    { icon: Link2, title: 'Link einfügen', body: 'Ein Videolink oder eine eigene Datei — mehr braucht Clyp nicht.' },
    { icon: Scissors, title: 'Clips prüfen', body: 'Clyp schneidet die stärksten Momente ins Hochformat, mit Untertiteln. Anpassen kannst du alles im Editor.' },
    channels.length
      ? { icon: Send, title: 'Freigeben', body: 'Du gibst frei, Clyp lädt hoch und plant die Clips mit 8 Stunden Abstand.' }
      : { icon: Send, title: 'Exportieren', body: 'Lade fertige Clips herunter — oder verbinde später einen Kanal unter „Kanäle“.' },
  ]

  return (
    <section aria-labelledby={HEADING_ID.ready}>
      <p className="rise-in text-sm font-medium text-muted-foreground">
        {channels.length ? `${new Intl.ListFormat('de', { type: 'conjunction' }).format(channels)} ${channels.length === 1 ? 'ist' : 'sind'} verbunden.` : 'Alles bereit.'}
      </p>
      <h1 id={HEADING_ID.ready} tabIndex={-1} className={TITLE_CLASS}>
        Dein erster Clip ist einen Link entfernt.
      </h1>

      <ol className="rise-in glass-tile mt-10 rounded-2xl p-1.5" style={{ animationDelay: '100ms' }}>
        {flow.map((item, index) => (
          <li key={item.title} className="flex items-start gap-4 rounded-xl px-3.5 py-4">
            <span className="glass-lens flex size-9 shrink-0 items-center justify-center rounded-lg">
              <item.icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="flex items-baseline gap-2 text-sm font-medium">
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums" aria-hidden>
                  {String(index + 1).padStart(2, '0')}
                </span>
                {item.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex items-center justify-between gap-3">
        <Button variant="ghost" className="h-11 rounded-xl px-3.5 text-muted-foreground" disabled={finishing} onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          Zurück
        </Button>
        <Button variant="prominent" size="lg" className="h-11 rounded-xl px-5" disabled={finishing} onClick={onFinish}>
          {finishing ? <Loader2 className="animate-spin" /> : null}
          Ersten Clip erstellen
          {!finishing ? <ArrowRight data-icon="inline-end" /> : null}
        </Button>
      </div>
    </section>
  )
}
