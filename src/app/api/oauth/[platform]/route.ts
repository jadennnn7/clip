import { NextResponse } from 'next/server'
import { requestOrigin } from '@/lib/request-origin'
import { getProvider } from '@/services/social'
import { listAccounts } from '@/services/publishing/accounts'
import { channelLimit } from '@/services/publishing/limits'
import { getAuthenticatedUser, PublishingApiError, publishingErrorResponse } from '@/services/publishing/auth'
import { getPublishingCapabilities, isSocialPlatform, publishingAppOrigin } from '@/services/publishing/config'
import { createOAuthState, oauthCookieName, oauthReturnPath, parseOAuthReturn } from '@/services/publishing/oauth-state'

export async function GET(request: Request, context: { params: Promise<{ platform: string }> }) {
  try {
    const { platform } = await context.params
    if (!isSocialPlatform(platform)) throw new PublishingApiError(404, 'Plattform nicht gefunden.')
    if (request.headers.get('sec-fetch-site') === 'cross-site') throw new PublishingApiError(403, 'Starte die Verbindung bitte in Ocuris.')
    const origin = publishingAppOrigin()
    // `?return=onboarding`: Die Erst-Einrichtung bekommt das Ergebnis selbst.
    const returnTo = parseOAuthReturn(new URL(request.url).searchParams.get('return'))
    const returnPath = oauthReturnPath(returnTo)
    // Session and OAuth cookies are host-bound. Never start on localhost when
    // the provider will return to a public tunnel (or another app domain).
    // Die Meldung kommt dorthin zurück, wo der Nutzer gerade ist: Die
    // konfigurierte Adresse kann unerreichbar sein (beendeter Tunnel).
    const requestHost = request.headers.get('host') ?? new URL(request.url).host
    if (requestHost !== new URL(origin).host) {
      const response = NextResponse.redirect(new URL(`${returnPath}?error=oauth_origin_mismatch`, requestOrigin(request)))
      response.headers.set('Cache-Control', 'no-store')
      return response
    }
    let user: { id: string }
    try { user = await getAuthenticatedUser() } catch (error) {
      if (!(error instanceof PublishingApiError) || error.status !== 401) throw error
      const response = NextResponse.redirect(new URL(`/login?error=oauth_session_expired&redirect=${encodeURIComponent(returnPath)}`, origin))
      response.headers.set('Cache-Control', 'no-store')
      return response
    }
    if (!getPublishingCapabilities()[platform].configured) {
      return NextResponse.redirect(new URL(`${returnPath}?error=setup_required`, origin))
    }
    // Früh abweisen statt erst nach der Anmeldung bei der Plattform. Wer einen
    // abgelaufenen Kanal neu verbindet, belegt keinen neuen Platz; ob es
    // wirklich derselbe ist, entscheidet der Callback.
    const [accounts, limit] = await Promise.all([listAccounts(user.id), channelLimit(user.id)])
    const reconnecting = accounts.some((account) => account.platform === platform && account.status !== 'active')
    if (accounts.length >= limit && !reconnecting) {
      return NextResponse.redirect(new URL(`${returnPath}?error=channel_limit`, origin))
    }
    const { state, cookie, codeChallenge } = createOAuthState(user.id, platform, returnTo)
    const redirectUri = `${origin}/api/oauth/${platform}/callback`
    const response = NextResponse.redirect(getProvider(platform).getAuthUrl({ state, redirectUri, codeChallenge }))
    response.headers.set('Cache-Control', 'no-store')
    response.cookies.set(oauthCookieName(platform), cookie, {
      httpOnly: true, secure: origin.startsWith('https://'), sameSite: 'lax',
      path: `/api/oauth/${platform}`, maxAge: 600,
    })
    return response
  } catch (error) { return publishingErrorResponse(error) }
}
