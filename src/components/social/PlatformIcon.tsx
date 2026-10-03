import type { SocialPlatform } from '@/types/database'

export function PlatformIcon({
  platform,
  className,
}: {
  platform: SocialPlatform
  className?: string
}) {
  const labels: Record<SocialPlatform, string> = {
    instagram: 'IG',
    youtube: 'YT',
    tiktok: 'TT',
  }
  return (
    <span className={className} aria-label={platform}>
      {labels[platform]}
    </span>
  )
}
