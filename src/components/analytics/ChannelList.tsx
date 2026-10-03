import Link from 'next/link'
import { PlatformLogo } from '@/components/landing/PlatformLogo'
import { PLATFORM_LABEL } from '@/lib/social-labels'
import { cn } from '@/lib/utils'
import type { ChannelAnalytics } from '@/types/analytics'
import type { SocialPlatform } from '@/types/database'
import { formatCount } from './metrics'

const FOLLOWERS: Record<SocialPlatform, string> = { youtube: 'Abonnenten', instagram: 'Follower', tiktok: 'Follower' }
const MEDIA: Record<SocialPlatform, [string, string]> = { youtube: ['Video', 'Videos'], instagram: ['Beitrag', 'Beiträge'], tiktok: ['Video', 'Videos'] }

/** Verbundene Konten als Liste: Name links, Reichweite rechtsbündig. */
export function ChannelList({ channels }: { channels: ChannelAnalytics[] }) {
  if (!channels.length) {
    return (
      <div className="flex flex-1 flex-col items-start justify-center gap-3 px-4 py-6 sm:px-5">
        <p className="text-sm text-muted-foreground">Kein Kanal verbunden.</p>
        <Link href="/dashboard/connections" className="text-xs font-medium underline-offset-4 hover:underline">Kanal verbinden</Link>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-foreground/[0.06]">
      {channels.map((channel) => {
        const media = channel.mediaCount === null ? null : `${formatCount(channel.mediaCount)} ${MEDIA[channel.platform][channel.mediaCount === 1 ? 0 : 1]}`
        return (
          <li key={channel.accountId} className="flex items-center gap-3 px-4 py-3 sm:px-5" title={channel.notice ?? undefined}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05] text-muted-foreground">
              <PlatformLogo platform={channel.platform} className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{channel.username ?? PLATFORM_LABEL[channel.platform]}</p>
              <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                {channel.status === 'active' ? (
                  <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-label="Verbunden" />
                ) : null}
                <span className="truncate">{PLATFORM_LABEL[channel.platform].split(' ')[0]}{media ? ` · ${media}` : ''}</span>
              </p>
              {channel.status !== 'active' ? (
                <Link href="/dashboard/connections" className="mt-0.5 inline-block text-xs font-medium text-amber-700 underline-offset-4 hover:underline dark:text-amber-400">
                  Verbindung erneuern
                </Link>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <p className={cn('text-sm font-semibold tabular-nums', channel.followers === null && 'text-muted-foreground')}>{formatCount(channel.followers)}</p>
              <p className="text-[11px] text-muted-foreground">{FOLLOWERS[channel.platform]}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
