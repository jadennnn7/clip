'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ErrorState } from '@/components/errors/ErrorState'
import { Button, buttonVariants } from '@/components/ui/button'
import { reportError } from '@/lib/report-error'

/**
 * Fehler auf einer Dashboard-Seite. Liegt unter dem Dashboard-Layout, damit
 * Sidebar und Kopfleiste stehen bleiben und man woandershin weiterkann.
 */
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { reportError(error) }, [error])
  return (
    <ErrorState
      code="Fehler"
      title="Diese Ansicht konnte nicht geladen werden"
      description="Deine Projekte sind davon nicht betroffen. Versuch es noch einmal oder wechsle über die Navigation auf eine andere Seite."
      digest={error.digest}
      actions={
        <>
          <Button onClick={() => retry()}>Erneut versuchen</Button>
          <Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>Zur Übersicht</Link>
        </>
      }
    />
  )
}
