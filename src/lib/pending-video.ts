import { classifyLink } from '@/lib/links'
import type { BillingInterval } from '@/lib/stripe/plans'

const KEY = 'ocuris:pending-video:v1'
const LIFETIME_MS = 24 * 60 * 60 * 1000

export type VideoPlanChoice = 'free' | 'pro' | 'agency'
export interface PendingVideo {
  url: string
  tier: VideoPlanChoice
  interval: BillingInterval
  expiresAt: number
}

/** Browser-only draft; never imports a video or starts a payment. */
export function savePendingVideo(url: string, tier: VideoPlanChoice, interval: BillingInterval): boolean {
  const link = url.length <= 4096 ? classifyLink(url) : null
  if (!link) return false
  try {
    localStorage.setItem(KEY, JSON.stringify({ url: link.url, tier, interval, expiresAt: Date.now() + LIFETIME_MS }))
    return true
  } catch { return false }
}

export function readPendingVideo(): PendingVideo | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<PendingVideo> | null
    if (!value || typeof value.url !== 'string' || value.url.length > 4096 || !classifyLink(value.url)
      || !['free', 'pro', 'agency'].includes(value.tier ?? '')
      || !['month', 'year'].includes(value.interval ?? '')
      || typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)
      || value.expiresAt <= Date.now() || value.expiresAt > Date.now() + LIFETIME_MS) {
      clearPendingVideo()
      return null
    }
    return value as PendingVideo
  } catch {
    clearPendingVideo()
    return null
  }
}

export function clearPendingVideo(): void {
  try { localStorage.removeItem(KEY) } catch { /* Storage may be disabled. */ }
}
