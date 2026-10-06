'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PublishingCalendar } from '@/components/publishing/PublishingCalendar'
import { PublishingNotice } from '@/components/publishing/PublishingNotice'
import { changePublishingJob, usePublishingJobs, type PublishingAction, type PublishingJobSummary } from '@/lib/publishing-client'
import { refreshPublishingQueue } from '@/stores/publishing-queue-store'
import { useWorkspaceStore } from '@/stores/workspace-store'

/**
 * Kalender der Veröffentlichungen. Die Seite lädt die Aufträge und führt die
 * Aktionen aus; Woche, Queue und Verlauf zeichnet `PublishingCalendar`.
 */
export default function CalendarPage() {
  const { data, error, loading, refresh } = usePublishingJobs()
  const clips = useWorkspaceStore((state) => state.clips)
  const [busy, setBusy] = useState<string | null>(null)

  const run = async (entries: PublishingJobSummary[], action: PublishingAction, key: string) => {
    setBusy(key)
    try {
      // Nacheinander: Jede Freigabe stößt einen Render an.
      for (const job of entries) await changePublishingJob(job.id, action)
      if (action === 'approve') toast.success(entries.length === 1 ? 'Freigegeben — der Clip wird jetzt veröffentlicht' : `${entries.length} Clips freigegeben`)
    } catch (cause) {
      toast.error('Aktion fehlgeschlagen', { description: cause instanceof Error ? cause.message : undefined })
    } finally {
      setBusy(null)
      refresh()
      void refreshPublishingQueue()
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <PublishingCalendar
          jobs={data?.jobs ?? []}
          clips={clips}
          loading={loading}
          ready={!error && data?.configured !== false}
          notice={<PublishingNotice error={error} configured={data?.configured} detail={data?.error} onRetry={refresh} />}
          busy={busy}
          onRun={(entries, action, key) => { void run(entries, action, key) }}
        />
      </div>
    </ScrollArea>
  )
}
