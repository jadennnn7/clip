import { ArrowUpRight, Check, Clock, Info } from 'lucide-react'
import type { SocialPlatform } from '@/types/database'
import type { PlatformCapability } from '@/lib/publishing-client'
import { PlatformLogo } from '@/components/landing/PlatformLogo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NAME: Record<SocialPlatform, { name: string; format: string }> = {
  youtube: { name: 'YouTube', format: 'Shorts' },
  instagram: { name: 'Instagram', format: 'Reels' },
  tiktok: { name: 'TikTok', format: 'Videos' },
}

type Fact = { kind: 'yes' | 'later' | 'needs'; text: string }

/**
 * Was die Verbindung heute leistet, in Stichpunkten.
 *
 * Vorher stand hier der Hinweistext des Servers als Absatz. Die Fakten
 * dahinter sind wenige und stabil — ob öffentlich veröffentlicht werden
 * darf, entscheidet weiter `canAutoPublish`.
 */
function facts(platform: SocialPlatform, capability: PlatformCapability): Fact[] {
  const auto: Fact = { kind: 'yes', text: 'Vollautomatisch öffentlich' }
  if (platform === 'youtube') return [
    { kind: 'yes', text: 'Upload direkt auf deinen Kanal' },
    capability.canAutoPublish ? auto : { kind: 'later', text: 'Vorerst privat, bis YouTube Ocuris freigibt' },
  ]
  if (platform === 'instagram') return [
    { kind: 'yes', text: 'Upload als Reel' },
    capability.canAutoPublish ? auto : { kind: 'later', text: 'Öffentlich erst nach Freigabe durch Meta' },
    { kind: 'needs', text: 'Professional-Konto mit Facebook-Seite' },
  ]
  return [
    { kind: 'yes', text: 'Upload in deine TikTok-Inbox' },
    { kind: 'later', text: 'Veröffentlichen in der TikTok-App' },
  ]
}

const FACT_ICON = { yes: Check, later: Clock, needs: Info }

export function PlatformConnectCard({ platform, capability, enabled, primary }: {
  platform: SocialPlatform
  capability: PlatformCapability
  /** Verbinden möglich: Plattform eingerichtet und Publishing erreichbar. */
  enabled: boolean
  /** Solange kein Kanal verbunden ist, ist Verbinden die Hauptaktion der Seite. */
  primary: boolean
}) {
  const { name, format } = NAME[platform]

  return (
    <article className="glass-tile flex flex-col rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="glass-lens flex size-11 items-center justify-center rounded-2xl">
          <PlatformLogo platform={platform} className="size-5" />
        </span>
        {!capability.configured ? (
          <span className="rounded-full px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground ring-1 ring-foreground/10">
            Nicht eingerichtet
          </span>
        ) : null}
      </div>

      <h3 className="mt-4 text-base font-semibold tracking-tight">
        {name} <span className="font-normal text-muted-foreground">{format}</span>
      </h3>

      <ul className="mt-3 flex-1 space-y-2">
        {facts(platform, capability).map((fact) => {
          const Icon = FACT_ICON[fact.kind]
          return (
            <li key={fact.text} className="flex items-start gap-2 text-xs leading-relaxed">
              <Icon className={cn('mt-0.5 size-3.5 shrink-0', fact.kind === 'yes' ? 'text-foreground' : 'text-muted-foreground')} />
              <span className={fact.kind === 'yes' ? undefined : 'text-muted-foreground'}>{fact.text}</span>
            </li>
          )
        })}
      </ul>

      {!capability.configured && capability.notice ? (
        <p className="mt-3 text-[0.6875rem] leading-relaxed text-muted-foreground">{capability.notice}</p>
      ) : null}

      <div className="mt-5">
        {enabled ? (
          <Button
            variant={primary ? 'default' : 'outline'}
            className="w-full rounded-full"
            nativeButton={false}
            render={<a href={`/api/oauth/${platform}`} />}
          >
            Mit {name} verbinden
            <ArrowUpRight className="size-3.5" />
          </Button>
        ) : (
          <Button variant="outline" className="w-full rounded-full" disabled>
            Noch nicht verfügbar
          </Button>
        )}
      </div>
    </article>
  )
}
