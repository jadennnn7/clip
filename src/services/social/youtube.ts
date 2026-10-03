import 'server-only'

import { PublishError, composeCaption, type PostStats, type PublishResult, type SocialProvider } from './base'
import {
  asObject, authorization, countField, createRemoteId, durableCheckpoint, expiresIn, fetchResponse,
  grantedScopes, jsonRequest, pause, providerError, publicVideoUrl, readJson, requiredEnv,
  requireString, stringField, unknownLimit, type Checkpoint,
} from './http'

// https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status'
const API_BASE = 'https://www.googleapis.com/youtube/v3'
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly']
export const YOUTUBE_DAILY_UPLOAD_QUOTA = 100
const CHUNK_BYTES = 8 * 1024 * 1024 // A multiple of YouTube's 256 KiB chunk boundary.

async function tokenRequest(fields: Record<string, string>, refreshing = false) {
  const body = await jsonRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: requiredEnv('GOOGLE_CLIENT_ID'), client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'), ...fields }),
  }, 'YouTube-Anmeldung')
  return {
    accessToken: requireString(body.access_token, 'YouTube-Zugriffstoken'),
    refreshToken: stringField(body.refresh_token),
    expiresAt: expiresIn(body.expires_in),
    refreshExpiresAt: expiresIn(body.refresh_token_expires_in),
    scopes: refreshing && !body.scope ? [] : grantedScopes(body.scope, SCOPES),
  }
}

function sessionUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== 'www.googleapis.com' || url.pathname !== '/upload/youtube/v3/videos') {
    throw new PublishError('YouTube lieferte eine ungültige Upload-Adresse.', 'uncertain')
  }
  return value
}

async function saveVideo(response: Response, checkpoint: Checkpoint): Promise<void> {
  const data = await readJson(response, 'YouTube-Upload', true)
  const id = requireString(data.id, 'YouTube-Video-ID', true)
  await checkpoint.update({ youtube_video_id: id })
}

function resumeOffset(response: Response, total: number): number {
  const range = response.headers.get('range')
  if (!range) return 0
  const match = /^bytes=0-(\d+)$/.exec(range)
  const offset = match ? Number(match[1]) + 1 : NaN
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > total) {
    throw new PublishError('YouTube lieferte einen unklaren Upload-Fortschritt.', 'uncertain')
  }
  return offset
}

async function boundedBytes(response: Response, expected: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body) throw new PublishError('Das gerenderte Video ist leer.', 'terminal')
  const reader = response.body.getReader()
  const bytes = new Uint8Array(expected)
  let received = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      if (received + result.value.length > expected) {
        await reader.cancel()
        throw new PublishError('Der Videospeicher unterstützt keine korrekten Teilabrufe.', 'terminal')
      }
      bytes.set(result.value, received)
      received += result.value.length
    }
  } catch (error) {
    if (error instanceof PublishError) throw error
    throw new PublishError('Der Videoabruf wurde unterbrochen.', 'retryable')
  } finally { reader.releaseLock() }
  if (received !== expected) throw new PublishError('Das gerenderte Video wurde nur teilweise gelesen.', 'retryable')
  return bytes
}

async function resultForVideo(accessToken: string, id: string): Promise<PublishResult> {
  // Upload accepted is not equivalent to successfully processed/published.
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await jsonRequest(`${API_BASE}/videos?part=status,processingDetails&id=${encodeURIComponent(id)}`, {
      headers: authorization(accessToken),
    }, 'YouTube-Verarbeitungsstatus')
    const video = asObject(Array.isArray(response.items) ? response.items[0] : undefined)
    if (!video.id) throw new PublishError('Das hochgeladene YouTube-Video ist noch nicht abrufbar.', 'retryable')
    const status = asObject(video.status)
    const processing = asObject(video.processingDetails).processingStatus
    if (['failed', 'terminated'].includes(String(processing)) || ['failed', 'rejected', 'deleted'].includes(String(status.uploadStatus))) {
      throw new PublishError('YouTube hat die Verarbeitung des Videos abgelehnt. Bitte in YouTube Studio prüfen.', 'terminal')
    }
    if (processing === 'succeeded' || status.uploadStatus === 'processed') {
      const isPublic = status.privacyStatus === 'public'
      return {
        platformPostId: id,
        platformPostUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
        requiresManualStep: !isPublic,
        ...(!isPublic ? { manualStepReason: 'Das Video ist auf YouTube nicht öffentlich. Sichtbarkeit in YouTube Studio prüfen; API-Projekte benötigen gegebenenfalls das YouTube-Compliance-Audit.' } : {}),
      }
    }
    await pause(5000)
  }
  throw new PublishError('YouTube verarbeitet das hochgeladene Video noch. Der vorhandene Upload wird weiter geprüft.', 'retryable')
}

