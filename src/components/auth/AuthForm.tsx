'use client'

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, CircleAlert, CircleCheck, Eye, EyeOff, Loader2, MailCheck, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/auth-password'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export type AuthIntent = 'login' | 'signup'

/** Ein Hinweis, den die Seite beim Laden aus der Adresse ableitet. */
export interface AuthNotice {
  tone: 'info' | 'error'
  title: string
  text: string
}

type Field = 'name' | 'email' | 'password' | 'form' | 'google'

const FIELD = cn(
  'glass-field mt-2 h-11 w-full rounded-xl px-3.5 text-[15px] text-white outline-none',
  'transition-[box-shadow] duration-200 placeholder:text-white/30',
  'focus-visible:ring-2 focus-visible:ring-white/35',
  'aria-invalid:ring-2 aria-invalid:ring-destructive/60',
)

/** Supabase lässt pro Adresse etwa eine Mail pro Minute zu. */
const RESEND_SECONDS = 60

/**
 * Warum der Server abgelehnt hat (`lib/server/auth-limits.ts`): `cooldown` —
 * an die Adresse ging gerade eine Mail; `email_limit` — Mails sind gerade
 * ausgelastet, Google geht trotzdem.
 */
type Reason = 'cooldown' | 'email_limit' | 'requests'

class FieldFailure extends Error {
  constructor(readonly field: Field, message: string, readonly reason?: Reason, readonly retryAfter?: number) {
    super(message)
  }
}

type FailureBody = { error?: string; reason?: Reason; retryAfter?: number }

const OFFLINE = 'Keine Verbindung zum Server. Prüfe deine Internetverbindung und versuche es erneut.'
const FAILED = 'Die Anfrage ist fehlgeschlagen. Bitte versuche es erneut.'

/** `reset`: Link zum Zurücksetzen des Passworts. `confirm`: Bestätigungsmail erneut. */
type MailKind = 'reset' | 'confirm'

async function requestMail(email: string, kind: MailKind): Promise<void> {
  const response = await fetch('/api/auth/mail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, kind }),
  }).catch(() => null)
  if (!response) throw new FieldFailure('email', OFFLINE)
  if (response.ok) return
  const data = (await response.json().catch(() => null)) as FailureBody | null
  throw new FieldFailure('email', data?.error ?? FAILED, data?.reason, data?.retryAfter)
}

