import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProvider, PublishError, type AccountInfo, type ProviderAccount, type TokenSet } from '@/services/social'
import type { AutomationMode, SocialAccount, SocialPlatform } from '@/types/database'
import { getPublishingCapabilities, tokenEncryptionKey } from './config'
import { PublishingApiError } from './auth'

interface StoredTokens {
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
  refresh_expires_at: string | null
  scopes: string[]
}

function aad(userId: string, platform: SocialPlatform, platformAccountId: string): Buffer {
  return Buffer.from(`${userId}:${platform}:${platformAccountId}`)
}

function encrypt(value: string, context: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', tokenEncryptionKey(), iv)
  cipher.setAAD(context)
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.')
}

function decrypt(value: string, context: Buffer): string {
  const [version, iv, tag, body, extra] = value.split('.')
  if (version !== 'v1' || !iv || !tag || !body || extra) throw new Error('Ungültiges verschlüsseltes Token.')
  const decipher = createDecipheriv('aes-256-gcm', tokenEncryptionKey(), Buffer.from(iv, 'base64url'))
  decipher.setAAD(context)
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
}

export async function listAccounts(userId: string): Promise<SocialAccount[]> {
  const { data, error } = await createAdminClient().from('social_accounts').select('*')
    .eq('user_id', userId).neq('status', 'revoked').order('created_at')
  if (error) {
    if (error.code === 'PGRST205' || /could not find the table|schema cache/i.test(error.message)) {
      throw new PublishingApiError(
        503,
        'Das Datenbankschema fehlt noch. Bitte supabase/schema.sql (oder die Migrationen) in deinem Supabase-Projekt ausführen.',
      )
    }
    throw new PublishingApiError(502, 'Verbundene Kanäle konnten nicht geladen werden.')
  }
  return data as SocialAccount[]
}

export async function saveAccountConnection(userId: string, platform: SocialPlatform, info: AccountInfo, tokens: TokenSet): Promise<SocialAccount> {
  const context = aad(userId, platform, info.platformAccountId)
  const { data, error } = await createAdminClient().rpc('save_social_account_connection', {
    p_user_id: userId,
    p_platform: platform,
    p_platform_account_id: info.platformAccountId,
    p_platform_username: info.username,
    p_avatar_url: info.avatarUrl,
    p_meta_page_id: info.metaPageId ?? null,
    p_meta_ig_user_id: info.metaIgUserId ?? null,
    p_access_token: encrypt(tokens.accessToken, context),
    p_refresh_token: tokens.refreshToken ? encrypt(tokens.refreshToken, context) : null,
    p_token_expires_at: tokens.expiresAt?.toISOString() ?? null,
    p_refresh_expires_at: tokens.refreshExpiresAt?.toISOString() ?? null,
    p_scopes: tokens.scopes,
  })
  if (error || !data) throw new Error('Die Verbindung konnte nicht sicher gespeichert werden.')
  return data as SocialAccount
}

export async function updateAccountSettings(userId: string, accountId: string, settings: {
  automation_mode?: AutomationMode
  auto_publish_min_score?: number
}): Promise<SocialAccount> {
  const db = createAdminClient()
  const { data: existing, error: lookupError } = await db.from('social_accounts').select('*')
    .eq('user_id', userId).eq('id', accountId).neq('status', 'revoked').maybeSingle()
  if (lookupError) throw new Error('Kanal konnte nicht geladen werden.')
  if (!existing) throw new PublishingApiError(404, 'Dieser Kanal wurde nicht gefunden.')
  const capability = getPublishingCapabilities()[existing.platform as SocialPlatform]
  if (settings.automation_mode === 'auto_publish' && (!capability.canAutoPublish || existing.status !== 'active')) {
    throw new PublishingApiError(400, capability.notice ?? 'Dieser Kanal muss erneut verbunden werden, bevor die Automatik startet.')
  }
  const { data, error } = await db.from('social_accounts').update(settings)
    .eq('user_id', userId).eq('id', accountId).neq('status', 'revoked').select('*').single()
  if (error) throw new Error('Kanaleinstellungen konnten nicht gespeichert werden.')
  return data as SocialAccount
}

