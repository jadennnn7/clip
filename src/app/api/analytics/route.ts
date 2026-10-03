import { getAnalytics } from '@/services/analytics/overview'
import { getAuthenticatedUser, publishingErrorResponse } from '@/services/publishing/auth'
import { getPublishingSetupNotice } from '@/services/publishing/config'
import type { AnalyticsResponse } from '@/types/analytics'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** Kennzahlen der veröffentlichten Clips und verbundenen Kanäle. `?fresh` umgeht den Cache. */
export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser()
    const setupNotice = getPublishingSetupNotice()
    if (setupNotice) {
      const empty: AnalyticsResponse = { configured: false, error: setupNotice, fetchedAt: new Date().toISOString(), channels: [], posts: [], queue: [] }
      return Response.json(empty, { headers: NO_STORE })
    }
    const fresh = new URL(request.url).searchParams.has('fresh')
    return Response.json(await getAnalytics(user.id, fresh), { headers: NO_STORE })
  } catch (error) {
    return publishingErrorResponse(error)
  }
}
