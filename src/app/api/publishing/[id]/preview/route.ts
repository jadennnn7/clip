import { createAdminClient } from '@/lib/supabase/admin'
import { getDownloadUrl } from '@/lib/storage/r2'
import { getAuthenticatedUser, PublishingApiError, publishingErrorResponse } from '@/services/publishing/auth'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser()
    const { id } = await params
    const { data, error } = await createAdminClient().from('publishing_jobs').select('render_key').eq('id', id).eq('user_id', user.id).maybeSingle()
    if (error || !data?.render_key) throw new PublishingApiError(404, 'Die Videovorschau ist noch nicht fertig.')
    return new Response(null, { status: 302, headers: { Location: await getDownloadUrl(data.render_key, 3600), 'Cache-Control': 'private, no-store' } })
  } catch (error) { return publishingErrorResponse(error) }
}
