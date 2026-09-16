import 'server-only'

import { PublishError, composeCaption, type SocialProvider } from './base'

/**
 * YouTube Data API v3 — Shorts.
 *
 * ZWEI HARTE GRENZEN, die den vollautomatischen Betrieb begrenzen:
 *
 * 1) Compliance-Audit. Apps, die nach dem 28.07.2020 angelegt wurden und kein
 *    Audit bestanden haben, dürfen ausschließlich mit `privacyStatus: private`
 *    hochladen. Öffentliches Publishing ist bis dahin API-seitig gesperrt.
 *    → `UPLOADS_ARE_PUBLIC` schaltet das nach bestandenem Audit frei.
 *
 * 2) Kontingent. `videos.insert` läuft in einem EIGENEN Bucket von 100 Uploads
 *    pro Tag PRO GCP-PROJEKT — nicht pro Nutzer. Das ist die Obergrenze über
 *    alle Kunden hinweg und damit der erste Engpass beim Wachstum. Eine
 *    Quota-Extension muss beantragt werden, bevor die Plattform skaliert.
 *
 * Ein Video wird als Short erkannt, wenn es vertikal und höchstens 3 Minuten
 * lang ist — ein eigenes Flag gibt es nicht.
 */

const UPLOAD_ENDPOINT =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status'

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
]

/** Tagesbudget für videos.insert, projektweit. */
export const YOUTUBE_DAILY_UPLOAD_QUOTA = 100

/** Erst nach bestandenem Compliance-Audit auf `true` stellen. */
const UPLOADS_ARE_PUBLIC = process.env.YOUTUBE_AUDIT_PASSED === 'true'

const MAX_TITLE_LENGTH = 100
const MAX_DESCRIPTION_LENGTH = 5000

export const youtubeProvider: SocialProvider = {
  platform: 'youtube',

  getAuthUrl({ state, redirectUri }) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      // Ohne `access_type=offline` + `prompt=consent` liefert Google beim
      // zweiten Verbinden KEINEN Refresh Token mehr — der Kanal wäre dann
      // nach einer Stunde tot und müsste manuell neu verbunden werden.
      access_type: 'offline',
      prompt: 'consent',
      state,
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  },

  async exchangeCode() {
    // Phase 2: POST https://oauth2.googleapis.com/token
    throw new Error('youtube.exchangeCode: noch nicht implementiert (Phase 2)')
  },

  async refreshToken() {
    // Google-Refresh-Tokens laufen nicht ab, werden aber ungültig, wenn sie
    // sechs Monate ungenutzt bleiben oder der Nutzer den Zugriff widerruft.
    throw new Error('youtube.refreshToken: noch nicht implementiert (Phase 2)')
  },

  async getAccountInfo() {
    // Phase 2: GET /youtube/v3/channels?part=snippet&mine=true
    throw new Error('youtube.getAccountInfo: noch nicht implementiert (Phase 2)')
  },

  async getPublishingLimit() {
    // Google gibt den Kontingentstand nicht über die API aus. Gezählt wird
    // deshalb selbst: COUNT der heute veröffentlichten posting_schedules mit
    // platform = 'youtube', projektweit über alle Nutzer.
    throw new Error('youtube.getPublishingLimit: noch nicht implementiert (Phase 2)')
  },

  async publish({ title, description, hashtags }) {
    const snippet = {
      title: title.slice(0, MAX_TITLE_LENGTH),
      description: composeCaption(description, hashtags, MAX_DESCRIPTION_LENGTH),
      categoryId: '22', // People & Blogs
    }

    const status = {
      privacyStatus: UPLOADS_ARE_PUBLIC ? 'public' : 'private',
      selfDeclaredMadeForKids: false,
    }

    void snippet
    void status
    void UPLOAD_ENDPOINT

    // Phase 2:
    //   1. POST UPLOAD_ENDPOINT mit { snippet, status } → Upload-URL aus dem
    //      Location-Header
    //   2. Video in Chunks per PUT an diese URL streamen (resumable, damit ein
    //      Abbruch bei 200 MB nicht von vorn beginnt)
    //   3. Video-ID aus der Antwort lesen
    throw new PublishError('youtube.publish: noch nicht implementiert (Phase 2)', 'terminal')
  },
}
