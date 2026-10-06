import { getAuthenticatedUser, PublishingApiError, publishingErrorResponse } from '@/services/publishing/auth'
import { readTikTokCreator } from '@/services/publishing/tiktok'

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser()
    const id = new URL(request.url).searchParams.get('account_id')
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new PublishingApiError(400, 'Ungültiger TikTok-Kanal.')
    const creator = await readTikTokCreator(user.id, id)
    return Response.json(creator, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return publishingErrorResponse(error) }
}
