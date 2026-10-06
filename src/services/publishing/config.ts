import 'server-only'

import type { SocialPlatform } from '@/types/database'
import type { PublishingCapabilities } from '@/types/publishing'

export const SOCIAL_PLATFORMS: SocialPlatform[] = ['youtube', 'instagram', 'tiktok']

export function isSocialPlatform(value: string): value is SocialPlatform {
  return SOCIAL_PLATFORMS.includes(value as SocialPlatform)
}

/** A required 32-byte key; accepting hex and base64 avoids weak passphrases. */
export function tokenEncryptionKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY ?? ''
  const key = /^[a-f\d]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY muss ein zufälliger 32-Byte-Schlüssel in Hex oder Base64 sein.')
  return key
}

export interface PublishingSetupIssue {
  service: string
  variables: string[]
}

/** Names only: safe for setup diagnostics, never includes credential values. */
export function getPublishingSetupIssues(): PublishingSetupIssue[] {
  const issues: PublishingSetupIssue[] = []
  const requirements = [
    { service: 'Supabase', variables: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] },
    { service: 'Trigger.dev', variables: ['TRIGGER_SECRET_KEY'] },
    { service: 'Cloudflare R2', variables: ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] },
  ]
  for (const requirement of requirements) {
    const variables = requirement.variables.filter((name) => !process.env[name]?.trim())
    if (variables.length) issues.push({ service: requirement.service, variables })
  }
  try { tokenEncryptionKey() } catch {
    issues.push({ service: 'Verschlüsselung der Kanalzugänge', variables: ['TOKEN_ENCRYPTION_KEY'] })
  }
  if (!validAppOrigin()) issues.push({ service: 'App-Adresse', variables: ['NEXT_PUBLIC_APP_URL'] })
  return issues
}

export function getPublishingSetupNotice(): string | null {
  const issues = getPublishingSetupIssues()
  if (!issues.length) return null
  return `Für das Publishing fehlt noch die Einrichtung von: ${issues.map((issue) => issue.service).join(', ')}. Nach der Einrichtung erneut prüfen.`
}

export function isPublishingConfigured(): boolean {
  return getPublishingSetupIssues().length === 0
}

export function assertPublishingConfigured(): void {
  const notice = getPublishingSetupNotice()
  if (notice) throw new Error(notice)
}

function validAppOrigin(): string | null {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? '')
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null
    if (url.username || url.password) return null
    return url.origin
  } catch { return null }
}

export function publishingAppOrigin(): string {
  const origin = validAppOrigin()
  if (!origin) throw new Error('NEXT_PUBLIC_APP_URL muss eine HTTPS-URL oder eine lokale Entwicklungs-URL sein.')
  return origin
}

export function getPublishingCapabilities(): PublishingCapabilities {
  const setup = getPublishingSetupNotice()
  const ready = setup === null
  const youtube = ready && Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim())
  const instagram = ready && Boolean(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim())
  const tiktok = ready && Boolean(process.env.TIKTOK_CLIENT_KEY?.trim() && process.env.TIKTOK_CLIENT_SECRET?.trim())
  return {
    youtube: {
      configured: youtube,
      canAutoPublish: youtube && process.env.YOUTUBE_AUDIT_PASSED === 'true',
      notice: !youtube ? setup ?? 'Die YouTube-Verbindung ist noch nicht eingerichtet. Die OAuth-Zugangsdaten fehlen.' : process.env.YOUTUBE_AUDIT_PASSED !== 'true'
        ? 'Bis zum YouTube-API-Audit werden Uploads privat gespeichert und müssen bei YouTube freigegeben werden.' : null,
    },
    instagram: {
      configured: instagram,
      canAutoPublish: instagram && process.env.META_APP_REVIEW_PASSED === 'true' && Boolean(process.env.R2_PUBLIC_BASE_URL),
      notice: !instagram ? setup ?? 'Die Instagram-Verbindung ist noch nicht eingerichtet. Die Meta-App-Zugangsdaten fehlen.' : process.env.META_APP_REVIEW_PASSED !== 'true'
        ? 'Öffentliches Publishing benötigt Meta App Review und ein Instagram-Professional-Konto mit verknüpfter Facebook-Seite.'
        : !process.env.R2_PUBLIC_BASE_URL ? 'Für Reels fehlt die öffentliche Video-Domain (R2_PUBLIC_BASE_URL).'
        : 'Instagram-Professional-Konto und verknüpfte Facebook-Seite erforderlich. Abgelaufene Verbindungen müssen erneut autorisiert werden.',
    },
    tiktok: {
      configured: tiktok,
      canAutoPublish: false,
      publicDirectPost: tiktok && process.env.TIKTOK_AUDIT_PASSED === 'true',
      notice: !tiktok ? setup ?? 'Die TikTok-Verbindung ist noch nicht eingerichtet. Die TikTok-App-Zugangsdaten fehlen.' : process.env.TIKTOK_AUDIT_PASSED === 'true'
        ? 'Veröffentliche direkt aus der Clip-Vorschau. Wähle die Sichtbarkeit und bestätige jeden Beitrag.'
        : 'Direktes Veröffentlichen benötigt video.publish. Bis zum TikTok-App-Audit sind nur private Testposts möglich; öffentliche Direct Posts sind noch gesperrt.',
    },
  }
}
