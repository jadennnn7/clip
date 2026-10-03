'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AnalyticsResponse } from '@/types/analytics'

export type { AnalyticsResponse, ChannelAnalytics, PostAnalytics, QueueCount } from '@/types/analytics'

/**
 * Lädt `/api/analytics`. Beim Aktualisieren bleiben die alten Zahlen stehen,
 * bis die neuen da sind — kein Skelett, kein Springen. Jede Aktualisierung
 * nach dem ersten Laden umgeht den Server-Cache.
 */
export function useAnalytics() {
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch(`/api/analytics${revision > 0 ? '?fresh=1' : ''}`, { cache: 'no-store', signal: controller.signal })
        const body = await response.json().catch(() => null)
        if (controller.signal.aborted) return
        if (!response.ok || !body) {
          setError(typeof body?.error === 'string' ? body.error : 'Die Kennzahlen konnten nicht geladen werden.')
        } else {
          setData(body as AnalyticsResponse)
          setError(null)
        }
      } catch {
        if (controller.signal.aborted) return
        setError('Keine Verbindung zum Server. Bitte versuche es erneut.')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    void load()
    return () => controller.abort('superseded')
  }, [revision])

  const refresh = useCallback(() => {
    setRefreshing(true)
    setRevision((value) => value + 1)
  }, [])

  return { data, error, loading, refreshing, refresh }
}
