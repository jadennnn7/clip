'use client'

import { useState } from 'react'
import { ArrowUpRight, CircleCheck, Clock, LoaderCircle, Send, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PlatformIcon } from '@/components/social/PlatformIcon'
import { changePublishingJob, type PublishingAction } from '@/lib/publishing-client'
import { getPublishingStatus, formatPublishingDate } from '@/lib/publishing-status'
import { PLATFORM_LABEL } from '@/lib/social-labels'
import { cn } from '@/lib/utils'
import type { PublishingJobSummary } from '@/types/publishing'

export type ClipPublishingEmptyState = 'loading' | 'unavailable' | 'none' | 'unlinked'

const ACTION_TOAST: Record<PublishingAction, string> = {
  approve: 'Freigegeben — der Clip wird jetzt gerendert und hochgeladen',
  retry: 'Neuer Versuch gestartet',
  cancel: 'Veröffentlichung verworfen',
}

/**
 * Veröffentlichungsstatus eines Clips, je verbundenem Kanal.
 *
 * Hier sitzt auch die Freigabe: Im Modus „Freigabe-Queue“ geht ein Clip erst
 * nach dem Klick auf „Veröffentlichen“ an die Plattform. Der Knopf steht
 * direkt am Clip statt auf einer eigenen Seite — dort, wo man ihn gerade
 * angesehen hat.
 */
export function ClipPublishingStatus({ jobs, emptyState = 'none', compact = false, onChanged }: {
  jobs: PublishingJobSummary[]
  emptyState?: ClipPublishingEmptyState
  compact?: boolean
  /** Lädt die Queue neu, damit der neue Status nicht erst mit dem nächsten Poll erscheint. */
  onChanged?: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)

  if (!jobs.length) {
    const label = emptyState === 'loading' ? 'Status wird geladen…' : emptyState === 'unavailable' ? 'Veröffentlichungsstatus nicht erreichbar' : emptyState === 'unlinked' ? 'Status in der Queue prüfen' : 'Keine Veröffentlichung eingeplant'
    return <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-zinc-400">{emptyState === 'loading' ? <LoaderCircle className="mt-0.5 size-3 shrink-0 animate-spin" /> : <Clock className="mt-0.5 size-3 shrink-0" />}{label}</p>
  }

  const run = async (job: PublishingJobSummary, action: PublishingAction) => {
    setBusy(`${job.id}:${action}`)
    try {
      await changePublishingJob(job.id, action)
      toast.success(ACTION_TOAST[action], { description: job.account_username ?? (job.platform ? PLATFORM_LABEL[job.platform] : undefined) })
      onChanged?.()
    } catch (cause) {
      toast.error('Das hat nicht geklappt', { description: cause instanceof Error ? cause.message : undefined })
    } finally {
      setBusy(null)
    }
  }

  return (
    <ul className={compact ? 'space-y-2' : 'space-y-3'} aria-label="Veröffentlichungsstatus">
      {jobs.map((job) => {
        const status = getPublishingStatus(job)
        const Icon = job.status === 'published' ? CircleCheck : ['needs_review', 'action_required', 'failed'].includes(job.status) ? TriangleAlert : Clock
        const channel = job.account_username || (job.platform ? PLATFORM_LABEL[job.platform] : 'Verbundener Kanal')
        const pending = busy?.startsWith(`${job.id}:`) ?? false
        return (
          <li key={job.id} className={cn('min-w-0 text-xs', !compact && 'rounded-lg border border-white/10 bg-white/[0.03] p-3')}>
            <span className="mb-1 flex min-w-0 items-center gap-1.5 text-[10px] text-zinc-400">{job.platform ? <PlatformIcon platform={job.platform} className="size-3 shrink-0" /> : null}<span className="truncate">{channel}</span></span>
            <span className={cn('flex items-start gap-1.5 font-medium', status.className)}><Icon className="mt-0.5 size-3 shrink-0" />{status.label}</span>
            {job.status === 'pending' ? <span className="mt-1 block text-[10px] text-zinc-400">{formatPublishingDate(job.next_retry_at ?? job.publish_at)}</span> : null}
            {!compact ? <span className="mt-1.5 block text-xs leading-relaxed text-zinc-400">{status.detail}</span> : null}

            {job.status === 'needs_review' ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Button
                  size="xs"
                  variant="prominent"
                  disabled={pending}
                  onClick={() => run(job, 'approve')}
                  aria-label={`Auf ${channel} veröffentlichen: ${job.title}`}
                >
                  {busy === `${job.id}:approve` ? <LoaderCircle className="animate-spin" /> : <Send />}
                  Veröffentlichen
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(job, 'cancel')}
                  aria-label={`Nicht auf ${channel} veröffentlichen: ${job.title}`}
                  className="text-zinc-400"
                >
                  Verwerfen
                </Button>
              </div>
            ) : null}
            {job.status === 'failed' ? (
              <Button
                size="xs"
                variant="outline"
                disabled={pending}
                onClick={() => run(job, 'retry')}
                className="mt-2"
                aria-label={`Erneut auf ${channel} versuchen: ${job.title}`}
              >
                {busy === `${job.id}:retry` ? <LoaderCircle className="animate-spin" /> : null}
                Erneut versuchen
              </Button>
            ) : null}
            {!compact && job.platform_post_url ? <a href={job.platform_post_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-white underline-offset-4 hover:underline">{job.status === 'published' ? 'Beitrag ansehen' : 'Auf Plattform öffnen'}<ArrowUpRight className="size-3" /></a> : null}
          </li>
        )
      })}
    </ul>
  )
}
