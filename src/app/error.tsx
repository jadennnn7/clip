'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ErrorState } from '@/components/errors/ErrorState'
import { Button, buttonVariants } from '@/components/ui/button'
import { reportError } from '@/lib/report-error'

/** Unerwarteter Fehler auf einer Seite außerhalb des Dashboards. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { reportError(error) }, [error])
  return (
    <ErrorState
      page
      code="Fehler"
      title="Hier ist etwas schiefgegangen"
      description="Die Seite konnte nicht geladen werden. Versuch es noch einmal — bleibt der Fehler, nenne dem Support die Fehler-ID."
      digest={error.digest}
      actions={
        <>
          <Button onClick={() => retry()}>Erneut versuchen</Button>
          <Link href="/" className={buttonVariants({ variant: 'outline' })}>Zur Startseite</Link>
        </>
      }
    />
  )
}
