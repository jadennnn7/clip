import 'server-only'

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { SocialPlatform } from '@/types/database'
import { tokenEncryptionKey } from './config'

const MAX_AGE_MS = 10 * 60 * 1000

function sign(value: string): string {
  return createHmac('sha256', tokenEncryptionKey()).update(`oauth-state:${value}`).digest('base64url')
}

/**
 * Wohin der Callback zurückführt. Nur diese festen Ziele — ein Pfad aus der
 * URL würde den Callback zum offenen Redirect machen.
 */
const OAUTH_RETURN_PATHS = {
  connections: '/dashboard/connections',
  onboarding: '/onboarding',
} as const

export type OAuthReturn = keyof typeof OAUTH_RETURN_PATHS

export function parseOAuthReturn(value: unknown): OAuthReturn {
  return value === 'onboarding' ? 'onboarding' : 'connections'
}

export function oauthReturnPath(value: OAuthReturn): string {
  return OAUTH_RETURN_PATHS[value]
}

export function createOAuthState(userId: string, platform: SocialPlatform, returnTo: OAuthReturn = 'connections'): {
  state: string
  cookie: string
  codeVerifier: string
  codeChallenge: string
} {
  const state = randomBytes(32).toString('base64url')
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  const payload = Buffer.from(JSON.stringify({ userId, platform, state, codeVerifier, returnTo, createdAt: Date.now() })).toString('base64url')
  return { state, cookie: `${payload}.${sign(payload)}`, codeVerifier, codeChallenge }
}

export function extractOAuthState(
  cookie: string | undefined,
  state: string | null,
  userId: string,
  platform: SocialPlatform,
): { valid: boolean; codeVerifier?: string; returnTo: OAuthReturn } {
  if (!cookie || !state || cookie.length > 4096 || state.length > 100) return { valid: false, returnTo: 'connections' }
  try {
    const [payload, signature, extra] = cookie.split('.')
    if (!payload || !signature || extra) return { valid: false, returnTo: 'connections' }
    const expected = Buffer.from(sign(payload))
    const actual = Buffer.from(signature)
    if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) return { valid: false, returnTo: 'connections' }
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    const age = Date.now() - value.createdAt
    const valid = value.userId === userId && value.platform === platform && value.state === state &&
      typeof value.createdAt === 'number' && age >= 0 && age <= MAX_AGE_MS
    // Das Ziel gilt auch bei abgelaufenem State: Die Signatur belegt, dass es
    // von uns stammt, und die Fehlermeldung soll dort ankommen, wo der Nutzer
    // die Verbindung gestartet hat.
    return {
      valid,
      codeVerifier: typeof value.codeVerifier === 'string' ? value.codeVerifier : undefined,
      returnTo: parseOAuthReturn(value.returnTo),
    }
  } catch { return { valid: false, returnTo: 'connections' } }
}

export function verifyOAuthState(cookie: string | undefined, state: string | null, userId: string, platform: SocialPlatform): boolean {
  return extractOAuthState(cookie, state, userId, platform).valid
}

export function oauthCookieName(platform: SocialPlatform): string {
  return `omegaclip_oauth_${platform}`
}
