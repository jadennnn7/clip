import 'server-only'

import { PublishError, composeCaption, type SocialProvider } from './base'

/**
 * Instagram Graph API — Reels.
 *
 * Voraussetzungen, die der Nutzer erfüllen muss (und die das Onboarding
 * abfragen muss, bevor der OAuth-Flow startet):
 *   - Instagram Professional Account (Business oder Creator), kein Privatkonto
 *   - Verknüpfte Facebook-Page
 *   - Bestandenes App Review für `instagram_content_publish` (2–4 Wochen)
 *
 * Limit: 100 Posts pro rollendem 24-Stunden-Fenster und Konto. "Rollend" heißt:
 * Kapazität wird 24 Stunden nach jedem einzelnen Post frei, nicht um
 * Mitternacht.
 *
 * ARCHITEKTONISCH RELEVANT: Meta lädt das Video SELBST von einer öffentlich
 * erreichbaren URL herunter. Deshalb braucht der R2-Bucket eine öffentliche
 * Custom-Domain (R2_PUBLIC_BASE_URL) — mit einer presigned URL voller
 * AWS-Signaturparameter funktioniert der Abruf nicht zuverlässig.
 */

const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? 'v21.0'
const API_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

const SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
]

const MAX_CAPTION_LENGTH = 2200

/** Reels-Container brauchen bis zu einer Minute, bis sie verarbeitet sind. */
export const CONTAINER_POLL_INTERVAL_MS = 5000
export const CONTAINER_POLL_TIMEOUT_MS = 5 * 60 * 1000

export const instagramProvider: SocialProvider = {
  platform: 'instagram',

  getAuthUrl({ state, redirectUri }) {
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(','),
      state,
    })
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`
  },

  async exchangeCode() {
    // Phase 2: Code → Short-Lived Token → Long-Lived Token (60 Tage).
    // Danach GET /me/accounts, um Page und verknüpften IG-Account zu finden.
    throw new Error('instagram.exchangeCode: noch nicht implementiert (Phase 2)')
  },

  async refreshToken() {
    // Meta hat keinen klassischen Refresh-Flow: Ein Long-Lived Token wird gegen
    // sich selbst getauscht (grant_type=fb_exchange_token) und ist danach
    // wieder 60 Tage gültig. Das MUSS geschehen, bevor es abläuft — ein
    // abgelaufenes Token lässt sich nicht mehr erneuern, dann muss der Nutzer
    // den Kanal komplett neu verbinden. Der Cron erneuert ab 7 Tagen Restlaufzeit.
    throw new Error('instagram.refreshToken: noch nicht implementiert (Phase 2)')
  },

  async getAccountInfo() {
    // Phase 2: GET /me/accounts → page.instagram_business_account
    throw new Error('instagram.getAccountInfo: noch nicht implementiert (Phase 2)')
  },

  async getPublishingLimit() {
    // Phase 2: GET /{ig-user-id}/content_publishing_limit
    // Liefert den echten Verbrauch im rollenden Fenster. Vor jedem Post
    // abfragen — der Wert lässt sich nicht zuverlässig lokal mitzählen, weil
    // der Nutzer auch über die App selbst postet.
    throw new Error('instagram.getPublishingLimit: noch nicht implementiert (Phase 2)')
  },

  async publish({ account, videoUrl, title, description, hashtags }) {
    if (!account.metaIgUserId) {
      throw new PublishError(
        'Diesem Konto ist kein Instagram-Professional-Account zugeordnet.',
        'terminal',
      )
    }

    const caption = composeCaption(
      `${title}\n\n${description}`,
      hashtags,
      MAX_CAPTION_LENGTH,
    )

    const createContainerUrl = `${API_BASE}/${account.metaIgUserId}/media`
    const publishUrl = `${API_BASE}/${account.metaIgUserId}/media_publish`

    void caption
    void createContainerUrl
    void publishUrl
    void videoUrl

    // Phase 2 — drei Schritte, keiner davon überspringbar:
    //   1. POST {ig-user-id}/media mit media_type=REELS, video_url, caption
    //      → creation_id
    //   2. GET {creation_id}?fields=status_code pollen, bis FINISHED
    //      (ERROR und EXPIRED sind terminale Zustände)
    //   3. POST {ig-user-id}/media_publish mit creation_id
    //
    // Schritt 2 ist der Grund, warum diese Aufgabe nicht in eine
    // Serverless-Function mit 300s-Timeout passt: die Verarbeitung dauert bei
    // längeren Reels regelmäßig über eine Minute.
    throw new PublishError('instagram.publish: noch nicht implementiert (Phase 2)', 'terminal')
  },
}
