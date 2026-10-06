import Image from 'next/image'
import { LOGO } from '@/lib/logo'
import Link from 'next/link'
import { AuthForm, type AuthIntent, type AuthNotice } from '@/components/auth/AuthForm'
import { PublishingFeed } from '@/components/auth/PublishingFeed'
import { StartSteps } from '@/components/auth/StartSteps'
import { LANDING_PLATFORMS, PlatformLogo } from '@/components/landing/PlatformLogo'
import { TRIAL } from '@/lib/stripe/plans'
import { PLATFORM_LABEL } from '@/lib/social-labels'
import { cn } from '@/lib/utils'

export type AuthSearchParams = Record<string, string | string[] | undefined>

const FREE_ALLOWANCE = `${TRIAL.credits} Minuten Video und ${TRIAL.exports} Exporten`

function BrandMark() {
  return (
    <span className="flex items-center gap-2">
      <span className="relative size-8 shrink-0 overflow-hidden">
        <Image
          src={LOGO}
          alt=""
          width={32}
          height={32}
          className="size-8 scale-[1.45] object-contain"
          priority
        />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight">Ocuris</span>
    </span>
  )
}

/** Was die Adresse über den letzten Schritt verrät — abgemeldet, Link abgelaufen, Kanal-Rückweg. */
/**
 * Der Wechsel zwischen Anmelden und Registrieren behält das Ziel — wer von
 * der Partnerseite kommt, landet nach der Registrierung dort und nicht im
 * Dashboard.
 */
function switchHref(path: '/login' | '/signup', params: AuthSearchParams): string {
  const target = typeof params.redirect === 'string' ? params.redirect : null
  return target && target.startsWith('/') && !target.startsWith('//')
    ? `${path}?redirect=${encodeURIComponent(target)}`
    : path
}

function noticeFrom(params: AuthSearchParams): AuthNotice | null {
  const error = typeof params.error === 'string' ? params.error : null
  if (error === 'invalid_link') {
    return {
      tone: 'error',
      title: 'Link ungültig oder abgelaufen',
      text: 'Melde dich mit deinem Passwort an. Hast du es vergessen, fordere über „Passwort vergessen?" einen neuen Link an — es gilt immer nur der zuletzt gesendete.',
    }
  }
  if (error === 'oauth_cancelled') {
    return {
      tone: 'error',
      title: 'Anmeldung mit Google abgebrochen',
      text: 'Versuche es noch einmal oder melde dich mit E-Mail und Passwort an.',
    }
  }
  if (error === 'oauth_failed') {
    return {
      tone: 'error',
      title: 'Anmeldung mit Google fehlgeschlagen',
      text: 'Google hat die Anmeldung nicht bestätigt. Versuche es noch einmal oder melde dich mit E-Mail und Passwort an.',
    }
  }
  if (error === 'oauth_session_expired' || error === 'oauth_origin_mismatch' || error === 'connection_failed') {
    return {
      tone: 'error',
      title: 'Bitte auf dieser Adresse anmelden',
      text: 'Für die Kanalverbindung brauchst du eine Ocuris-Anmeldung auf dieser Webadresse. Öffne den Link im selben Browser und verbinde den Kanal danach erneut.',
    }
  }
  if (error) {
    return { tone: 'error', title: 'Anmeldung fehlgeschlagen', text: 'Bitte versuche es erneut.' }
  }
  if (params.signed_out !== undefined) {
    return {
      tone: 'info',
      title: 'Du bist abgemeldet',
      text: 'Deine Projekte bleiben in diesem Browser für die nächste Anmeldung gespeichert.',
    }
  }
  return null
}

/**
 * Anmelden und Registrieren.
 *
 * Beide Seiten teilen Material und Formular, sehen aber verschieden aus,
 * damit man auf einen Blick weiß, wo man ist:
 *
 * - Anmelden: Bild links, Formular rechts. Das Bild zeigt, was ein Konto
 *   tut — den Veröffentlichungs-Feed.
 * - Registrieren: gespiegelt, Formular links. Das Bild zeigt den Weg zum
 *   ersten Clip und die Gratis-Stufe; das Formular fragt auch nach dem Namen.
 *
 * Bewusst nicht die Animation der Startseite: Wer von dort kommt, soll hier
 * etwas Neues sehen. Keine Kennzahlen, die niemand nachprüfen kann.
 *
 * Immer dunkel wie die Startseite, von der man hierher kommt: Ein Wechsel
 * auf Weiß beim Klick auf „Anmelden" las sich wie eine fremde Seite.
 */
