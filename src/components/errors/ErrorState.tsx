import type { ReactNode } from 'react'
import Link from 'next/link'
import { BrandMark } from '@/components/landing/BrandMark'
import { cn } from '@/lib/utils'

/**
 * Gemeinsame Fläche für „Seite nicht gefunden“ und Fehler: Kennung, Titel,
 * ein Satz, was jetzt zu tun ist, und die Wege zurück. `page` füllt das
 * Fenster und zeigt die Marke; im Dashboard bleibt die Navigation stehen, dort
 * füllt es nur den Inhaltsbereich.
 */
export function ErrorState({ code, title, description, digest, actions, page = false }: {
  code: string
  title: string
  description: string
  /** Kennung eines Serverfehlers — damit der Support ihn in den Logs findet. */
  digest?: string
  actions: ReactNode
  page?: boolean
}) {
  return (
    <main className={cn('flex flex-col items-center justify-center px-4 py-16 text-center', page ? 'min-h-dvh bg-background text-foreground' : 'h-full')}>
      {page ? (
        <Link href="/" aria-label="Zur Startseite" className="mb-12 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandMark />
        </Link>
      ) : null}
      <p className="font-mono text-sm font-medium text-primary tabular-nums">{code}</p>
      <h1 className="mt-3 max-w-md font-display text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-pretty text-muted-foreground">{description}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{actions}</div>
      {digest ? <p className="mt-8 font-mono text-[11px] text-muted-foreground/70">Fehler-ID {digest}</p> : null}
    </main>
  )
}