/** `signedIn`: weiter ins Dashboard. `confirm`: Bestätigungslink ist unterwegs. */
async function submitPassword(body: Record<string, string>): Promise<'signedIn' | 'confirm'> {
  const response = await fetch('/api/auth/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null)
  if (!response) throw new FieldFailure('form', OFFLINE)
  const data = (await response.json().catch(() => null)) as ({ signedIn?: boolean; confirm?: boolean } & FailureBody) | null
  if (response.ok) return data?.signedIn ? 'signedIn' : 'confirm'
  // Vergebene Adresse gehört ans E-Mail-Feld, falsche Zugangsdaten ans Passwort.
  const field = response.status === 409 ? 'email' : response.status >= 500 || response.status === 429 ? 'form' : 'password'
  throw new FieldFailure(field, data?.error ?? FAILED, data?.reason, data?.retryAfter)
}

/** Nach der Anmeldung dorthin, wo man hinwollte — nur Pfade auf dieser Seite. */
function destination(): string {
  const target = new URLSearchParams(window.location.search).get('redirect')
  return target && target.startsWith('/') && !target.startsWith('//') ? target : '/dashboard'
}

/**
 * Anmelden und Registrieren: mit Google oder mit E-Mail und Passwort. Einen
 * Anmeldelink ohne Passwort gibt es nicht; wer sein Passwort vergessen hat,
 * bekommt einen Link, mit dem er ein neues festlegt.
 *
 * Fehler stehen am Feld, nicht in einem Toast: Dort schaut man hin, und sie
 * verschwinden nicht, bevor man sie gelesen hat. Die Registrierung fragt
 * zusätzlich nach dem Namen — Sidebar und Begrüßung zeigen sonst nur den
 * Teil der Mail-Adresse vor dem @. Geht eine Mail hinaus (Bestätigung oder
 * Zurücksetzen), ersetzt die Bestätigung das Formular — mit der Adresse und
 * einem zweiten Versuch, sobald Supabase ihn zulässt.
 */
export function AuthForm({
  intent,
  notice,
  freeAllowance,
}: {
  intent: AuthIntent
  notice: AuthNotice | null
  freeAllowance: string
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // Nur beim Anmelden: mit Passwort oder — vergessen — Link zum Zurücksetzen.
  const [method, setMethod] = useState<'password' | 'reset'>('password')
  const [pending, setPending] = useState<'form' | 'google' | null>(null)
  // `google`: der Ausweg, wenn Bestätigungsmails gerade nicht rausgehen — ein Klick statt suchen.
  const [error, setError] = useState<{ field: Field; message: string; google?: boolean } | null>(null)
  const [sent, setSent] = useState<{ to: string; kind: MailKind } | null>(null)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(0)
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const isSignup = intent === 'signup'
  const usesPassword = isSignup || method === 'password'

  // Der Hinweis kam mit der Adresse; beim Neuladen soll er nicht wiederkommen.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('signed_out') && !url.searchParams.has('error')) return
    url.searchParams.delete('signed_out')
    url.searchParams.delete('error')
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
  }, [])

  useEffect(() => {
    if (!resendAt) return
    const timer = window.setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= resendAt) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [resendAt])

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000))

  function fail(cause: unknown) {
    const failure = cause instanceof FieldFailure ? cause : null
    const field = failure?.field ?? 'form'
    const message = cause instanceof Error && cause.message ? cause.message : FAILED
    // Bestätigungsmails ausgelastet: Mit Google klappt die Registrierung ohne Mail.
    const google = failure?.reason === 'email_limit' && isSignup
    setError({ field, message, google })
    // Gerade erst gesendet: Der Knopf zählt herunter, statt erneut abgelehnt zu werden.
    if (failure?.reason === 'cooldown' && failure.retryAfter) startResendTimer(failure.retryAfter)
    // Zurück ins Feld, damit man es gleich korrigieren kann.
    if (field === 'email' && !google) emailRef.current?.focus()
    if (field === 'password') passwordRef.current?.focus()
  }

  function startResendTimer(seconds = RESEND_SECONDS) {
    const sentAt = Date.now()
    setNow(sentAt)
    setResendAt(sentAt + seconds * 1000)
  }

  const errorAction = () => error?.google
    ? <GoogleFallback onClick={() => void continueWithGoogle()} />
    : null

  async function sendMail(address: string, kind: MailKind) {
    setPending('form')
    setError(null)
    try {
      await requestMail(address, kind)
      setSent({ to: address, kind })
      startResendTimer()
    } catch (cause) {
      fail(cause)
    } finally {
      setPending(null)
    }
  }

  async function sendPassword(address: string) {
    setPending('form')
    setError(null)
    try {
      const result = await submitPassword(
        isSignup
          ? { intent, email: address, password, fullName: name.trim() }
          : { intent, email: address, password },
      )
      if (result === 'signedIn') {
        // Voller Seitenwechsel: Der Server liest die frischen Session-Cookies.
        window.location.assign(destination())
        return
      }
      setSent({ to: address, kind: 'confirm' })
      startResendTimer()
      setPending(null)
    } catch (cause) {
      fail(cause)
      setPending(null)
    }
  }

  async function continueWithGoogle() {
    if (pending) return
    setPending('google')
    setError(null)
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !key) throw new Error('Die Anmeldung ist noch nicht eingerichtet.')
      // Ohne freigeschalteten Anbieter zeigte Supabase eine nackte JSON-Fehlerseite.
      const settings = (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null)) as { external?: { google?: boolean } } | null
      if (settings?.external?.google === false) {
        throw new Error('Die Anmeldung mit Google ist noch nicht eingerichtet. Nutze bis dahin deine E-Mail-Adresse.')
      }
      const { error: oauthError } = await createClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      if (oauthError) throw new Error('Die Anmeldung mit Google ließ sich nicht starten. Bitte versuche es erneut.')
      // Die Seite wechselt jetzt zu Google; der Knopf bleibt im Ladezustand.
    } catch (cause) {
      setError({ field: 'google', message: cause instanceof Error ? cause.message : 'Die Anmeldung mit Google ließ sich nicht starten.' })
      setPending(null)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const address = email.trim()
    if (pending) return
    if (isSignup && !name.trim()) {
      setError({ field: 'name', message: 'Bitte gib deinen Namen ein.' })
      nameRef.current?.focus()
      return
    }
    if (!address) {
      setError({ field: 'email', message: 'Bitte gib deine E-Mail-Adresse ein.' })
      emailRef.current?.focus()
      return
    }
    if (!usesPassword) {
      void sendMail(address, 'reset')
      return
    }
    if (!password) {
      setError({ field: 'password', message: 'Bitte gib dein Passwort ein.' })
      passwordRef.current?.focus()
      return
    }
    if (isSignup && password.length < MIN_PASSWORD_LENGTH) {
      setError({ field: 'password', message: `Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.` })
      passwordRef.current?.focus()
      return
    }
    void sendPassword(address)
  }

  function switchMethod(next: 'password' | 'reset') {
    setMethod(next)
    setError(null)
  }

  if (sent) {
    const confirm = sent.kind === 'confirm'
    return (
      <div className="w-full max-w-sm">
        <div className="text-center">
          <span className="glass-tile mx-auto flex size-12 items-center justify-center rounded-2xl">
            <MailCheck className="size-5 text-white" aria-hidden />
          </span>
          <h1 className="mt-6 font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.03em]">
            {confirm ? 'Bestätige deine E-Mail' : 'Prüfe dein Postfach'}
          </h1>
          <p className="mt-2.5 text-[15px] leading-6 text-pretty text-white/60">
            {confirm ? 'Wir haben einen Bestätigungslink an' : 'Falls es ein Konto mit'}{' '}
            <span className="font-medium break-all text-white">{sent.to}</span>{' '}
            {confirm
              ? 'geschickt. Ein Klick darauf, und dein Konto ist bereit.'
              : 'gibt, ist ein Link zum Zurücksetzen unterwegs. Öffne ihn in diesem Browser und leg ein neues Passwort fest.'}
          </p>
        </div>

        {error ? <FieldError id="resend-error">{error.message}</FieldError> : null}
        {errorAction()}

        <div className="mt-8 flex flex-col gap-2.5">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-xl text-[15px]"
            disabled={pending !== null || secondsLeft > 0}
            onClick={() => void sendMail(sent.to, sent.kind)}
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCw className="size-4" aria-hidden />}
            {secondsLeft > 0 ? `Erneut senden in ${secondsLeft} s` : 'Link erneut senden'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full rounded-xl text-[15px] text-white/70"
            onClick={() => {
              setSent(null)
              setError(null)
              if (!confirm) setMethod('password')
            }}
          >
            {confirm ? 'Andere E-Mail-Adresse verwenden' : 'Zurück zur Anmeldung'}
          </Button>
        </div>

        <p className="mt-8 text-center text-xs leading-5 text-white/45">
          Keine Mail bekommen? Schau im Spam-Ordner nach.
          <br />
          Es gilt immer nur der zuletzt gesendete Link.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm">
      {notice ? <Notice notice={notice} /> : null}

      <h1 className="font-display text-[2rem] leading-tight font-semibold tracking-[-0.03em]">
        {isSignup ? 'Konto erstellen' : 'Willkommen zurück'}
      </h1>
      <p className="mt-2.5 text-[15px] leading-6 text-pretty text-white/60">
        {isSignup
          ? `Starte kostenlos mit ${freeAllowance}. Keine Kreditkarte nötig.`
          : 'Melde dich mit Google oder mit deiner E-Mail-Adresse an.'}
      </p>

      <Button
        type="button"
        variant="outline"
        className="mt-8 h-11 w-full gap-2.5 rounded-xl text-[15px]"
        disabled={pending !== null}
        aria-busy={pending === 'google'}
        onClick={() => void continueWithGoogle()}
      >
        {pending === 'google' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <GoogleMark />}
        Mit Google fortfahren
      </Button>
      {error?.field === 'google' ? <FieldError id="google-error">{error.message}</FieldError> : null}

      <div className="my-6 flex items-center gap-3 text-xs text-white/40" aria-hidden>
        <span className="h-px flex-1 bg-white/10" />
        oder mit E-Mail
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {isSignup ? (
          <div className="mb-5">
            <label htmlFor="name" className="text-sm font-medium text-white/85">
              Name
            </label>
            <input
              ref={nameRef}
              id="name"
              type="text"
              autoComplete="name"
              maxLength={80}
              required
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                if (error?.field === 'name') setError(null)
              }}
              placeholder="Vor- und Nachname"
              aria-invalid={error?.field === 'name' ? true : undefined}
              aria-describedby={error?.field === 'name' ? 'name-error' : undefined}
              className={FIELD}
            />
            {error?.field === 'name' ? <FieldError id="name-error">{error.message}</FieldError> : null}
          </div>
        ) : null}

        <label htmlFor="email" className="text-sm font-medium text-white/85">
          E-Mail-Adresse
        </label>
        <input
          ref={emailRef}
          id="email"
          type="email"
          inputMode="email"
          autoComplete={isSignup ? 'email' : 'username'}
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            if (error?.field === 'email') setError(null)
          }}
          placeholder="name@beispiel.de"
          aria-invalid={error?.field === 'email' ? true : undefined}
          aria-describedby={error?.field === 'email' ? 'email-error' : undefined}
          className={FIELD}
        />
        {error?.field === 'email' ? <FieldError id="email-error">{error.message}</FieldError> : null}
        {error?.field === 'email' ? errorAction() : null}

        {usesPassword ? (
          <div className="mt-5">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="password" className="text-sm font-medium text-white/85">
                Passwort
              </label>
              {!isSignup ? (
                <button
                  type="button"
                  onClick={() => switchMethod('reset')}
                  className="rounded-sm text-xs text-white/55 underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  Passwort vergessen?
                </button>
              ) : null}
            </div>
            <div className="relative">
              <input
                ref={passwordRef}
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                minLength={isSignup ? MIN_PASSWORD_LENGTH : undefined}
                maxLength={MAX_PASSWORD_LENGTH}
                required
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (error?.field === 'password') setError(null)
                }}
                placeholder={isSignup ? `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen` : 'Dein Passwort'}
                aria-invalid={error?.field === 'password' ? true : undefined}
                aria-describedby={error?.field === 'password' ? 'password-error' : undefined}
                className={cn(FIELD, 'pr-11')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                aria-pressed={showPassword}
                className="absolute top-1/2 right-1.5 mt-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-white/45 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/50"
              >
                {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </div>
            {error?.field === 'password' ? <FieldError id="password-error">{error.message}</FieldError> : null}
          </div>
        ) : (
          <p className="mt-3 text-[13px] leading-5 text-pretty text-white/55">
            Wir schicken dir einen Link, mit dem du ein neues Passwort festlegst.
          </p>
        )}

        {error?.field === 'form' ? <FieldError id="form-error">{error.message}</FieldError> : null}
        {error?.field === 'form' ? errorAction() : null}

        <Button
          type="submit"
          variant="prominent"
          className="mt-5 h-11 w-full rounded-xl text-[15px]"
          // Gerade erst ein Link raus: Supabase lehnt bis zum Ablauf ohnehin ab.
          disabled={pending !== null || (!usesPassword && secondsLeft > 0)}
          aria-busy={pending === 'form'}
        >
          {pending === 'form' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending === 'form'
            ? usesPassword ? 'Einen Moment …' : 'Wird gesendet …'
            : isSignup ? 'Kostenlos registrieren' : usesPassword ? 'Anmelden'
              : secondsLeft > 0 ? `Neuer Link in ${secondsLeft} s` : 'Link zum Zurücksetzen senden'}
          {pending === 'form' || (!usesPassword && secondsLeft > 0) ? null : <ArrowRight className="size-4" aria-hidden />}
        </Button>
      </form>

      {!isSignup ? (
        method === 'reset' ? (
          <p className="mt-5 text-center text-[13px] text-white/55">
            <button
              type="button"
              onClick={() => switchMethod('password')}
              className="rounded-sm underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-white/50"
            >
              Zurück zur Anmeldung mit Passwort
            </button>
          </p>
        ) : null
      ) : (
        <p className="mt-6 text-center text-xs leading-5 text-pretty text-white/45">
          Für Ocuris gelten die{' '}
          <Link href="/agb" className="underline underline-offset-4 hover:text-white">
            Nutzungsbedingungen
          </Link>
          .{' '}
          Wie wir mit deinen Daten umgehen, steht in der{' '}
          <Link href="/datenschutz" className="underline underline-offset-4 hover:text-white">
            Datenschutzerklärung
          </Link>
          .
        </p>
      )}
    </div>
  )
}

