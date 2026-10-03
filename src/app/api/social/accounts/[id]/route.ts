import { z } from 'zod'
import { assertSameOrigin, getAuthenticatedUser, PublishingApiError, publishingErrorResponse } from '@/services/publishing/auth'
import { disconnectAccount, updateAccountSettings } from '@/services/publishing/accounts'

const Settings = z.object({
  automation_mode: z.enum(['manual', 'review_queue', 'auto_publish']).optional(),
  auto_publish_min_score: z.number().int().min(0).max(100).optional(),
}).strict().refine((value) => Object.keys(value).length > 0)

type Context = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request)
    const user = await getAuthenticatedUser()
    const { id } = await context.params
    if (!z.uuid().safeParse(id).success) throw new PublishingApiError(404, 'Kanal nicht gefunden.')
    const parsed = Settings.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new PublishingApiError(400, 'Bitte wähle einen gültigen Automatikmodus und einen Mindest-Score zwischen 0 und 100.')
    const account = await updateAccountSettings(user.id, id, parsed.data)
    return Response.json({ account }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return publishingErrorResponse(error) }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request)
    const user = await getAuthenticatedUser()
    const { id } = await context.params
    if (!z.uuid().safeParse(id).success) throw new PublishingApiError(404, 'Kanal nicht gefunden.')
    await disconnectAccount(user.id, id)
    return Response.json({ disconnected: true })
  } catch (error) { return publishingErrorResponse(error) }
}
