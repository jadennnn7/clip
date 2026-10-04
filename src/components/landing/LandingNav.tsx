'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { BrandMark } from '@/components/landing/BrandMark'
import { AnimatedNav } from '@/components/ui/animated-nav'
import { ChapterScrubber } from '@/components/landing/ChapterScrubber'
import { createClient } from '@/lib/supabase/client'

/** Ab dieser Scroll-Distanz gilt die Navbar als „vom Hero gelöst". */
const THRESHOLD = 24

function subscribe(onChange: () => void) {
  window.addEventListener('scroll', onChange, { passive: true })
  return () => window.removeEventListener('scroll', onChange)
}

/**
 * Bewusst ein Boolean statt der Scroll-Position: `useSyncExternalStore`
 * rendert bei jeder Änderung des Snapshots neu — mit einer Pixelzahl wäre
 * das jedes einzelne Scroll-Event, mit dem Schwellwert genau zweimal.
 */
function getSnapshot() {
  return window.scrollY > THRESHOLD
}

function getServerSnapshot() {
  return false
}

/**
 * Ob jemand angemeldet ist. Gelesen wird im Browser aus dem Session-Cookie,
 * ohne Anfrage an Supabase — so bleibt die Landing-Page statisch, und die
 * Navbar zeigt Angemeldeten gleich nach dem Laden den Weg ins Dashboard.
 */
function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => {
    // Ohne Supabase (Entwicklung auf Mock-Daten) gibt es keine Session.
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return
    // Meldet beim Abonnieren sofort den aktuellen Stand, danach jede An- und Abmeldung.
    const { data } = createClient().auth.onAuthStateChange((_event, session) => setSignedIn(session !== null))
    return () => data.subscription.unsubscribe()
  }, [])
  return signedIn
}

// Ab 60rem mehr Luft zwischen den Links; darunter muss „Zum Dashboard" noch
// neben die Pille passen.
const LINK_CLASSES =
  'rounded-full px-3 py-2 text-[0.8rem] text-white/70 outline-none transition-ui hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50 min-[60rem]:px-4'

/**
 * Hero-Navbar: eine schwebende Glas-Pille, die beim Scrollen unverändert
 * stehen bleibt — Marke und Kapitel-Links. Rechts außen, außerhalb der
 * Pille: Anmelden und Loslegen, für Angemeldete stattdessen „Zum Dashboard".
 */
export function LandingNav({
  links,
}: {
  /** In Seitenreihenfolge — wer die Leiste liest, liest das Inhaltsverzeichnis. */
  links: ReadonlyArray<{ href: string; label: string }>
}) {
  const scrolled = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )
  const signedIn = useSignedIn()

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 text-white">
      {/* Drei Spalten: Die Pille bleibt mittig, solange rechts Platz ist, und
          weicht erst nach links, wenn die Konto-Aktionen sonst in sie liefen. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pt-4">
        <AnimatedNav className="glass pointer-events-auto col-start-2 h-13 max-w-full px-2 py-1.5">
          <Link
            href="/"
            className="flex shrink-0 rounded-full py-0.5 pr-4 pl-1.5 outline-none focus-visible:ring-2 focus-visible:ring-white/50 min-[60rem]:pr-6"
          >
            <BrandMark eager large />
          </Link>

          <div className="hidden items-center gap-1 md:flex min-[60rem]:gap-1.5">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={LINK_CLASSES}>
                {link.label}
              </Link>
            ))}
          </div>
        </AnimatedNav>

        {/* Konto-Aktionen rechts außen, nicht in der Pille: Die Pille ist das
            Inhaltsverzeichnis der Seite, Anmelden und Loslegen führen aus ihr
            hinaus. Dieselbe Stelle wie „Zum Dashboard" für Angemeldete. */}
        {!signedIn && (
          <div className="pointer-events-auto col-start-3 flex items-center gap-1 justify-self-end">
            <Link href="/dashboard" className={`${LINK_CLASSES} hidden sm:block`}>
              Anmelden
            </Link>

            {/* Derselbe blaue Tropfen wie „Gratis starten" im Hero. */}
            <Link
              href="/dashboard"
              className="liquid liquid-brand group flex h-10 shrink-0 items-center gap-1.5 rounded-full pr-3.5 pl-4 text-[0.8125rem] font-semibold whitespace-nowrap outline-none transition-ui hover:brightness-[1.06] focus-visible:ring-2 focus-visible:ring-white/60"
            >
              Loslegen
              <ArrowRight
                aria-hidden
                className="size-3.5 transition-transform duration-300 ease-(--ease-out-quint) group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        )}

        {/* Nur Schrift und Pfeil; der Rahmen kommt erst beim Hovern. Erscheint, sobald
            die Session gelesen ist — darum leise eingeblendet. */}
        {signedIn && (
          <Link
            href="/dashboard"
            className="group pointer-events-auto col-start-3 flex h-10 items-center gap-1.5 justify-self-end rounded-full border border-transparent pr-3.5 pl-4 text-[0.8125rem] font-semibold whitespace-nowrap text-white outline-none transition-ui animate-in fade-in hover:border-white/35 focus-visible:ring-2 focus-visible:ring-white/50"
          >
            Zum Dashboard
            <ArrowRight
              aria-hidden
              className="size-3.5 transition-transform duration-300 ease-(--ease-out-quint) group-hover:translate-x-0.5"
            />
          </Link>
        )}
      </div>

      {/* Lesefortschritt als Video-Timeline an der Oberkante des Fensters:
          Die Seite ist das lange Video aus dem Hero, ihre Abschnitte sind
          die Kapitel. Nach der Pille im DOM, damit die Zeitanzeige über ihr liegt. */}
      <ChapterScrubber visible={scrolled} />
    </header>
  )
}