export function AuthSplitPage({ intent, searchParams }: { intent: AuthIntent; searchParams: AuthSearchParams }) {
  const isSignup = intent === 'signup'

  const visual = (
    <aside className="hidden p-3 lg:block">
      <div className="glass-tile relative flex h-full min-h-[40rem] flex-col overflow-hidden rounded-[1.75rem] p-10 xl:p-12">
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 h-2/3',
            isSignup
              ? 'bottom-0 bg-[radial-gradient(70%_60%_at_50%_100%,rgb(255_255_255/0.08),transparent)]'
              : 'top-0 bg-[radial-gradient(70%_60%_at_50%_0%,rgb(255_255_255/0.08),transparent)]',
          )}
        />

        {isSignup ? (
          // Die Aussage steht hier oben, nicht unten wie beim Anmelden —
          // auch das unterscheidet die beiden Seiten.
          <div className="relative max-w-md">
            <p className="font-display text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.03em] text-balance">
              In drei Schritten zum ersten Clip.
            </p>
            <p className="mt-2.5 text-[15px] leading-6 text-pretty text-white/55">
              Kostenlos testen. Ein Tarif lohnt sich erst, wenn du regelmäßig
              Videos verarbeitest.
            </p>
          </div>
        ) : (
          <Link
            href="/"
            aria-label="Zur Startseite"
            className="relative self-start rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <BrandMark />
          </Link>
        )}

        <div className={cn('relative flex flex-1 items-center justify-center', isSignup ? 'pt-8' : 'py-6')}>
          {isSignup ? (
            <StartSteps className="w-full max-w-[26rem]" />
          ) : (
            <PublishingFeed className="w-full max-w-[26rem]" />
          )}
        </div>

        {isSignup ? null : (
          <div className="relative max-w-md">
            <p className="font-display text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.03em] text-balance">
              Deine Clips gehen raus, während du das nächste Video drehst.
            </p>
            <p className="mt-3 text-[15px] leading-6 text-pretty text-white/55">
              Ocuris verteilt deine Clips über die Woche und veröffentlicht sie —
              oder legt sie dir vorher zur Freigabe vor.
            </p>
            <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-white/60">
              {LANDING_PLATFORMS.map((platform) => (
                <li key={platform} className="flex items-center gap-2">
                  <PlatformLogo platform={platform} className="size-4 text-white/80" />
                  {PLATFORM_LABEL[platform]}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  )

  const form = (
    <section className="flex min-h-dvh flex-col px-6 py-6 sm:px-10 lg:py-8">
      <header className="flex items-center justify-between gap-4">
        {/* Beim Anmelden steht die Marke schon im Bild links. */}
        <Link
          href="/"
          aria-label="Zur Startseite"
          className={cn(
            'rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/50',
            !isSignup && 'lg:invisible',
          )}
        >
          <BrandMark />
        </Link>
        <p className="text-sm text-white/55">
          {isSignup ? 'Schon registriert?' : 'Noch kein Konto?'}{' '}
          <Link
            href={switchHref(isSignup ? '/login' : '/signup', searchParams)}
            className="rounded-sm font-medium text-white underline decoration-white/30 underline-offset-4 outline-none transition-colors hover:decoration-white focus-visible:ring-2 focus-visible:ring-white/50"
          >
            {isSignup ? 'Anmelden' : 'Registrieren'}
          </Link>
        </p>
      </header>

      <div className="flex flex-1 items-center justify-center py-12">
        <AuthForm intent={intent} notice={noticeFrom(searchParams)} freeAllowance={FREE_ALLOWANCE} />
      </div>

      <footer className="text-center text-xs text-white/40">
        © {new Date().getFullYear()} Ocuris · Verarbeite nur Videos, an denen du die Rechte hältst.
        <span className="mt-2 flex justify-center gap-4">
          <Link href="/impressum" className="rounded-sm underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-white/50">Impressum</Link>
          <Link href="/datenschutz" className="rounded-sm underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-white/50">Datenschutz</Link>
        </span>
      </footer>
    </section>
  )

  return (
    <main
      className={cn(
        'auth-root dark ambient grid min-h-dvh bg-none text-white [color-scheme:dark]',
        isSignup ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]' : 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]',
      )}
    >
      {isSignup ? (
        <>
          {form}
          {visual}
        </>
      ) : (
        <>
          {visual}
          {form}
        </>
      )}
    </main>
  )
}
