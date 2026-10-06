'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { deleteAccount } from '@/lib/account-client'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/auth-password'
import type { Account } from '@/lib/account'
import { useBillingUsage } from '@/stores/billing-usage-store'

/** Was mit dem Konto verschwindet — dieselbe Liste wie auf `/konto-loeschen`, nur knapper. */
const DELETED = [
  'Videos, Transkripte, Clips und Renders — auch die Dateien auf unseren Servern',
  'Verbundene Kanäle samt Zugangsdaten und alle geplanten Veröffentlichungen',
  'Brand-Kits, Guthaben und Verbrauch',
  'Ein laufendes Abo endet sofort, deine Zahlungsdaten löscht Stripe',
]

/** Anmeldung, Passwort und Kontolöschung. `account` ist `null` im Demo-Modus ohne Supabase. */
export function AccountSettings({ account }: { account: Account | null }) {
  const [deleting, setDeleting] = useState(false)

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <PageHeader
          title="Konto & Daten"
          description="Mit welcher Adresse du dich anmeldest, dein Passwort und wie du dein Konto mit allen Daten löschst."
        />

        {account ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Anmeldung</CardTitle>
                <CardDescription>Mit dieser Adresse und deinem Passwort meldest du dich bei Ocuris an.</CardDescription>
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

            <PasswordCard email={account.email} />

            <Card>
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
          <Card>
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

type PasswordField = 'current' | 'next'

/**
 * Passwort ändern — nur mit dem aktuellen, eine offene Sitzung allein reicht
 * nicht. Wer keins hat (Konto aus der Zeit des Anmeldelinks, nur Google) oder
 * es vergessen hat, bekommt einen Link, mit dem er eins festlegt.
 */
function PasswordCard({ email }: { email: string }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [pending, setPending] = useState<'change' | 'link' | null>(null)
  const [error, setError] = useState<{ field: PasswordField | 'link'; message: string } | null>(null)
  const [linkSent, setLinkSent] = useState(false)

  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    if (!current) return setError({ field: 'current', message: 'Bitte gib dein aktuelles Passwort ein.' })
    if (next.length < MIN_PASSWORD_LENGTH) {
      return setError({ field: 'next', message: `Das neue Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.` })
    }
    setPending('change')
    setError(null)
    const response = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'change', currentPassword: current, password: next }),
    }).catch(() => null)
    setPending(null)
    if (response?.ok) {
      setCurrent('')
      setNext('')
      toast.success('Passwort geändert', { description: 'Ab jetzt meldest du dich mit dem neuen Passwort an.' })
      return
    }
    const data = (await response?.json().catch(() => null)) as { error?: string } | null
    setError({
      // Falsches aktuelles Passwort gehört ans erste Feld, alles andere ans neue.
      field: response?.status === 401 ? 'current' : 'next',
      message: data?.error ?? (response ? 'Bitte versuche es erneut.' : 'Keine Verbindung zum Server. Bitte versuche es erneut.'),
    })
  }

  async function sendLink() {
    if (pending) return
    setPending('link')
    setError(null)
    const response = await fetch('/api/auth/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, kind: 'reset' }),
    }).catch(() => null)
    setPending(null)
    if (response?.ok) return setLinkSent(true)
    const data = (await response?.json().catch(() => null)) as { error?: string } | null
    setError({ field: 'link', message: data?.error ?? 'Der Link konnte nicht versendet werden. Bitte versuche es erneut.' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Passwort</CardTitle>
        <CardDescription>Ändere das Passwort, mit dem du dich anmeldest.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={(event) => void change(event)} noValidate className="grid max-w-sm gap-4">
          {/* Für Passwort-Manager: zu welchem Konto das Passwort gehört. */}
          <input type="email" autoComplete="username" value={email} readOnly hidden />
          <PasswordInput
            id="current-password"
            label="Aktuelles Passwort"
            autoComplete="current-password"
            value={current}
            onChange={(value) => { setCurrent(value); if (error?.field === 'current') setError(null) }}
            error={error?.field === 'current' ? error.message : null}
            disabled={pending !== null}
          />
          <PasswordInput
            id="new-password"
            label="Neues Passwort"
            autoComplete="new-password"
            placeholder={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}
            value={next}
            onChange={(value) => { setNext(value); if (error?.field === 'next') setError(null) }}
            error={error?.field === 'next' ? error.message : null}
            disabled={pending !== null}
          />
          <div>
            <Button type="submit" disabled={pending !== null} aria-busy={pending === 'change'}>
              {pending === 'change' ? <><LoaderCircle className="animate-spin" />Wird gespeichert …</> : 'Passwort ändern'}
            </Button>
          </div>
        </form>

        <p className="border-t pt-4 text-sm text-pretty text-muted-foreground">
          {linkSent ? (
            <>Ein Link ist unterwegs an <span className="font-medium text-foreground">{email}</span>. Damit legst du ein neues Passwort fest.</>
          ) : (
            <>
              Noch kein Passwort oder vergessen?{' '}
              <button
                type="button"
                onClick={() => void sendLink()}
                disabled={pending !== null}
                className="rounded-sm text-foreground underline underline-offset-4 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
              >
                {pending === 'link' ? 'Wird gesendet …' : 'Link zum Festlegen schicken'}
              </button>
            </>
          )}
        </p>
        {error?.field === 'link' ? <p role="alert" className="text-sm text-pretty text-destructive">{error.message}</p> : null}
      </CardContent>
    </Card>
  )
}

function PasswordInput({ id, label, autoComplete, placeholder, value, onChange, error, disabled }: {
  id: string
  label: string
  autoComplete: 'current-password' | 'new-password'
  placeholder?: string
  value: string
  onChange: (value: string) => void
  error: string | null
  disabled: boolean
}) {
  return (
    <label htmlFor={id} className="block text-xs text-muted-foreground">
      {label}
      <Input
        id={id}
        type="password"
        autoComplete={autoComplete}
        maxLength={MAX_PASSWORD_LENGTH}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="mt-2 h-10 text-foreground"
      />
      {error ? <span id={`${id}-error`} role="alert" className="mt-1.5 block text-sm text-pretty text-destructive">{error}</span> : null}
    </label>
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
