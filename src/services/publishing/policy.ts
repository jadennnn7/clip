import type { Clip, SocialAccount } from '@/types/database'
import type { PublishingStatus } from '@/types/publishing'

/** Manual accounts are excluded; unreviewed AI fallbacks never go public unattended. */
export function initialPublishingStatus(clip: Clip, account: SocialAccount, canAutoPublish: boolean): 'pending' | 'needs_review' | null {
  if (account.status !== 'active' || account.automation_mode === 'manual') return null
  return account.automation_mode === 'auto_publish' && canAutoPublish &&
    clip.analysis_source === 'ai' && clip.virality_score >= account.auto_publish_min_score
    ? 'pending' : 'needs_review'
}

/** Explain why a generated clip is waiting instead of silently stopping automation. */
export function publishingReviewReason(clip: Clip, account: SocialAccount, canAutoPublish: boolean, providerNotice?: string | null): string | null {
  if (account.automation_mode !== 'auto_publish') return 'Für diesen Kanal ist die Freigabe vor jedem Post aktiviert. Prüfe den Clip und gib ihn frei.'
  if (!canAutoPublish) return providerNotice ?? 'Die automatische Veröffentlichung ist für diesen Kanal zurzeit nicht verfügbar. Prüfe den Clip und die Kanaleinstellungen.'
  if (clip.analysis_source !== 'ai') return 'Dieser Clip wurde ohne KI-Analyse ausgewählt und braucht deine Freigabe, bevor er veröffentlicht wird.'
  if (clip.virality_score < account.auto_publish_min_score) return `Dieser Clip hat ${clip.virality_score} Punkte. Die Automatik veröffentlicht ab ${account.auto_publish_min_score} Punkten; du kannst ihn hier manuell freigeben.`
  return null
}

/** Freigeben geht ohne fertiges Video: Gerendert wird erst nach dem Klick. */
export function canTransitionJob(status: PublishingStatus, action: 'approve' | 'retry' | 'cancel'): boolean {
  if (action === 'approve') return status === 'needs_review'
  if (action === 'retry') return status === 'failed'
  return ['needs_review', 'pending', 'failed'].includes(status)
}

/** All timestamps are absolute UTC instants, independent of the worker's timezone. */
export function publishTime(index: number, startAt: Date): string {
  return new Date(startAt.getTime() + index * 8 * 60 * 60 * 1000).toISOString()
}