/** Das „G" in den Google-Farben — so verlangen es Googles Vorgaben für Anmeldeknöpfe. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function Notice({ notice }: { notice: AuthNotice }) {
  const error = notice.tone === 'error'
  return (
    <div
      role={error ? 'alert' : 'status'}
      className="glass-tile mb-8 flex items-start gap-3 rounded-xl px-4 py-3.5"
    >
      {error ? (
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      ) : (
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
      )}
      <div>
        <p className="text-sm font-medium text-white">{notice.title}</p>
        <p className="mt-0.5 text-[13px] leading-5 text-pretty text-white/60">{notice.text}</p>
      </div>
    </div>
  )
}

/** Der Ausweg unter der Fehlermeldung, wenn Bestätigungsmails gerade nicht rausgehen. */
function GoogleFallback({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg bg-white/[0.08] px-3 text-[13px] font-medium text-white outline-none transition-colors hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-white/50"
    >
      <GoogleMark />Mit Google fortfahren
      <ArrowRight className="size-3.5" aria-hidden />
    </button>
  )
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-2 flex items-start gap-1.5 text-[13px] leading-5 text-destructive">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  )
}

/**
 * Neues Passwort festlegen — das Ziel des Links nach „Passwort vergessen?".
 *
 * Der Link hat schon angemeldet; hier wird nur noch das Passwort gesetzt.
 * Danach geht es ins Dashboard, wie nach jeder Anmeldung.
 */
