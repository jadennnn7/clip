import 'server-only'

import { ConnectError, PublishError, composeCaption, type PostStats, type ProviderAccount, type SocialProvider } from './base'
import {
  asObject, authorization, countField, createRemoteId, durableCheckpoint, grantedScopes, jsonRequest,
  pause, publicVideoUrl, requiredEnv, requireString, stringField,
} from './http'

// Facebook Login variant: professional IG account connected to an authorized Page.
// https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
const graphVersion = () => process.env.META_GRAPH_VERSION ?? 'v21.0'
const apiBase = () => `https://graph.facebook.com/${graphVersion()}`
const SCOPES = ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement']
export const CONTAINER_POLL_INTERVAL_MS = 5000
export const CONTAINER_POLL_TIMEOUT_MS = 5 * 60 * 1000

function igUserId(account: ProviderAccount): string {
  if (!account.metaIgUserId) throw new PublishError('Diesem Konto ist kein Instagram-Professional-Account zugeordnet.', 'terminal')
  return encodeURIComponent(account.metaIgUserId)
}

async function publishingLimit(account: ProviderAccount) {
  const body = await jsonRequest(`${apiBase()}/${igUserId(account)}/content_publishing_limit?fields=quota_usage,config`, {
    headers: authorization(account.accessToken),
  }, 'Instagram-Veröffentlichungslimit')
  const limit = asObject(Array.isArray(body.data) ? body.data[0] : undefined)
  const used = limit.quota_usage
  const quota = asObject(limit.config).quota_total
  if (typeof used !== 'number' || !Number.isFinite(used) || used < 0 || typeof quota !== 'number' || !Number.isFinite(quota) || quota <= 0) {
    throw new PublishError('Instagram liefert kein gültiges Veröffentlichungslimit.', 'retryable')
  }
  return { used, quota, remaining: Math.max(0, quota - used), isKnown: true }
}

function mediaStats(value: unknown): PostStats {
  const media = asObject(value)
  return {
    views: null,
    likes: countField(media.like_count),
    comments: countField(media.comments_count),
    publishedAt: stringField(media.timestamp),
    url: stringField(media.permalink) ?? null,
    thumbnailUrl: stringField(media.thumbnail_url) ?? null,
  }
}

const MEDIA_FIELDS = 'like_count,comments_count,timestamp,permalink,thumbnail_url'

/**
 * Aufrufe gibt es nur über die Insights-API, und die braucht
 * `instagram_manage_insights`. Scheitert der erste Abruf, fehlt die
 * Berechtigung für alle — dann nicht jeden Beitrag einzeln scheitern lassen.
 */
async function addViews(stats: Map<string, PostStats>, headers: Record<string, string>): Promise<void> {
  for (const [id, entry] of stats) {
    try {
      const body = await jsonRequest(`${apiBase()}/${encodeURIComponent(id)}/insights?metric=views`, { headers }, 'Instagram-Insights')
      const metric = asObject(Array.isArray(body.data) ? body.data[0] : undefined)
      entry.views = countField(asObject(Array.isArray(metric.values) ? metric.values[0] : undefined).value)
    } catch (error) {
      if (error instanceof PublishError && error.kind === 'retryable') continue
      for (const other of stats.values()) other.notice ??= 'Aufrufe liefert Instagram nur mit der Berechtigung „instagram_manage_insights“, die diese Verbindung nicht hat.'
      return
    }
  }
}

