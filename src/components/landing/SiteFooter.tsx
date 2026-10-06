import Link from 'next/link'
import { BrandMark } from '@/components/landing/BrandMark'

/** Fußzeile der öffentlichen Seiten: Marke, Links, Rechtliches. */
export function SiteFooter({
  links,
}: {
  /** Links der Fußzeile — auf der Landingpage ihre Abschnitte, sonst Seiten. */
  links: ReadonlyArray<{ href: string; label: string }>
}) {
  return (
    <footer className="px-4 pt-8 pb-10 sm:px-6">
      <div className="mx-auto w-full max-w-6xl">
        {/* Eine Lichtnaht statt einer Rahmenlinie — dasselbe Detail wie die
            Oberkanten der Glasflächen. */}
        <div
          aria-hidden
          className="h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
        />

        <div className="flex flex-col gap-8 pt-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <Link
              href="/"
              className="-ml-1 inline-flex rounded-full py-1 pr-2 pl-1 outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <BrandMark />
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-white/55">
              Du fügst einen Link ein. Ocuris bewertet jeden Moment und
              veröffentlicht die besten Clips — vollautomatisch.
            </p>
          </div>

          <nav aria-label="Fußzeile">
            <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
              {[...links, { href: '/login', label: 'Anmelden' }].map(
                (link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded-sm text-white/60 outline-none transition-ui hover:text-white focus-visible:ring-2 focus-visible:ring-white/50"
                    >
                      {link.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-2 text-xs text-white/55 sm:flex-row sm:justify-between">
          <p>Verarbeite nur Videos, an denen du die Rechte hältst.</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/impressum" className="rounded-sm underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-white/50">
              Impressum
            </Link>
            <Link href="/datenschutz" className="rounded-sm underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-white/50">
              Datenschutz
            </Link>
            <span>© {new Date().getFullYear()} Ocuris</span>
            <Link href="/agb" className="rounded-sm underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-white/50">
              Nutzungsbedingungen
            </Link>
          </p>
        </div>
      </div>
    </footer>
  )
}

/* ========================================================================== */
