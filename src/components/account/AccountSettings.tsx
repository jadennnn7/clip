'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LoaderCircle } from 'lucide-react'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { deleteAccount } from '@/lib/account-client'
import type { Account } from '@/lib/account'
import { useBillingUsage } from '@/stores/billing-usage-store'

/** Was mit dem Konto verschwindet — dieselbe Liste wie auf `/konto-loeschen`, nur knapper. */
const DELETED = [
  'Videos, Transkripte, Clips und Renders — auch die Dateien auf unseren Servern',
  'Verbundene Kanäle samt Zugangsdaten und alle geplanten Veröffentlichungen',
  'Brand-Kits, Guthaben und Verbrauch',
  'Ein laufendes Abo endet sofort, deine Zahlungsdaten löscht Stripe',
]

/** Anmeldung und Kontolöschung. `account` ist `null` im Demo-Modus ohne Supabase. */
export function AccountSettings({ account }: { account: Account | null }) {
  const [deleting, setDeleting] = useState(false)

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <PageHeader
          title="Konto & Daten"
          description="Mit welcher Adresse du angemeldet bist und wie du dein Konto mit allen Daten löschst."
        />

        {account ? (
          <div className="space-y-6">
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle className="text-base">Anmeldung</CardTitle>
                <CardDescription>Clyp schickt dir zum Anmelden einen Link an diese Adresse.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[8rem_1fr]">
                  {account.fullName ? (
                    <>
                      <dt className="text-muted-foreground">Name</dt>
                      <dd className="min-w-0 truncate">{account.fullName}</dd>
                    </>
                  ) : null}
                  <dt className="text-muted-foreground">E-Mail-Adresse</dt>
                  <dd className="min-w-0 truncate">{account.email}</dd>
                </dl>
              </CardContent>
            </Card>

            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle className="text-base">Konto löschen</CardTitle>
                <CardDescription>
                  Löscht dein Konto und alle Daten dazu, sofort und endgültig. Das lässt sich nicht rückgängig machen.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-pretty">
                  {DELETED.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <p className="text-sm text-pretty text-muted-foreground">
                  Bereits veröffentlichte Clips bleiben auf YouTube, Instagram und TikTok. Rechnungen bewahren wir auf,
                  solange das Gesetz es verlangt.{' '}
                  <Link href="/konto-loeschen" className="text-foreground underline underline-offset-4 hover:no-underline">
                    Mehr zur Datenlöschung
                  </Link>
                </p>
                <Button variant="destructive" onClick={() => setDeleting(true)}>Konto löschen …</Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle className="text-base">Demo-Modus</CardTitle>
              <CardDescription>
                Ohne Anmeldung gibt es kein Konto. Deine Projekte liegen nur in diesem Browser — du löschst sie, indem du
                die Websitedaten des Browsers für diese Seite löschst.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      {account ? <DeleteAccountDialog email={account.email} open={deleting} onClose={() => setDeleting(false)} /> : null}
    </ScrollArea>
  )
}

/**
 * Bestätigung mit der eigenen E-Mail-Adresse: Ein Klick allein soll kein
 * Konto löschen. Solange der Server arbeitet, lässt sich der Dialog nicht
 * schließen — die Antwort entscheidet, ob das Konto noch besteht.
 */
function DeleteAccountDialog({ email, open, onClose }: { email: string; open: boolean; onClose: () => void }) {
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const subscribed = useBillingUsage((state) => (state.usage?.monthlyCredits ?? 0) > 0)
  const confirmed = typed.trim().toLowerCase() === email.toLowerCase()

  const close = () => {
    if (pending) return
    setTyped('')
    setError(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
      <DialogContent showCloseButton={!pending} className="sm:max-w-md">
        <DialogTitle>Konto endgültig löschen?</DialogTitle>
        <DialogDescription>
          Alle Videos, Clips, Kanäle und dein Guthaben werden sofort gelöscht{subscribed ? ', und dein Abo endet' : ''}.
          Lade Clips, die du behalten willst, vorher herunter.
        </DialogDescription>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!confirmed || pending) return
            setPending(true)
            setError(null)
            // Bei Erfolg lädt die Bestätigungsseite; zurück kommt man nur bei einem Fehler.
            deleteAccount(typed).catch((cause) => {
              setPending(false)
              setError(cause instanceof Error ? cause.message : 'Bitte versuche es erneut.')
            })
          }}
        >
          <label className="block text-xs text-muted-foreground">
            Gib zur Bestätigung <span className="font-medium text-foreground">{email}</span> ein
            <Input
              type="email"
              autoComplete="off"
              spellCheck={false}
              disabled={pending}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="mt-2 h-10 text-foreground"
            />
          </label>
          {error ? <p role="alert" className="text-sm text-pretty text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={close}>Abbrechen</Button>
            <Button type="submit" variant="destructive" disabled={!confirmed || pending} aria-busy={pending}>
              {pending ? <><LoaderCircle className="animate-spin" />Wird gelöscht …</> : 'Konto löschen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
