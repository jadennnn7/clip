import 'server-only'

import { composeCaption, PublishError, type ProviderAccount, type SocialProvider } from './base'
import type { TikTokCreatorInfo, TikTokPostOptions, TikTokPrivacy } from '@/types/tiktok'
import {
  asObject, authorization, createRemoteId, durableCheckpoint, expiresIn, grantedScopes,
  jsonRequest, pause, publicVideoUrl, requiredEnv, requireString, stringField, unknownLimit,
} from './http'

const API_BASE = 'https://open.tiktokapis.com/v2'
const SCOPES = ['user.info.basic', 'video.publish']

// https://developers.tiktok.com/doc/content-sharing-guidelines
// Direct Post needs a creator-selected privacy value and consent for each post.
export const TIKTOK_MODE_NOTICE = 'Veröffentliche direkt aus der Clip-Vorschau mit deiner gewählten Sichtbarkeit. Öffentliche Direct Posts benötigen das TikTok-App-Audit; bis dahin sind nur private Testposts möglich.'

const PRIVACY_LEVELS: TikTokPrivacy[] = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']

export async function getTikTokCreatorInfo(account: ProviderAccount): Promise<TikTokCreatorInfo> {
  if (!account.scopes?.includes('video.publish')) {
    throw new PublishError('Für direktes Veröffentlichen fehlt die Berechtigung video.publish. Aktiviere Direct Post in deiner TikTok-App und verbinde den Kanal danach erneut.', 'terminal')
  }
  const body = await jsonRequest(`${API_BASE}/post/publish/creator_info/query/`, {
    method: 'POST', headers: { ...authorization(account.accessToken), 'Content-Type': 'application/json; charset=UTF-8' },
  }, 'TikTok-Veröffentlichungsoptionen')
  const data = asObject(body.data)
  const publicPostingEnabled = process.env.TIKTOK_AUDIT_PASSED === 'true'
  const privacyOptions = Array.isArray(data.privacy_level_options)
    ? data.privacy_level_options.filter((value): value is TikTokPrivacy => PRIVACY_LEVELS.includes(value as TikTokPrivacy) && (publicPostingEnabled || value === 'SELF_ONLY')) : []
  if (!privacyOptions.length || typeof data.max_video_post_duration_sec !== 'number' || data.max_video_post_duration_sec <= 0) {
    throw new PublishError('TikTok liefert derzeit keine gültigen Veröffentlichungsoptionen. Bitte versuche es später erneut.', 'terminal')
  }
  return {
    username: requireString(data.creator_username, 'TikTok-Benutzername'),
    nickname: requireString(data.creator_nickname, 'TikTok-Kanalname'), privacyOptions,
    commentDisabled: data.comment_disabled !== false,
    duetDisabled: data.duet_disabled !== false,
    stitchDisabled: data.stitch_disabled !== false,
    maxDurationSeconds: data.max_video_post_duration_sec, publicPostingEnabled,
  }
}

export function validateTikTokPost(options: TikTokPostOptions, creator: TikTokCreatorInfo, durationSeconds: number): void {
  if (options.consent !== true || !creator.privacyOptions.includes(options.privacyLevel)) throw new PublishError('Wähle eine verfügbare TikTok-Sichtbarkeit und bestätige die Veröffentlichung.', 'terminal')
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > creator.maxDurationSeconds) throw new PublishError(`Dieser TikTok-Kanal erlaubt Videos bis ${creator.maxDurationSeconds} Sekunden. Kürze den Clip.`, 'terminal')
  if ((options.allowComment && creator.commentDisabled) || (options.allowDuet && creator.duetDisabled) || (options.allowStitch && creator.stitchDisabled)) throw new PublishError('Die TikTok-Interaktionseinstellungen haben sich geändert. Prüfe den Clip erneut.', 'terminal')
  if (options.commercialContent !== (options.ownBrand || options.brandedContent) || (options.brandedContent && options.privacyLevel === 'SELF_ONLY')) throw new PublishError('Prüfe die TikTok-Werbekennzeichnung und Sichtbarkeit.', 'terminal')
}

