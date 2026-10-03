import { getAuthenticatedUser, publishingErrorResponse } from '@/services/publishing/auth'
import { listAccounts } from '@/services/publishing/accounts'
import { channelLimit } from '@/services/publishing/limits'
import { getPublishingCapabilities, getPublishingSetupNotice } from '@/services/publishing/config'

export async function GET() {
  try {
    const user = await getAuthenticatedUser()
    const setupNotice = getPublishingSetupNotice()
    if (setupNotice) {
      return Response.json(
        { accounts: [], capabilities: getPublishingCapabilities(), configured: false, error: setupNotice },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
    const [accounts, limit] = await Promise.all([listAccounts(user.id), channelLimit(user.id)])
    return Response.json(
      {
        accounts,
        capabilities: getPublishingCapabilities(),
        configured: true,
        channelLimit: limit,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return publishingErrorResponse(error)
  }
}