export const youtubeProvider: SocialProvider = {
  platform: 'youtube',

  getAuthUrl({ state, redirectUri }) {
    return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: requiredEnv('GOOGLE_CLIENT_ID'), redirect_uri: redirectUri,
      response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', state,
    })}`
  },

  exchangeCode({ code, redirectUri }) {
    return tokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' })
  },

  refreshToken(refreshToken) {
    return tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' }, true)
  },

  async getAccountInfo(accessToken) {
    const body = await jsonRequest(`${API_BASE}/channels?part=snippet&mine=true`, { headers: authorization(accessToken) }, 'YouTube-Kanal')
    const channel = asObject(Array.isArray(body.items) ? body.items[0] : undefined)
    if (!channel.id) throw new PublishError('Dieses Google-Konto besitzt keinen zugänglichen YouTube-Kanal.', 'terminal')
    const snippet = asObject(channel.snippet)
    return {
      platformAccountId: requireString(channel.id, 'YouTube-Kanal-ID'),
      username: stringField(snippet.customUrl) ?? stringField(snippet.title) ?? null,
      avatarUrl: stringField(asObject(asObject(snippet.thumbnails).default).url) ?? null,
    }
  },

  async getPublishingLimit() {
    // Google exposes no quota-remaining endpoint. The worker counts project usage.
    return unknownLimit()
  },

  async getChannelStats(account) {
    const body = await jsonRequest(`${API_BASE}/channels?part=statistics&mine=true`, { headers: authorization(account.accessToken) }, 'YouTube-Kanalstatistik')
    const stats = asObject(asObject(Array.isArray(body.items) ? body.items[0] : undefined).statistics)
    const hidden = stats.hiddenSubscriberCount === true
    return {
      followers: hidden ? null : countField(stats.subscriberCount),
      totalViews: countField(stats.viewCount),
      mediaCount: countField(stats.videoCount),
      ...(hidden ? { notice: 'Die Abonnentenzahl ist in diesem Kanal verborgen.' } : {}),
    }
  },

  async getPostStats(account, postIds) {
    const result = new Map<string, PostStats>()
    // videos.list nimmt bis zu 50 IDs und kostet eine Quota-Einheit pro Aufruf.
    for (let start = 0; start < postIds.length; start += 50) {
      const ids = postIds.slice(start, start + 50).map(encodeURIComponent).join(',')
      const body = await jsonRequest(`${API_BASE}/videos?part=statistics,snippet&id=${ids}`, { headers: authorization(account.accessToken) }, 'YouTube-Videostatistik')
      for (const item of Array.isArray(body.items) ? body.items : []) {
        const video = asObject(item)
        const id = stringField(video.id)
        if (!id) continue
        const stats = asObject(video.statistics)
        const snippet = asObject(video.snippet)
        const thumbnails = asObject(snippet.thumbnails)
        result.set(id, {
          views: countField(stats.viewCount),
          likes: countField(stats.likeCount),
          comments: countField(stats.commentCount),
          publishedAt: stringField(snippet.publishedAt),
          url: `https://www.youtube.com/shorts/${encodeURIComponent(id)}`,
          thumbnailUrl: stringField(asObject(thumbnails.medium).url) ?? stringField(asObject(thumbnails.default).url) ?? null,
        })
      }
    }
    return result
  },

  async publish(params) {
    const checkpoint = durableCheckpoint(params)
    const accessToken = params.account.accessToken
    let videoId = checkpoint.get('youtube_video_id')
    if (videoId) return resultForVideo(accessToken, videoId)
    const videoUrl = publicVideoUrl(params.videoUrl)
    let uploadUrl = checkpoint.get('youtube_session_url')
    let total = Number(checkpoint.get('youtube_total_bytes'))
    let offset = 0

    if (!uploadUrl) {
      const head = await fetchResponse(videoUrl, { method: 'HEAD' }, 'Videospeicher')
      if (!head.ok) throw providerError(head.status, {}, 'Videospeicher')
      total = Number(head.headers.get('content-length'))
      if (!Number.isSafeInteger(total) || total <= 0) throw new PublishError('Der Videospeicher muss eine gültige Dateigröße liefern.', 'terminal')
      await checkpoint.update({ youtube_total_bytes: String(total), youtube_source_etag: head.headers.get('etag') ?? '' })
      uploadUrl = await createRemoteId(checkpoint, 'youtube_session_url', async () => {
        const response = await fetchResponse(UPLOAD_ENDPOINT, {
          method: 'POST', headers: { ...authorization(accessToken), 'Content-Type': 'application/json', 'X-Upload-Content-Length': String(total), 'X-Upload-Content-Type': 'video/mp4' },
          body: JSON.stringify({
            snippet: { title: params.title.slice(0, 100), description: composeCaption(params.description, params.hashtags, 5000), categoryId: '22' },
            // Do not guess audience classification; creators' channel defaults apply.
            status: { privacyStatus: process.env.YOUTUBE_AUDIT_PASSED === 'true' ? 'public' : 'private' },
          }),
        }, 'YouTube-Upload starten', true)
        if (!response.ok) { await readJson(response, 'YouTube-Upload starten', true) }
        return sessionUrl(requireString(response.headers.get('location'), 'YouTube-Upload-Adresse', true))
      })
    } else {
      if (!Number.isSafeInteger(total) || total <= 0) throw new PublishError('YouTube-Upload-Checkpoint unvollständig.', 'uncertain')
      // Reconcile before sending ANY bytes after a crash or ambiguous PUT response.
      const response = await fetchResponse(sessionUrl(uploadUrl), {
        method: 'PUT', headers: { ...authorization(accessToken), 'Content-Length': '0', 'Content-Range': `bytes */${total}` },
      }, 'YouTube-Upload abgleichen')
      if (response.status === 200 || response.status === 201) {
        await saveVideo(response, checkpoint)
        return resultForVideo(accessToken, checkpoint.get('youtube_video_id')!)
      }
      if (response.status === 404 || response.status === 410) throw new PublishError('YouTube-Upload-Sitzung abgelaufen. Vor einem neuen Upload den Kanal auf bereits veröffentlichte Videos prüfen.', 'uncertain')
      if (response.status !== 308) { await readJson(response, 'YouTube-Upload abgleichen'); throw new PublishError('Unbekannter YouTube-Uploadstatus.', 'uncertain') }
      offset = resumeOffset(response, total)
    }

    while (offset < total) {
      const end = Math.min(offset + CHUNK_BYTES, total) - 1
      const etag = checkpoint.get('youtube_source_etag')
      const source = await fetchResponse(videoUrl, { headers: { Range: `bytes=${offset}-${end}`, ...(etag ? { 'If-Match': etag } : {}) } }, 'Video-Teilabruf')
      if (!source.ok) throw providerError(source.status, {}, 'Video-Teilabruf')
      const expectedRange = `bytes ${offset}-${end}/${total}`
      if ((source.status !== 206 && !(source.status === 200 && offset === 0 && end === total - 1)) || (source.status === 206 && source.headers.get('content-range') !== expectedRange)) {
        await source.body?.cancel()
        throw new PublishError('Der Videospeicher liefert einen ungültigen Teilabruf.', 'terminal')
      }
      const bytes = await boundedBytes(source, end - offset + 1)
      // Session is durable: a network error is safe to retry via status reconciliation.
      const uploaded = await fetchResponse(sessionUrl(uploadUrl), {
        method: 'PUT', headers: { ...authorization(accessToken), 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.byteLength), 'Content-Range': expectedRange }, body: bytes,
      }, 'YouTube-Video hochladen')
      if (uploaded.status === 200 || uploaded.status === 201) { await saveVideo(uploaded, checkpoint); break }
      if (uploaded.status === 404 || uploaded.status === 410) throw new PublishError('YouTube-Upload-Sitzung nicht mehr verfügbar. Kanal vor erneutem Upload prüfen.', 'uncertain')
      if (uploaded.status !== 308) { await readJson(uploaded, 'YouTube-Video hochladen'); throw new PublishError('Unbekannte YouTube-Uploadantwort.', 'uncertain') }
      const next = resumeOffset(uploaded, total)
      if (next <= offset) throw new PublishError('YouTube hat den Upload noch nicht weiter angenommen.', 'retryable')
      offset = next
    }
    videoId = checkpoint.get('youtube_video_id')
    if (!videoId) throw new PublishError('YouTube bestätigt den abgeschlossenen Upload noch nicht.', 'retryable')
    return resultForVideo(accessToken, videoId)
  },
}
