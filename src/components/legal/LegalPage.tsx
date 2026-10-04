import type { ReactNode } from 'react'
import Link from 'next/link'
import { BrandMark } from '@/components/landing/BrandMark'

import { cn } from '@/lib/utils'

/** Die Rechtsseiten untereinander — auf jeder steht der Weg zu den anderen. */
const LEGAL_LINKS = [
  { href: '/impressum', label: 'Impressum' },
  { href: '/datenschutz', label: 'Datenschutz' },
  { href: '/konto-loeschen', label: 'Konto löschen' },
]

/**
 * Rahmen für Impressum und Datenschutzerklärung: dieselbe ruhige Spalte wie
 * `/konto-loeschen`, Marke oben als Weg zurück, die Rechtsseiten unten.
 */
export function LegalPage({
  title,
  intro,
  containerClassName,
  children,
}: {
  title: string
  intro?: ReactNode
  containerClassName?: string
  children: ReactNode
}) {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className={cn("mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16", containerClassName)}>
        <Link href="/" aria-label="Zur Startseite" className="-ml-1 inline-flex rounded-full py-1 pr-2 pl-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandMark />
        </Link>

        <h1 className="mt-10 font-display text-3xl font-semibold tracking-tight text-balance">{title}</h1>
        {intro ? (
          <div className="mt-3 text-base leading-relaxed text-pretty text-muted-foreground">{intro}</div>
        ) : null}

        {children}

        <nav aria-label="Rechtliches" className="mt-14 border-t border-foreground/10 pt-6">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/" className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                Zur Startseite
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </main>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10 border-t border-foreground/10 pt-8">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-pretty [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:no-underline [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  )
}
