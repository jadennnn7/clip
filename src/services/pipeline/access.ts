import 'server-only'

import { readPipeline } from './index'
import { getAuthenticatedUser, PublishingApiError } from '@/services/publishing/auth'

/** Run IDs are identifiers, never authorization to another user's source. */
export async function readOwnedPipeline(id: string) {
  const job = await readPipeline(id)
  if (!job) throw new PublishingApiError(404, 'Job nicht gefunden.')
  if (job.userId || (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    const user = await getAuthenticatedUser()
    if (job.userId !== user.id) throw new PublishingApiError(404, 'Job nicht gefunden.')
  }
  return job
}
