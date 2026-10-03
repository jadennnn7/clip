import Link from 'next/link'
import { LogIn, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PublishingRequestError } from '@/lib/publishing-client'

export function PublishingNotice({ error, configured, detail, onRetry }: {
  error: Error | null
  configured?: boolean
  detail?: string
  onRetry: () => void
}) {
  if (!error && configured !== false) return null
  const loginRequired = error instanceof PublishingRequestError && error.status === 401
  const setupRequired = configured === false || (error instanceof PublishingRequestError && error.status === 503)

  return (
    <div role="alert" className="mb-6 flex flex-wrap items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-medium">{loginRequired ? 'Anmeldung erforderlich' : setupRequired ? 'Publishing noch nicht eingerichtet' : 'Aktualisierung fehlgeschlagen'}</h2>
        <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">{error?.message ?? detail ?? 'Die Cloud-Verbindung für Kanäle, Rendering und Veröffentlichungen muss zuerst eingerichtet werden.'}</p>
        {loginRequired ? (
          <Button className="mt-3" size="sm" nativeButton={false} render={<Link href="/login" />}><LogIn className="size-3.5" />Anmelden</Button>
        ) : <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>Erneut prüfen</Button>}
      </div>
    </div>
  )
}
