import 'server-only'

import { PublishError, type SocialProvider } from './base'
import {
  asObject, authorization, createRemoteId, durableCheckpoint, expiresIn, grantedScopes,
  jsonRequest, pause, publicVideoUrl, requiredEnv, requireString, stringField, unknownLimit,
} from './http'

const API_BASE = 'https://open.tiktokapis.com/v2'
const SCOPES = ['user.info.basic', 'video.upload']

// https://developers.tiktok.com/doc/content-sharing-guidelines
// Even audited Direct Post clients require a creator-selected privacy value and
// per-post consent. An audit flag is not consent. This unattended pipeline uses
// Inbox Upload only; creators finish editing and posting in the TikTok app.
export const TIKTOK_MODE_NOTICE = 'Clips werden automatisch in deine TikTok-Inbox übertragen. Öffne dort die Benachrichtigung, ergänze den Beitrag und veröffentliche ihn in TikTok. Automatischer öffentlicher Direct Post ist in diesem Workflow nicht aktiviert.'

async function tokenRequest(fields: Record<string, string>) {
  const body = await jsonRequest(`${API_BASE}/oauth/token/`, {
    method: 'POST', body: new URLSearchParams({ client_key: requiredEnv('TIKTOK_CLIENT_KEY'), client_secret: requiredEnv('TIKTOK_CLIENT_SECRET'), ...fields }),
  }, 'TikTok-Anmeldung')
  return {
    accessToken: requireString(body.access_token, 'TikTok-Zugriffstoken'),
    refreshToken: requireString(body.refresh_token, 'TikTok-Refresh-Token'),
    expiresAt: expiresIn(body.expires_in),
    refreshExpiresAt: expiresIn(body.refresh_expires_in),
    scopes: grantedScopes(body.scope, SCOPES),
  }
}

// Follower- und Videozahlen bräuchten `user.info.stats` und `video.list`.
// Beides fragt diese Verbindung bewusst nicht an: Im Inbox-Workflow
// veröffentlicht der Creator selbst, der Clip hat vorher keine Video-ID.
const TIKTOK_STATS_NOTICE = 'TikTok-Statistiken sind in dieser Verbindung nicht freigegeben. Aufrufe siehst du in der TikTok-App.'

export const tiktokProvider: SocialProvider = {
  platform: 'tiktok',

  getAuthUrl({ state, redirectUri, codeChallenge }) {
    const params = new URLSearchParams({
      client_key: requiredEnv('TIKTOK_CLIENT_KEY'),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(','),
      state,
    })
    if (codeChallenge) {
      params.set('code_challenge', codeChallenge)
      params.set('code_challenge_method', 'S256')
    }
    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`
  },

  exchangeCode({ code, redirectUri, codeVerifier }) {
    const fields: Record<string, string> = { code, redirect_uri: redirectUri, grant_type: 'authorization_code' }
    if (codeVerifier) {
      fields.code_verifier = codeVerifier
    }
    return tokenRequest(fields)
  },

  refreshToken(refreshToken) {
    return tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' })
  },

  async getAccountInfo(accessToken) {
    const body = await jsonRequest(`${API_BASE}/user/info/?fields=open_id,display_name,avatar_url`, { headers: authorization(accessToken) }, 'TikTok-Profil')
    const user = asObject(asObject(body.data).user)
    return { platformAccountId: requireString(user.open_id, 'TikTok-Konto-ID'), username: stringField(user.display_name) ?? null, avatarUrl: stringField(user.avatar_url) ?? null }
  },

  async getPublishingLimit() {
    // creator_info needs video.publish and does not expose remaining Inbox slots.
    // TikTok enforces its pending-share cap in the Upload endpoint itself.
    return unknownLimit()
  },

  async getChannelStats() {
    return { followers: null, totalViews: null, mediaCount: null, notice: TIKTOK_STATS_NOTICE }
  },

  async getPostStats() {
    return new Map()
  },

  async publish(params) {
    const checkpoint = durableCheckpoint(params)
    const headers = { ...authorization(params.account.accessToken), 'Content-Type': 'application/json; charset=UTF-8' }
    const publishId = await createRemoteId(checkpoint, 'tiktok_publish_id', async () => {
      // The video's domain or URL prefix must be verified in the TikTok console.
      const body = await jsonRequest(`${API_BASE}/post/publish/inbox/video/init/`, {
        method: 'POST', headers,
        body: JSON.stringify({ source_info: { source: 'PULL_FROM_URL', video_url: publicVideoUrl(params.videoUrl) } }),
      }, 'TikTok-Inbox-Upload starten', true)
      return requireString(asObject(body.data).publish_id, 'TikTok-Publish-ID', true)
    })
    for (let attempt = 0; attempt < 60; attempt++) {
      const body = await jsonRequest(`${API_BASE}/post/publish/status/fetch/`, { method: 'POST', headers, body: JSON.stringify({ publish_id: publishId }) }, 'TikTok-Uploadstatus')
      const data = asObject(body.data)
      if (data.status === 'SEND_TO_USER_INBOX' || data.status === 'PUBLISH_COMPLETE') {
        // TikTok API has a typo ('publicaly') - handle both spellings for robustness
        const publicIds = Array.isArray(data.publicly_available_post_id)
          ? data.publicly_available_post_id
          : Array.isArray(data.publicaly_available_post_id)
            ? data.publicaly_available_post_id
            : []
        const publicId = stringField(publicIds[0]) ?? (typeof publicIds[0] === 'number' && Number.isSafeInteger(publicIds[0]) ? String(publicIds[0]) : undefined)
        const publiclyPosted = data.status === 'PUBLISH_COMPLETE' && Boolean(publicId)
        return {
          platformPostId: publicId ?? publishId,
          platformPostUrl: null, // Display name is not a reliable @username for links.
          requiresManualStep: !publiclyPosted,
          ...(!publiclyPosted ? { manualStepReason: data.status === 'PUBLISH_COMPLETE'
            ? 'TikTok meldet den Beitrag als erstellt, bestätigt aber keine öffentliche Sichtbarkeit. Sichtbarkeit in TikTok prüfen.'
            : 'Öffne die Benachrichtigung in deiner TikTok-Inbox, ergänze Titel und Beschreibung und veröffentliche den Clip in TikTok.' } : {}),
        }
      }
      if (data.status === 'FAILED') {
        const reason = stringField(data.fail_reason) ?? ''
        if (reason === 'auth_removed') throw new PublishError('Der Zugriff auf TikTok wurde widerrufen. Bitte erneut verbinden.', 'auth')
        // A terminal remote job stays attached to its ID. Do not silently create a
        // new upload after failure (including download failures) on worker retry.
        throw new PublishError('TikTok hat diesen Upload abgelehnt. Bitte den Clip und die verifizierte Video-Domain prüfen.', 'terminal')
      }
      await pause(5000)
    }
    throw new PublishError('TikTok verarbeitet den vorhandenen Upload noch. Sein Status wird erneut geprüft.', 'retryable')
  },
}
