import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getPlan } from '@/lib/stripe/plans'
import type { SocialAccount, SubscriptionTier } from '@/types/database'
import { PublishingApiError } from './auth'

/**
 * Kanal-Limit des Tarifs (`Plan.socialAccounts`).
 *
 * Geprüft wird an drei Stellen: beim Verbinden (keine neuen Kanäle über dem
 * Limit), beim Einplanen aus der Pipeline und beim Veröffentlichen von Hand.
 * Die letzten beiden fangen einen Downgrade ab — wer kurz Business bucht,
 * 30 Kanäle verbindet und zurückwechselt, beliefert danach nur noch so viele,
 * wie der neue Tarif umfasst.
 */

export async function channelLimit(userId: string): Promise<number> {
  const { data, error } = await createAdminClient().from('profiles')
    .select('subscription_tier').eq('id', userId).maybeSingle()
  if (error) throw new PublishingApiError(503, 'Dein Tarif konnte gerade nicht geprüft werden. Bitte versuche es erneut.')
  return getPlan((data?.subscription_tier ?? 'free') as SubscriptionTier).socialAccounts
}

/** Die Kanäle, die der Tarif beliefert: die zuerst verbundenen. */
export function accountsWithinLimit<T extends Pick<SocialAccount, 'id' | 'created_at'>>(accounts: T[], limit: number): T[] {
  return [...accounts]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit))
}

export function channelLimitMessage(limit: number): string {
  return `Dein Tarif umfasst ${limit} ${limit === 1 ? 'Kanal' : 'Kanäle'}. Trenne einen Kanal oder wechsle in einen größeren Tarif.`
}
