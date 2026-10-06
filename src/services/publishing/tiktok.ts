import 'server-only'

import type { TikTokPostOptions } from '@/types/tiktok'
import { getTikTokCreatorInfo, validateTikTokPost } from '@/services/social/tiktok'
import { PublishError } from '@/services/social/base'
import { getPublishingAccount } from './accounts'
import { PublishingApiError } from './auth'

export async function readTikTokCreator(userId: string, accountId: string) {
  try {
    const { account, credentials } = await getPublishingAccount(userId, accountId)
    if (account.platform !== 'tiktok') throw new PublishingApiError(404, 'TikTok-Kanal nicht gefunden.')
    return await getTikTokCreatorInfo(credentials)
  } catch (error) {
    if (error instanceof PublishingApiError) throw error
    throw new PublishingApiError(error instanceof PublishError && error.kind === 'retryable' ? 503 : 409,
      error instanceof PublishError ? error.message : 'TikTok-Veröffentlichungsoptionen konnten nicht geladen werden.')
  }
}

export async function checkTikTokPost(userId: string, accountId: string, options: TikTokPostOptions, durationSeconds: number) {
  const creator = await readTikTokCreator(userId, accountId)
  try { validateTikTokPost(options, creator, durationSeconds) }
  catch (error) { throw new PublishingApiError(400, error instanceof PublishError ? error.message : 'Ungültige TikTok-Veröffentlichung.') }
}
