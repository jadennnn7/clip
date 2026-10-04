import type { Metadata } from 'next'
import Link from 'next/link'
import { ErrorState } from '@/components/errors/ErrorState'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Seite nicht gefunden — Ocuris',
  robots: { index: false },
}

export default function NotFound() {
  return (
    <ErrorState
      page
      code="404"
      title="Diese Seite gibt es nicht"
      description="Der Link ist veraltet oder vertippt. Deine Projekte und Clips findest du in der Übersicht."
      actions={
        <>
          <Link href="/dashboard" className={buttonVariants({ variant: 'default' })}>Zur Übersicht</Link>
          <Link href="/" className={buttonVariants({ variant: 'outline' })}>Zur Startseite</Link>
        </>
      }
    />
  )
}