export function NewPasswordForm({ email }: { email: string }) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`)
      passwordRef.current?.focus()
      return
    }
    setPending(true)
    setError(null)
    try {
      await submitPassword({ intent: 'update', password })
      // Voller Seitenwechsel wie nach der Anmeldung: Der Server liest die frischen Session-Cookies.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/dashboard')
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : FAILED)
      setPending(false)
      passwordRef.current?.focus()
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-display text-[2rem] leading-tight font-semibold tracking-[-0.03em]">Neues Passwort</h1>
      <p className="mt-2.5 text-[15px] leading-6 text-pretty text-white/60">
        Leg ein neues Passwort für <span className="font-medium break-all text-white">{email}</span> fest. Damit meldest du dich ab jetzt an.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-8">
        {/* Für Passwort-Manager: zu welchem Konto das neue Passwort gehört. */}
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        <label htmlFor="new-password" className="text-sm font-medium text-white/85">
          Neues Passwort
        </label>
        <div className="relative">
          <input
            ref={passwordRef}
            id="new-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            required
            autoFocus
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setError(null)
            }}
            placeholder={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'new-password-error' : undefined}
            className={cn(FIELD, 'pr-11')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            aria-pressed={showPassword}
            className="absolute top-1/2 right-1.5 mt-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-white/45 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/50"
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        {error ? <FieldError id="new-password-error">{error}</FieldError> : null}

        <Button
          type="submit"
          variant="prominent"
          className="mt-5 h-11 w-full rounded-xl text-[15px]"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? 'Wird gespeichert …' : 'Passwort speichern'}
          {pending ? null : <ArrowRight className="size-4" aria-hidden />}
        </Button>
      </form>
    </div>
  )
}