export const instagramProvider: SocialProvider = {
  platform: 'instagram',

  getAuthUrl({ state, redirectUri }) {
    // Business-Apps (Facebook Login for Business) lehnen `scope` ab: Dort legt
    // eine Konfiguration im App-Dashboard die Berechtigungen fest.
    const configId = process.env.META_LOGIN_CONFIG_ID?.trim()
    return `https://www.facebook.com/${graphVersion()}/dialog/oauth?${new URLSearchParams({
      client_id: requiredEnv('META_APP_ID'), redirect_uri: redirectUri, response_type: 'code',
      ...(configId ? { config_id: configId } : { scope: SCOPES.join(',') }),
      auth_type: 'rerequest', state,
    })}`
  },

  async exchangeCode({ code, redirectUri }) {
    const credentials = { client_id: requiredEnv('META_APP_ID'), client_secret: requiredEnv('META_APP_SECRET') }
    const short = await jsonRequest(`${apiBase()}/oauth/access_token`, {
      method: 'POST', body: new URLSearchParams({ ...credentials, code, redirect_uri: redirectUri }),
    }, 'Instagram-Anmeldung')
    const long = await jsonRequest(`${apiBase()}/oauth/access_token`, {
      method: 'POST', body: new URLSearchParams({ ...credentials, grant_type: 'fb_exchange_token', fb_exchange_token: requireString(short.access_token, 'Meta-Zugriffstoken') }),
    }, 'Instagram-Anmeldung verlängern')
    const userToken = requireString(long.access_token, 'Meta-Zugriffstoken')
    const permissions = await jsonRequest(`${apiBase()}/me/permissions`, { headers: authorization(userToken) }, 'Instagram-Berechtigungen')
    const granted = (Array.isArray(permissions.data) ? permissions.data : [])
      .map(asObject).filter((permission) => permission.status === 'granted').map((permission) => permission.permission).join(',')
    const scopes = grantedScopes(granted, SCOPES)
    const pages = await jsonRequest(`${apiBase()}/me/accounts?fields=id,access_token,instagram_business_account&limit=100`, {
      headers: authorization(userToken),
    }, 'Instagram-Konto auswählen')
    const shared = (Array.isArray(pages.data) ? pages.data : []).map(asObject)
    const connected = shared.filter((page) => stringField(asObject(page.instagram_business_account).id) && stringField(page.access_token))
    if (shared.length === 0) throw new ConnectError('Im Meta-Dialog wurde keine Facebook-Seite freigegeben.', 'no_page_shared')
    if (connected.length === 0) {
      // Nur Zählwerte, keine IDs oder Tokens: Das Server-Log zeigt, was genau fehlt.
      const withInstagram = shared.filter((page) => stringField(asObject(page.instagram_business_account).id)).length
      const withToken = shared.filter((page) => stringField(page.access_token)).length
      throw new ConnectError(`Bitte einen Instagram-Business- oder Creator-Account mit einer Facebook-Seite verknüpfen und diese Seite freigeben (Seiten: ${shared.length}, mit Instagram: ${withInstagram}, mit Seitenzugriff: ${withToken}).`, 'no_linked_page')
    }
    if (connected.length !== 1 || asObject(pages.paging).next) {
      throw new ConnectError('Bitte erneut verbinden und im Meta-Dialog genau die gewünschte Facebook-Seite mit Instagram-Konto auswählen.', 'multiple_pages')
    }
    // A Page token obtained using a long-lived User token has no scheduled expiry.
    // It can still be revoked; 401/Meta code 190 moves the account to needs_reauth.
    // Facebook Login has no perpetual refresh-token grant; never fabricate one.
    return { accessToken: requireString(connected[0].access_token, 'Meta-Seitenzugriffstoken'), scopes }
  },

  async refreshToken() {
    throw new PublishError('Bitte Instagram erneut verbinden. Facebook Login stellt für dieses Seitenzugriffstoken keinen Refresh-Token bereit.', 'auth')
  },

  async getAccountInfo(accessToken) {
    const page = await jsonRequest(`${apiBase()}/me?fields=id,instagram_business_account{id,username,profile_picture_url}`, {
      headers: authorization(accessToken),
    }, 'Instagram-Profil')
    const account = asObject(page.instagram_business_account)
    const id = requireString(account.id, 'Instagram-Professional-Account')
    return {
      platformAccountId: id,
      username: stringField(account.username) ?? null,
      avatarUrl: stringField(account.profile_picture_url) ?? null,
      metaPageId: requireString(page.id, 'Facebook-Seite'),
      metaIgUserId: id,
    }
  },

  getPublishingLimit: publishingLimit,

  async getChannelStats(account) {
    const body = await jsonRequest(`${apiBase()}/${igUserId(account)}?fields=followers_count,media_count`, {
      headers: authorization(account.accessToken),
    }, 'Instagram-Profilstatistik')
    return { followers: countField(body.followers_count), totalViews: null, mediaCount: countField(body.media_count) }
  },

  async getPostStats(account, postIds) {
    const headers = authorization(account.accessToken)
    const result = new Map<string, PostStats>()
    for (let start = 0; start < postIds.length; start += 50) {
      const ids = postIds.slice(start, start + 50)
      try {
        // Mehrfachabruf: ein Request für bis zu 50 Beiträge.
        const body = await jsonRequest(`${apiBase()}/?ids=${ids.map(encodeURIComponent).join(',')}&fields=${MEDIA_FIELDS}`, { headers }, 'Instagram-Beiträge')
        for (const [id, value] of Object.entries(body)) result.set(id, mediaStats(value))
      } catch (error) {
        // Ein gelöschter Beitrag lässt den ganzen Mehrfachabruf scheitern.
        // Dann einzeln, damit die übrigen trotzdem Zahlen bekommen.
        if (!(error instanceof PublishError) || error.kind !== 'terminal') throw error
        const single = await Promise.allSettled(ids.map((id) =>
          jsonRequest(`${apiBase()}/${encodeURIComponent(id)}?fields=${MEDIA_FIELDS}`, { headers }, 'Instagram-Beitrag')))
        single.forEach((entry, index) => { if (entry.status === 'fulfilled') result.set(ids[index], mediaStats(entry.value)) })
      }
    }
    await addViews(result, headers)
    return result
  },

  async publish(params) {
    const checkpoint = durableCheckpoint(params)
    const headers = authorization(params.account.accessToken)
    const userId = igUserId(params.account)
    let postId = checkpoint.get('instagram_post_id')
    if (!postId) {
      // Existing containers bypass the creation path, even when local retries resume.
      const containerId = await createRemoteId(checkpoint, 'instagram_container_id', async () => {
        const limit = await publishingLimit(params.account)
        if (!limit.remaining) throw new PublishError('Das Instagram-Veröffentlichungslimit ist erreicht.', 'quota')
        const body = await jsonRequest(`${apiBase()}/${userId}/media`, {
          method: 'POST', headers,
          body: new URLSearchParams({ media_type: 'REELS', video_url: publicVideoUrl(params.videoUrl),
            caption: composeCaption([params.title, params.description].filter(Boolean).join('\n\n'), params.hashtags, 2200), share_to_feed: 'true' }),
        }, 'Instagram-Container erstellen', true)
        return requireString(body.id, 'Instagram-Container-ID', true)
      })
      let finished = false
      for (let attempt = 0; attempt < CONTAINER_POLL_TIMEOUT_MS / CONTAINER_POLL_INTERVAL_MS; attempt++) {
        const status = await jsonRequest(`${apiBase()}/${encodeURIComponent(containerId)}?fields=status_code`, { headers }, 'Instagram-Verarbeitungsstatus')
        if (status.status_code === 'PUBLISHED') {
          // Container status cannot reliably recover the final media ID. No replay.
          throw new PublishError('Instagram meldet den Clip als veröffentlicht, die Post-ID wurde jedoch nicht sicher gespeichert. Profil prüfen; kein erneutes Veröffentlichen.', 'uncertain')
        }
        if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
          throw new PublishError('Instagram hat den Video-Container abgelehnt oder ablaufen lassen.', 'terminal')
        }
        if (status.status_code === 'FINISHED') { finished = true; break }
        await pause(CONTAINER_POLL_INTERVAL_MS)
      }
      if (!finished) throw new PublishError('Instagram verarbeitet den vorhandenen Video-Container noch.', 'retryable')
      postId = await createRemoteId(checkpoint, 'instagram_post_id', async () => {
        const result = await jsonRequest(`${apiBase()}/${userId}/media_publish`, {
          method: 'POST', headers, body: new URLSearchParams({ creation_id: containerId }),
        }, 'Instagram-Reel veröffentlichen', true)
        return requireString(result.id, 'Instagram-Post-ID', true)
      })
    }
    const media = await jsonRequest(`${apiBase()}/${encodeURIComponent(postId)}?fields=id,permalink`, { headers }, 'Instagram-Post')
    return { platformPostId: postId, platformPostUrl: stringField(media.permalink) ?? null, requiresManualStep: false }
  },
}
