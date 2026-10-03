import type { PublishingJobSummary } from '@/types/publishing'

export function formatPublishingDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Zeitpunkt noch offen'
  return date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Labels describe confirmed server state; an accepted upload is not necessarily public. */
export function getPublishingStatus(job: PublishingJobSummary): { label: string; detail: string; className: string } {
  switch (job.status) {
    case 'needs_review':
      return {
        label: 'Wartet auf Freigabe',
        detail: job.last_error ?? 'Erst nach deinem Klick auf „Veröffentlichen" wird dieser Clip hochgeladen.',
        className: 'text-amber-700 dark:text-amber-400',
      }
    case 'pending':
      return {
        label: job.next_retry_at ? 'Wird erneut versucht' : 'Eingeplant',
        detail: job.next_retry_at ? `Nächster automatischer Versuch: ${formatPublishingDate(job.next_retry_at)}.` : `Zur Veröffentlichung eingeplant: ${formatPublishingDate(job.publish_at)}.`,
        className: 'text-blue-700 dark:text-blue-400',
      }
    case 'rendering':
      return {
        label: 'Video wird vorbereitet',
        detail: 'Clyp rendert den Clip für deinen Kanal. Anschließend folgt der Upload.',
        className: 'text-blue-700 dark:text-blue-400',
      }
    case 'publishing':
      return { label: 'Wird veröffentlicht', detail: 'Der Upload oder die Verarbeitung auf der Plattform läuft. Die öffentliche Veröffentlichung ist noch nicht bestätigt.', className: 'text-blue-700 dark:text-blue-400' }
    case 'published':
      return { label: 'Veröffentlicht', detail: 'Die Plattform hat die Veröffentlichung bestätigt.', className: 'text-emerald-700 dark:text-emerald-400' }
    case 'action_required':
      return {
        label: job.platform === 'youtube' && job.last_error?.includes('nicht öffentlich') ? 'Noch nicht öffentlich' : 'Auf Plattform prüfen',
        detail: job.last_error ?? 'Die öffentliche Veröffentlichung ist nicht bestätigt. Prüfe den vorhandenen Upload direkt auf der Plattform.',
        className: 'text-amber-700 dark:text-amber-400',
      }
    case 'failed':
      return { label: 'Fehlgeschlagen', detail: job.last_error ?? 'Der Clip konnte nicht veröffentlicht werden. Prüfe den Kanal und starte einen neuen Versuch.', className: 'text-destructive' }
    case 'cancelled':
      return { label: 'Abgebrochen', detail: 'Dieser Auftrag wird nicht veröffentlicht.', className: 'text-muted-foreground' }
  }
}
