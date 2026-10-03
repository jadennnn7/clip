'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AutomationMode, SocialAccount, SocialPlatform } from '@/types/database'
import type { PublishingJobSummary } from '@/types/publishing'

export type { PublishingJobSummary } from '@/types/publishing'

export interface PlatformCapability {
  configured: boolean
  canAutoPublish: boolean
  notice: string | null
}

export interface SocialAccountsResponse {
  accounts: SocialAccount[]
  capabilities: Record<SocialPlatform, PlatformCapability>
  configured?: boolean
  /** Kanäle, die der Tarif umfasst; fehlt, solange Publishing nicht eingerichtet ist. */
  channelLimit?: number
  error?: string
}

/** Wie der Server: Beliefert werden die zuerst verbundenen Kanäle bis zum Limit. */
export function accountsInPlan(accounts: SocialAccount[], limit: number | undefined): Set<string> {
  const sorted = [...accounts].filter((account) => account.status !== 'revoked')
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  return new Set((limit === undefined ? sorted : sorted.slice(0, limit)).map((account) => account.id))
}

export interface PublishingResponse {
  jobs: PublishingJobSummary[]
  configured: boolean
  error?: string
}

export class PublishingRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'PublishingRequestError'
  }
}

function isAbortError(cause: unknown): boolean {
  return (
    (cause instanceof DOMException && cause.name === 'AbortError') ||
    (cause instanceof Error && cause.name === 'AbortError')
  )
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) {
    const fallback = response.status === 401
      ? 'Melde dich an, um deine Kanäle und Veröffentlichungen zu verwalten.'
      : 'Die Anfrage konnte nicht abgeschlossen werden. Bitte versuche es erneut.'
    throw new PublishingRequestError(typeof data?.error === 'string' ? data.error : fallback, response.status)
  }
  return data as T
}

/** Refreshes only visible pages; aborts both navigation and superseded requests. `null` skips the request. */
function usePublishingResource<T>(url: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    if (!url) return
    const target = url
    let stopped = false
    let controller: AbortController | undefined
    let timer: ReturnType<typeof setTimeout> | undefined

    function cancelInFlight() {
      const active = controller
      controller = undefined
      // Ohne Reason wirft manches Tooling „signal is aborted without reason“
      // als Runtime-Error — absichtlicher Cancel braucht einen eigenen Grund.
      active?.abort('superseded')
    }

    async function load() {
      if (stopped || document.visibilityState === 'hidden') return
      cancelInFlight()
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      const nextController = new AbortController()
      controller = nextController
      const { signal } = nextController
      try {
        const next = await request<T>(target, { signal })
        if (stopped || signal.aborted || controller !== nextController) return
        setData(next)
        setError(null)
      } catch (cause) {
        if (stopped || signal.aborted || controller !== nextController || isAbortError(cause)) return
        setError(cause instanceof Error ? cause : new Error('Verbindung fehlgeschlagen.'))
      } finally {
        if (stopped || signal.aborted || controller !== nextController) return
        setLoading(false)
        setResolvedUrl(target)
        if (pollMs && document.visibilityState === 'visible') {
          timer = setTimeout(() => {
            void load()
          }, pollMs)
        }
      }
    }

    function visibilityChanged() {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      cancelInFlight()
      if (document.visibilityState === 'visible') void load()
    }

    void load()
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      stopped = true
      cancelInFlight()
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [url, pollMs, revision])

  if (!url) return { data: null, error: null, loading: false, refresh, setData }
  // A source change must never briefly show the previous project's posts.
  const hasCurrentResource = resolvedUrl === url
  return { data: hasCurrentResource ? data : null, error: hasCurrentResource ? error : null, loading: loading || !hasCurrentResource, refresh, setData }
}

export function useSocialAccounts() {
  return usePublishingResource<SocialAccountsResponse>('/api/social/accounts')
}

/** Without an id: all recent jobs. `null`: nothing to load (no cloud run queued any). */
export function usePublishingJobs(sourceJobId?: string | null) {
  const query = sourceJobId ? `?source_job_id=${encodeURIComponent(sourceJobId)}` : ''
  return usePublishingResource<PublishingResponse>(sourceJobId === null ? null : `/api/publishing${query}`, 5000)
}

export async function updateSocialAccount(id: string, settings: {
  automation_mode: AutomationMode
  auto_publish_min_score: number
}): Promise<SocialAccount> {
  const result = await request<{ account: SocialAccount }>(`/api/social/accounts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  return result.account
}

export async function disconnectSocialAccount(id: string): Promise<void> {
  await request(`/api/social/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export type PublishingAction = 'approve' | 'retry' | 'cancel'

export async function changePublishingJob(id: string, action: PublishingAction): Promise<void> {
  await request(`/api/publishing/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
}
