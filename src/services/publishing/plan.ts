import type { SocialAccount } from '@/types/database'
import type { PipelinePublishingPlan } from '@/types/pipeline'
import type { PublishingCapabilities } from '@/types/publishing'

/** Shared import snapshot: do not imply a public post when setup or consent is missing. */
export function buildPublishingPlan(
  accounts: SocialAccount[],
  capabilities: PublishingCapabilities,
  setupNotice: string | null = null,
): PipelinePublishingPlan {
  const targets: PipelinePublishingPlan['targets'] = accounts.flatMap((account) => {
    const capability = capabilities[account.platform]
    if (account.status !== 'active' || account.automation_mode === 'manual' || !capability.configured) return []
    return [{
      accountId: account.id,
      platform: account.platform,
      username: account.platform_username,
      mode: account.automation_mode === 'auto_publish' && capability.canAutoPublish ? 'auto_publish' as const : 'review_queue' as const,
      minScore: account.auto_publish_min_score,
      notice: capability.notice,
    }]
  })
  if (setupNotice || !targets.length) {
    const reconnect = accounts.some((account) => account.status !== 'active' && account.status !== 'revoked')
    const blocked = accounts.find((account) => account.status === 'active' && account.automation_mode !== 'manual' && !capabilities[account.platform].configured)
    return {
      status: 'not_configured', targets: [],
      message: setupNotice
        ? `Clips werden erstellt, aber nicht veröffentlicht. ${setupNotice}`
        : reconnect ? 'Clips werden erstellt, aber nicht veröffentlicht. Verbinde deinen Kanal unter „Kanäle“ erneut.'
        : blocked ? `Clips werden erstellt, aber nicht veröffentlicht. ${capabilities[blocked.platform].notice ?? 'Die Veröffentlichung für diesen Kanal ist noch nicht eingerichtet.'}`
        : accounts.length ? 'Clips werden erstellt, aber nicht veröffentlicht. Wähle unter „Kanäle“ die automatische Veröffentlichung oder die Freigabe vor jedem Post.'
        : 'Clips werden erstellt, aber nicht veröffentlicht. Verbinde unter „Kanäle“ einen Kanal und wähle deinen Veröffentlichungsmodus.',
    }
  }
  const automatic = targets.filter((target) => target.mode === 'auto_publish')
  const reviewCount = targets.length - automatic.length
  return {
    status: automatic.length ? 'automatic' : 'review_required',
    targets,
    message: automatic.length
      ? `Geeignete KI-Clips werden auf ${automatic.length} ${automatic.length === 1 ? 'Kanal' : 'Kanälen'} automatisch veröffentlicht: erster Clip nach Fertigstellung, weitere im Abstand von 8 Stunden. Clips unter der gewählten Mindestpunktzahl brauchen deine Freigabe.${reviewCount ? ` Auf ${reviewCount} weiteren ${reviewCount === 1 ? 'Kanal' : 'Kanälen'} ist jeder Clip vorab freizugeben.` : ''}`
      : 'Jeder Clip wartet auf deine Freigabe. Erst wenn du bei einem Clip auf „Veröffentlichen“ klickst, wird er hochgeladen.',
  }
}
