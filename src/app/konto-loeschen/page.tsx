import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { BrandMark } from '@/components/landing/BrandMark'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Konto und Daten löschen — Clyp',
  description: 'So löschst du dein Clyp-Konto mit allen Daten — und so trennst du Instagram, YouTube oder TikTok.',
}

/**
 * Anleitung zur Datenlöschung, öffentlich erreichbar.
 *
 * Meta verlangt für Apps mit Facebook Login eine solche URL
 * („Data Deletion Instructions URL“ im App-Dashboard), und nach der
 * DSGVO muss man erfahren können, wie man sein Konto loswird, ohne erst zu
 * suchen. Nach einer Löschung landet man mit `?geloescht` hier und sieht
 * die Bestätigung über der Anleitung.
 */
export default async function DeleteAccountInfoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deleted = (await searchParams).geloescht !== undefined

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <Link href="/" aria-label="Zur Startseite" className="-ml-1 inline-flex rounded-full py-1 pr-2 pl-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandMark />
        </Link>

        {deleted ? (
          <div role="status" className="mt-10 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10">
            <p className="font-medium">Dein Konto ist gelöscht.</p>
            <p className="mt-1 text-pretty text-muted-foreground">
              Alle Daten dazu sind entfernt, und ein laufendes Abo ist beendet. Danke, dass du Clyp ausprobiert hast.
            </p>
          </div>
        ) : null}

        <h1 className="mt-10 font-display text-3xl font-semibold tracking-tight text-balance">Konto und Daten löschen</h1>
        <p className="mt-3 text-base leading-relaxed text-pretty text-muted-foreground">
          Du kannst dein Clyp-Konto jederzeit selbst löschen. Wir entfernen dann sofort und endgültig alle Daten, die wir
          zu dir gespeichert haben.
        </p>

        <Section title="So löschst du dein Konto">
          <ol className="list-decimal space-y-2 pl-5">
            <li>Melde dich bei Clyp an.</li>
            <li>Öffne in der Seitenleiste „Konto & Daten“ — oder unten links dein Profil und dort „Konto & Daten“.</li>
            <li>Wähle „Konto löschen“ und bestätige mit deiner E-Mail-Adresse.</li>
          </ol>
          {deleted ? null : (
            <Link href="/dashboard/account" className={buttonVariants({ variant: 'outline', className: 'mt-5' })}>
              Zu „Konto & Daten“
            </Link>
          )}
        </Section>

        <Section title="Was gelöscht wird">
          <ul className="list-disc space-y-2 pl-5">
            <li>Dein Konto und dein Profil: Name, E-Mail-Adresse, Profilbild.</li>
            <li>Alle Videos, Transkripte, Clips, Renders und Brand-Kits — auch die Dateien auf unseren Servern.</li>
            <li>
              Verbundene Kanäle auf YouTube, Instagram und TikTok mit ihren Zugangsdaten sowie alle geplanten und
              vergangenen Veröffentlichungsaufträge.
            </li>
            <li>Guthaben und Verbrauchsdaten.</li>
            <li>Ein laufendes Abo endet sofort, und deine Zahlungsmittel werden bei unserem Zahlungsdienstleister Stripe gelöscht.</li>
          </ul>
        </Section>

        <Section title="Was bleibt">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Clips, die du schon auf YouTube, Instagram oder TikTok veröffentlicht hast. Sie gehören zu deinem Kanal —
              lösche sie bei Bedarf direkt auf der Plattform.
            </li>
            <li>
              Rechnungen und Zahlungsbelege, solange Steuer- und Handelsrecht es verlangen. Sie liegen bei Stripe und
              werden für nichts anderes verwendet.
            </li>
            <li>
              Videos, die du in einem Browser hochgeladen hast, liegen dort zusätzlich im Speicher des Browsers. Auf dem
              Gerät, auf dem du dein Konto löschst, entfernen wir sie mit; auf anderen Geräten löschst du die Websitedaten
              von Clyp im Browser.
            </li>
          </ul>
        </Section>

        <Section title="Nur Instagram, YouTube oder TikTok trennen">
          <p>
            In Clyp unter „Kanäle“ beim Kanal auf „Verbindung trennen“: Clyp verliert sofort den Zugriff, und die
            gespeicherten Zugangsdaten werden gelöscht.
          </p>
          <p className="mt-3">
            Du kannst den Zugriff auch bei der Plattform entziehen — bei Facebook und Instagram in den Einstellungen unter
            „Business-Integrationen“ bzw. „Apps und Websites“, bei Google unter{' '}
            <a href="https://myaccount.google.com/permissions" className="underline underline-offset-4 hover:no-underline" rel="noreferrer" target="_blank">
              myaccount.google.com/permissions
            </a>
            . Alle übrigen Daten zu deinen Kanälen löschst du mit deinem Clyp-Konto.
          </p>
        </Section>

        <Section title="In English" lang="en">
          <p>
            To delete your Clyp account and all data associated with it — including connected Instagram, YouTube and
            TikTok accounts and their access tokens — sign in, open “Konto & Daten” (Account &amp; data) and choose
            “Konto löschen” (Delete account). Deletion is immediate and permanent. To revoke Clyp’s access to Instagram
            only, disconnect the channel under “Kanäle” (Channels), or remove Clyp in your Facebook settings under
            Business Integrations.
          </p>
        </Section>
      </div>
    </main>
  )
}

function Section({ title, lang, children }: { title: string; lang?: string; children: ReactNode }) {
  return (
    <section lang={lang} className="mt-10 border-t border-foreground/10 pt-8">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 text-[15px] leading-relaxed text-pretty">{children}</div>
    </section>
  )
}