export async function disconnectAccount(userId: string, accountId: string): Promise<void> {
  const { data, error } = await createAdminClient().rpc('disconnect_social_account', { p_user_id: userId, p_account_id: accountId })
  if (error) throw new Error('Kanal konnte nicht getrennt werden.')
  if (!data) throw new PublishingApiError(404, 'Dieser Kanal wurde nicht gefunden.')
}

/** Tokens are decrypted only in the worker/server, immediately before use. */
export async function getPublishingAccount(userId: string, accountId: string): Promise<{ account: SocialAccount; credentials: ProviderAccount }> {
  const db = createAdminClient()
  const { data, error } = await db.from('social_accounts').select('*').eq('user_id', userId).eq('id', accountId).maybeSingle()
  if (error) throw new PublishError('Kanal konnte nicht geladen werden.', 'retryable')
  const account = data as SocialAccount | null
  if (!account || account.status !== 'active') throw new PublishError('Dieser Kanal ist nicht aktiv. Bitte verbinde ihn erneut.', 'auth')
  const { data: rows, error: tokenError } = await db.rpc('get_social_account_tokens', { p_user_id: userId, p_account_id: accountId })
  const stored = (rows as StoredTokens[] | null)?.[0]
  if (tokenError || !stored) throw new PublishError('Die Verbindung muss erneut autorisiert werden.', 'auth')
  const context = aad(userId, account.platform, account.platform_account_id)
  let accessToken = decrypt(stored.access_token, context)
  const expiresAt = stored.token_expires_at ? Date.parse(stored.token_expires_at) : Infinity
  if (expiresAt < Date.now() + 120_000) {
    if ((stored.refresh_expires_at && Date.parse(stored.refresh_expires_at) <= Date.now()) || !stored.refresh_token) {
      await db.from('social_accounts').update({ status: 'needs_reauth', last_error: 'Die Verbindung ist abgelaufen. Bitte verbinde den Kanal erneut.' }).eq('id', accountId).eq('user_id', userId).eq('status', 'active')
      throw new PublishError('Die Verbindung ist abgelaufen. Bitte verbinde den Kanal erneut.', 'auth')
    }
    const { data: claimed, error: claimError } = await db.rpc('claim_social_token_refresh', {
      p_user_id: userId, p_account_id: accountId, p_expected_access_token: stored.access_token,
    })
    if (claimError || !claimed) throw new PublishError('Die Verbindung wird gerade erneuert. Der Upload wird erneut versucht.', 'retryable')
    try {
      const refreshed = await getProvider(account.platform).refreshToken(decrypt(stored.refresh_token, context))
      await saveRefreshedTokens(userId, account, refreshed, stored)
      accessToken = refreshed.accessToken
    } catch (refreshError) {
      await db.rpc('release_social_token_refresh', { p_user_id: userId, p_account_id: accountId, p_expected_access_token: stored.access_token })
      if (refreshError instanceof PublishError && refreshError.kind === 'auth') {
        await db.from('social_accounts').update({ status: 'needs_reauth', last_error: 'Bitte verbinde den Kanal erneut.' }).eq('id', accountId).eq('user_id', userId).eq('status', 'active')
      }
      throw refreshError
    }
  }
  return { account, credentials: { accessToken, platformAccountId: account.platform_account_id, metaIgUserId: account.meta_ig_user_id } }
}

async function saveRefreshedTokens(userId: string, account: SocialAccount, tokens: TokenSet, previous: StoredTokens): Promise<void> {
  const context = aad(userId, account.platform, account.platform_account_id)
  const { data, error } = await createAdminClient().rpc('store_social_account_tokens', {
    p_user_id: userId,
    p_account_id: account.id,
    p_expected_access_token: previous.access_token,
    p_access_token: encrypt(tokens.accessToken, context),
    p_refresh_token: tokens.refreshToken ? encrypt(tokens.refreshToken, context) : previous.refresh_token,
    p_token_expires_at: tokens.expiresAt?.toISOString() ?? null,
    p_refresh_expires_at: tokens.refreshExpiresAt?.toISOString() ?? previous.refresh_expires_at,
    p_scopes: tokens.scopes.length ? tokens.scopes : previous.scopes,
  })
  if (error || !data) throw new PublishError('Die erneuerte Verbindung konnte nicht gespeichert werden.', 'retryable')
}
