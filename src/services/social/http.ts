import 'server-only'

import { ConnectError, PublishError, classifyHttpStatus, type PublishParams } from './base'

type JsonObject = Record<string, unknown>

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new PublishError(`Server-Konfiguration fehlt: ${name}.`, 'terminal')
  return value
}

export function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject : {}
}

export function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Zählwerte kommen je nach Plattform als Zahl oder als String („1234"). */
export function countField(value: unknown): number | null {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  return typeof number === 'number' && Number.isSafeInteger(number) && number >= 0 ? number : null
}

export function requireString(value: unknown, label: string, mutation = false): string {
  const text = stringField(value)
  if (!text) throw new PublishError(`${label}: unvollständige Plattformantwort.`, mutation ? 'uncertain' : 'retryable')
  return text
}

export function expiresIn(seconds: unknown): Date | undefined {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? new Date(Date.now() + seconds * 1000) : undefined
}

export function grantedScopes(scope: unknown, required: readonly string[]): string[] {
  const scopes = typeof scope === 'string' ? scope.split(/[\s,]+/).filter(Boolean) : []
  const missing = required.filter((permission) => !scopes.includes(permission))
  if (missing.length) {
    throw new ConnectError(`Nicht alle erforderlichen Berechtigungen wurden erteilt (${missing.join(', ')}). Bitte den Kanal erneut verbinden.`, 'missing_permissions')
  }
  return scopes
}

export function authorization(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` }
}

/** Never include provider response bodies/URLs in errors: they may contain tokens. */
export function providerError(status: number, body: unknown, label: string, mutation = false): PublishError {
  const object = asObject(body)
  const error = asObject(object.error)
  const nested = Array.isArray(error.errors) ? asObject(error.errors[0]) : {}
  const code = String(nested.reason ?? error.code ?? object.error ?? '')
  let kind = classifyHttpStatus(status)
  if (/quotaExceeded|dailyLimitExceeded|uploadLimitExceeded|spam_risk_too_many/i.test(code) || ['4', '17', '32', '613'].includes(code)) kind = 'quota'
  else if (/invalid_grant|access_token_invalid|scope_not_authorized|auth_removed|invalid_token|invalid_client/i.test(code) || ['190', '102'].includes(code)) kind = 'auth'
  else if (/rate_limit|userRateLimitExceeded/i.test(code)) kind = 'retryable'
  else if (/internal|backendError/i.test(code) || error.is_transient === true) kind = mutation ? 'uncertain' : 'retryable'
  else if (status < 400) kind = 'terminal'
  // A failed response from a mutating endpoint does not prove it had no effect.
  if (mutation && status >= 500) kind = 'uncertain'
  const safeCode = /^[a-zA-Z0-9_.-]{1,80}$/.test(code) ? ` (${code})` : ''
  return new PublishError(`${label}: Plattformfehler ${status}${safeCode}.`, kind)
}

export async function fetchResponse(url: string, init: RequestInit, label: string, mutation = false): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(90_000) })
  } catch {
    throw new PublishError(`${label}: keine verlässliche Antwort der Plattform.`, mutation ? 'uncertain' : 'retryable')
  }
}

export async function readJson(response: Response, label: string, mutation = false): Promise<JsonObject> {
  let body: unknown
  try { body = await response.json() } catch {
    if (!response.ok) throw providerError(response.status, {}, label, mutation)
    throw new PublishError(`${label}: unlesbare Plattformantwort.`, mutation ? 'uncertain' : 'retryable')
  }
  const result = asObject(body)
  const error = result.error
  if (!response.ok || (error && (typeof error === 'string' || asObject(error).code !== 'ok'))) {
    throw providerError(response.status, result, label, mutation)
  }
  return result
}

export async function jsonRequest(url: string, init: RequestInit, label: string, mutation = false): Promise<JsonObject> {
  return readJson(await fetchResponse(url, init, label, mutation), label, mutation)
}

export const pause = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

/** Unknown is explicit; it must never be represented as a confirmed free quota. */
export function unknownLimit() {
  return { used: 0, quota: 0, remaining: Number.POSITIVE_INFINITY, isKnown: false }
}

export function publicVideoUrl(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { throw new PublishError('Die Video-URL ist ungültig.', 'terminal') }
  if (url.protocol !== 'https:' || url.username || url.password || /^(localhost|127\.|0\.|\[|10\.|192\.168\.|169\.254\.)/i.test(url.hostname)) {
    throw new PublishError('Das Video benötigt eine öffentlich erreichbare HTTPS-URL.', 'terminal')
  }
  return url.toString()
}

export function durableCheckpoint(params: PublishParams) {
  let current = { ...params.checkpoint }
  const save = params.saveCheckpoint
  if (!save) throw new PublishError('Der Veröffentlichungsauftrag hat keinen dauerhaften Checkpoint-Speicher.', 'terminal')
  if (current.job_key && current.job_key !== params.idempotencyKey) {
    throw new PublishError('Der Upload-Checkpoint gehört zu einem anderen Auftrag.', 'terminal')
  }
  return {
    get(key: string) { return current[key] },
    async update(values: Record<string, string>) {
      const next = { ...current, ...values, job_key: params.idempotencyKey }
      try { await save(next) } catch {
        throw new PublishError('Upload-Fortschritt konnte nicht sicher gespeichert werden. Vor einem erneuten Upload den Plattformstatus prüfen.', 'uncertain')
      }
      current = next
    },
  }
}

export type Checkpoint = ReturnType<typeof durableCheckpoint>

/** An intent survives a process crash before the provider response is persisted. */
export async function createRemoteId(checkpoint: Checkpoint, key: string, action: () => Promise<string>): Promise<string> {
  const existing = checkpoint.get(key)
  if (existing) return existing
  const pendingKey = `${key}_pending`
  if (checkpoint.get(pendingKey)) {
    throw new PublishError('Die Plattform könnte den vorherigen Auftrag bereits angenommen haben. Status prüfen; kein automatischer Doppel-Upload.', 'uncertain')
  }
  await checkpoint.update({ [pendingKey]: 'true' })
  let id: string
  try { id = await action() } catch (error) {
    // Explicit API rejection is safe to retry. Network/5xx/lost response is not.
    if (error instanceof PublishError && error.kind !== 'uncertain') await checkpoint.update({ [pendingKey]: '' })
    throw error
  }
  await checkpoint.update({ [key]: id, [pendingKey]: '' })
  return id
}
