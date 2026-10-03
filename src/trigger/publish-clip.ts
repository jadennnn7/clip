import { schedules, task } from '@trigger.dev/sdk'
import { processPublishingJob } from '@/services/publishing/worker'
import { dispatchDuePublishingJobs } from '@/services/publishing/jobs'
import { isPublishingConfigured } from '@/services/publishing/config'

export const publishClip = task({
  id: 'publish-clip',
  machine: 'large-1x',
  maxDuration: 3600,
  // Database state drives retries. Retrying an entire social mutation blindly
  // could publish twice; providers resume their persisted remote checkpoints.
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 1 },
  run: async ({ jobId }: { jobId: string }, { signal }) => {
    await processPublishingJob(jobId, signal)
  },
})

export const publishingSweep = schedules.task({
  id: 'publishing-sweep',
  cron: '*/5 * * * *',
  maxDuration: 120,
  retry: { maxAttempts: 2 },
  run: async () => isPublishingConfigured() ? { dispatched: await dispatchDuePublishingJobs() } : { dispatched: 0 },
})
