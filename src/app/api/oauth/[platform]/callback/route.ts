import { NextResponse, type NextRequest } from 'next/server'
import { getProvider } from '@/services/social'
import { ConnectError } from '@/services/social/base'
import { listAccounts, saveAccountConnection } from '@/services/publishing/accounts'
import { channelLimit } from '@/services/publishing/limits'
import { getAuthenticatedUser, PublishingApiError, publishingErrorResponse } from '@/services/publishing/auth'
import { isSocialPlatform, publishingAppOrigin } from '@/services/publishing/config'
import { extractOAuthState, oauthCookieName, oauthReturnPath } from '@/services/publishing/oauth-state'

export async function GET(request: NextRequest, context: { params: Promise<{ platform: string }> }) {
  const { platform } = await context.params
  if (!isSocialPlatform(platform)) return Response.json({ error: 'Plattform nicht gefunden.' }, { status: 404 })
  let origin: string
  try { origin = publishingAppOrigin() } catch (error) { return publishingErrorResponse(error) }
  let returnPath = oauthReturnPath('connections')
  function finish(query: string, pathname = returnPath) {
    const response = NextResponse.redirect(new URL(`${pathname}?${query}`, origin))
    response.headers.set('Cache-Control', 'no-store')
    response.cookies.set(oauthCookieName(platform as 'youtube' | 'instagram' | 'tiktok'), '', {
      path: `/api/oauth/${platform}`, maxAge: 0, httpOnly: true,
      secure: origin.startsWith('https://'), sameSite: 'lax',
    })
    return response
  }
  let failure = 'connection_failed'
  try {
    const user = await getAuthenticatedUser()
    const state = request.nextUrl.searchParams.get('state')
    const { valid, codeVerifier, returnTo } = extractOAuthState(
      request.cookies.get(oauthCookieName(platform))?.value,
      state,
      user.id,
      platform,
    )
    returnPath = oauthReturnPath(returnTo)
    if (!valid) {
      return finish('error=invalid_state')
    }
    if (request.nextUrl.searchParams.has('error')) return finish('error=access_denied')
    const code = request.nextUrl.searchParams.get('code')
    if (!code || code.length > 4096) return finish('error=missing_code')
    const provider = getProvider(platform)
    failure = 'token_exchange_failed'
    const tokens = await provider.exchangeCode({
      code,
      redirectUri: `${origin}/api/oauth/${platform}/callback`,
      codeVerifier,
    })
    failure = 'account_lookup_failed'
    const info = await provider.getAccountInfo(tokens.accessToken)
    failure = 'connection_save_failed'
    // Ein bereits verbundener Kanal darf immer neu verbunden werden; ein neuer
    // nur, solange das Kanal-Limit des Tarifs nicht erreicht ist.
    const [accounts, limit] = await Promise.all([listAccounts(user.id), channelLimit(user.id)])
    const known = accounts.some((account) => account.platform === platform && account.platform_account_id === info.platformAccountId)
    if (!known && accounts.length >= limit) return finish('error=channel_limit')
    await saveAccountConnection(user.id, platform, info, tokens)
    return finish(`connected=${platform}`)
  } catch (error) {
    if (error instanceof PublishingApiError && error.status === 401) {
      return finish('error=oauth_session_expired&redirect=%2Fdashboard%2Fconnections', '/login')
    }
    // Eigene Meldungen enthalten keine Tokens oder Plattform-Antworten: Im
    // Server-Log nennen sie den genauen Grund.
    console.error(`[oauth] ${platform} ${failure}:`, error instanceof Error ? error.message : error)
    if (error instanceof ConnectError) return finish(`error=${error.reason}`)
    // Neither provider messages nor incoming error_description reach the URL.
    return finish(`error=${failure}`)
  }
}
