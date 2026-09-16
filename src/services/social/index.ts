import type { SocialPlatform } from '@/types/database'
import type { SocialProvider } from './base'
import { youtubeProvider } from './youtube'
import { tiktokProvider } from './tiktok'
import { instagramProvider } from './instagram'

const PROVIDERS: Record<SocialPlatform, SocialProvider> = {
  youtube: youtubeProvider,
  tiktok: tiktokProvider,
  instagram: instagramProvider,
}

export function getProvider(platform: SocialPlatform): SocialProvider {
  return PROVIDERS[platform]
}

export * from './base'
