import 'server-only'

import { PublishError, composeCaption, type SocialProvider } from './base'

/**
 * TikTok Content Posting API.
 *
 * DIE GRÖSSTE EINSCHRÄNKUNG DES GESAMTEN PRODUKTS:
 *
 * Un-auditierte API-Clients können Videos ausschließlich mit der Sichtbarkeit
 * SELF_ONLY veröffentlichen — nur der Creator selbst sieht sie. Zusätzlich
 * dürfen höchstens FÜNF Nutzerkonten die App innerhalb von 24 Stunden
 * autorisieren. Für einen produktiven SaaS-Betrieb ist das unbrauchbar.
 *
 * Der Ausweg bis zum bestandenen Audit ist der Entwurfs-Modus:
 *   - Scope `video.upload` statt `video.publish`
 *   - Das Video landet in der TikTok-Inbox des Nutzers
 *   - Der Nutzer tippt dort einmal auf "Posten"
 *
 * Das ist nicht die versprochene Vollautomatik, aber es ist ehrlich, es
 * funktioniert sofort, und es ist derselbe Weg, den die etablierten Wettbewerber
 * gehen. Im UI wird der Zustand offen als "Draft-Modus — Audit ausstehend"
 * kommuniziert, statt den Nutzer auf Views warten zu lassen, die nie kommen.
 *
 * Nach bestandenem Audit: TIKTOK_AUDIT_PASSED=true → Direct Post.
 */

const API_BASE = 'https://open.tiktokapis.com/v2'

const AUDIT_PASSED = process.env.TIKTOK_AUDIT_PASSED === 'true'

/** `video.publish` erlaubt Direct Post, `video.upload` nur den Entwurf. */
const SCOPES = AUDIT_PASSED
  ? ['user.info.basic', 'video.publish', 'video.upload']
  : ['user.info.basic', 'video.upload']

const MAX_CAPTION_LENGTH = 2200

export const tiktokProvider: SocialProvider = {
  platform: 'tiktok',

  getAuthUrl({ state, redirectUri }) {
    const params = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(','),
      state,
    })
    return `https://www.tiktok.com/v2/auth/authorize/?${params}`
  },

  async exchangeCode() {
    // Phase 2: POST /oauth/token/ — Access Token 24h, Refresh Token 365 Tage.
    throw new Error('tiktok.exchangeCode: noch nicht implementiert (Phase 2)')
  },

  async refreshToken() {
    // Access Tokens laufen nach 24 Stunden ab. Der Refresh-Cron muss hier
    // täglich laufen, sonst ist jeder Kanal jeden Morgen tot.
    throw new Error('tiktok.refreshToken: noch nicht implementiert (Phase 2)')
  },

  async getAccountInfo() {
    // Phase 2: GET /user/info/?fields=open_id,display_name,avatar_url
    throw new Error('tiktok.getAccountInfo: noch nicht implementiert (Phase 2)')
  },

  async getPublishingLimit() {
    // Phase 2: POST /post/publish/creator_info/query/
    // Liefert neben dem Kontingent auch die erlaubten Privacy-Optionen und die
    // maximale Videolänge des Kontos — beides MUSS vor dem Posten geprüft
    // werden, TikTok weist den Upload sonst ab.
    throw new Error('tiktok.getPublishingLimit: noch nicht implementiert (Phase 2)')
  },

  async publish({ title, description, hashtags }) {
    const caption = composeCaption(
      `${title}\n\n${description}`,
      hashtags,
      MAX_CAPTION_LENGTH,
    )

    // Direct Post nur nach bestandenem Audit; sonst Entwurf in die Inbox.
    const endpoint = AUDIT_PASSED
      ? `${API_BASE}/post/publish/video/init/`
      : `${API_BASE}/post/publish/inbox/video/init/`

    void caption
    void endpoint

    // Phase 2:
    //   1. Init-Call mit source_info (PULL_FROM_URL + die öffentliche R2-URL)
    //      → publish_id
    //   2. POST /post/publish/status/fetch/ pollen, bis PUBLISH_COMPLETE
    //
    // Die Domain der Video-URL muss vorher in der TikTok-Developer-Konsole als
    // verifizierte URL-Property hinterlegt sein, sonst lehnt PULL_FROM_URL ab.
    throw new PublishError('tiktok.publish: noch nicht implementiert (Phase 2)', 'terminal')
  },
}

/**
 * Text für das UI. Der Nutzer soll vor dem Verbinden wissen, was ihn erwartet.
 */
export const TIKTOK_MODE_NOTICE = AUDIT_PASSED
  ? null
  : 'TikTok erlaubt vollautomatisches Veröffentlichen erst nach bestandenem Content-Posting-Audit. Bis dahin landen Clips als Entwurf in deiner TikTok-Inbox — du tippst dort einmal auf „Posten".'