async function tokenRequest(fields: Record<string, string>) {
  const body = await jsonRequest(`${API_BASE}/oauth/token/`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: requiredEnv('TIKTOK_CLIENT_KEY'), client_secret: requiredEnv('TIKTOK_CLIENT_SECRET'), ...fields }),
  }, 'TikTok-Anmeldung')
  return {
    accessToken: requireString(body.access_token, 'TikTok-Zugriffstoken'),
    refreshToken: requireString(body.refresh_token, 'TikTok-Refresh-Token'),
    expiresAt: expiresIn(body.expires_in),
    refreshExpiresAt: expiresIn(body.refresh_expires_in),
    // Old Inbox connections can refresh; only new connections require Direct Post.
    scopes: grantedScopes(body.scope, fields.grant_type === 'refresh_token' ? ['user.info.basic'] : SCOPES),
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
    const direct = params.tiktokPost
    if (direct && (checkpoint.get('tiktok_publish_id') || checkpoint.get('tiktok_publish_id_pending'))) throw new PublishError('Dieser Auftrag wurde bereits an die TikTok-Inbox gesendet. Lege für Direct Post einen neuen Auftrag mit deiner Sichtbarkeitsauswahl an.', 'terminal')
    const publishId = await createRemoteId(checkpoint, direct ? 'tiktok_direct_publish_id' : 'tiktok_publish_id', async () => {
      let postInfo
      if (direct) {
        const creator = await getTikTokCreatorInfo(params.account)
        validateTikTokPost(direct, creator, params.videoDurationSeconds ?? NaN)
        await checkpoint.update({ tiktok_creator_username: creator.username, tiktok_privacy_level: direct.privacyLevel })
        postInfo = {
          title: composeCaption(params.description, params.hashtags, 2200),
          privacy_level: direct.privacyLevel,
          disable_comment: !direct.allowComment, disable_duet: !direct.allowDuet, disable_stitch: !direct.allowStitch,
          brand_organic_toggle: direct.ownBrand, brand_content_toggle: direct.brandedContent, is_aigc: direct.isAigc,
        }
      }
      // The video's domain or URL prefix must be verified in the TikTok console.
      const body = await jsonRequest(`${API_BASE}/post/publish/${direct ? 'video' : 'inbox/video'}/init/`, {
        method: 'POST', headers,
        body: JSON.stringify({ ...(postInfo ? { post_info: postInfo } : {}), source_info: { source: 'PULL_FROM_URL', video_url: publicVideoUrl(params.videoUrl) } }),
      }, direct ? 'TikTok direkt veröffentlichen' : 'TikTok-Inbox-Upload starten', true)
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
        const publiclyPosted = data.status === 'PUBLISH_COMPLETE' && Boolean(publicId) && (!direct || direct.privacyLevel === 'PUBLIC_TO_EVERYONE')
        return {
          platformPostId: publicId ?? publishId,
          platformPostUrl: publiclyPosted && checkpoint.get('tiktok_creator_username') ? `https://www.tiktok.com/@${encodeURIComponent(checkpoint.get('tiktok_creator_username')!)}/video/${encodeURIComponent(publicId!)}` : null,
          requiresManualStep: !publiclyPosted,
          ...(!publiclyPosted ? { manualStepReason: direct && data.status === 'PUBLISH_COMPLETE' && direct.privacyLevel !== 'PUBLIC_TO_EVERYONE'
            ? direct.privacyLevel === 'SELF_ONLY' ? 'Privat auf TikTok veröffentlicht. Sichtbarkeit: Nur ich.' : 'Auf TikTok veröffentlicht. Sichtbarkeit: Freunde oder Follower.'
            : data.status === 'PUBLISH_COMPLETE'
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
