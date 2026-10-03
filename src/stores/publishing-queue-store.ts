'use client'

import { useEffect } from 'react'
import { create } from 'zustand'
import type { PublishingJobSummary } from '@/types/publishing'
import type { ProjectPublishing } from '@/types/workspace'

interface PublishingQueueState {
  /** `null`, solange nichts geladen ist oder Publishing nicht eingerichtet ist. */
  jobs: PublishingJobSummary[] | null
  loading: boolean
}

/**
 * Die Veröffentlichungs-Queue für Zähler und Hinweise in Sidebar, Kopfleiste
 * und Clip-Vorschau — ein gemeinsamer Abruf statt einer eigenen Abfrage pro
 * Stelle. Die Kalenderseite fragt häufiger selbst nach.
 */
export const usePublishingQueue = create<PublishingQueueState>(() => ({ jobs: null, loading: true }))

let pending: Promise<void> | null = null

export function refreshPublishingQueue(): Promise<void> {
  if (pending) return pending
  pending = (async () => {
    try {
      const response = await fetch('/api/publishing', { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
      const data = await response.json().catch(() => null) as { jobs?: PublishingJobSummary[]; configured?: boolean } | null
      // Ohne Anmeldung oder Einrichtung gibt es keine Queue — kein Fehler für die Oberfläche.
      usePublishingQueue.setState({ jobs: response.ok && data?.configured && Array.isArray(data.jobs) ? data.jobs : null })
    } catch {
      // Netzfehler: den letzten Stand behalten.
    } finally {
      usePublishingQueue.setState({ loading: false })
      pending = null
    }
  })()
  return pending
}

/** Einmal im Dashboard eingehängt, auch beim Wechsel zwischen den Seiten. */
export function usePublishingQueueSync() {
  useEffect(() => {
    void refreshPublishingQueue()
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void refreshPublishingQueue()
    }
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    const timer = window.setInterval(refreshVisible, 30_000)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [])
}

/** Aufträge, die noch vor ihrer Veröffentlichung stehen. */
export const OPEN_STATUSES: PublishingJobSummary['status'][] = ['needs_review', 'pending', 'rendering', 'publishing']

/**
 * Die Aufträge eines Clips: über die Clip-ID, die jeder Auftrag im Snapshot
 * trägt, oder — für Clips aus der Zeit vor festen IDs — über die Position des
 * Segments im Ergebnis der Pipeline (`clip_index`), die der Workspace in
 * `clipIds` festhält.
 */
export function jobsForClip(jobs: PublishingJobSummary[], clipId: string, sourceJobId: string | null, publishing: ProjectPublishing | undefined): PublishingJobSummary[] {
  return jobs.filter((job) => job.clip_id === clipId ||
    (Boolean(sourceJobId) && job.source_job_id === sourceJobId && publishing?.clipIds?.[job.clip_index] === clipId))
}
