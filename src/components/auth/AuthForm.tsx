'use client'

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, CircleAlert, CircleCheck, Loader2, MailCheck, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type AuthIntent = 'login' | 'signup'

/** Ein Hinweis, den die Seite beim Laden aus der Adresse ableitet. */
export interface AuthNotice {
  tone: 'info' | 'error'
  title: string
  text: string
}

const FIELD = cn(
  'glass-field mt-2 h-11 w-full rounded-xl px-3.5 text-[15px] text-white outline-none',
  'transition-[box-shadow] duration-200 placeholder:text-white/30',
  'focus-visible:ring-2 focus-visible:ring-white/35',
  'aria-invalid:ring-2 aria-invalid:ring-destructive/60',
)

/** Supabase lässt pro Adresse etwa eine Mail pro Minute zu. */
const RESEND_SECONDS = 60

async function requestLink(email: string, intent: AuthIntent, fullName?: string): Promise<void> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, intent, ...(fullName ? { fullName } : {}) }),
  }).catch(() => null)
  if (!response) throw new Error('Keine Verbindung zum Server. Prüfe deine Internetverbindung und versuche es erneut.')
  if (response.ok) return
  const data = (await response.json().catch(() => null)) as { error?: string } | null
  throw new Error(data?.error ?? 'Die Anfrage ist fehlgeschlagen. Bitte versuche es erneut.')
}

/**
 * Anmelden und Registrieren per Magic Link.
 *
 * Fehler stehen am Feld, nicht in einem Toast: Dort schaut man hin, und sie
 * verschwinden nicht, bevor man sie gelesen hat. Die Registrierung fragt
 * zusätzlich nach dem Namen — Sidebar und Begrüßung zeigen sonst nur den
 * Teil der Mail-Adresse vor dem @. Nach dem Senden ersetzt die
 * Bestätigung das Formular — mit der Adresse, an die der Link ging, und
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
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<{ field: 'name' | 'email'; message: string } | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(0)
  const nameRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isSignup = intent === 'signup'

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

  async function send(address: string) {
    setPending(true)
    setError(null)
    try {
      await requestLink(address, intent, isSignup ? name.trim() : undefined)
      const sentAt = Date.now()
      setSentTo(address)
      setNow(sentAt)
      setResendAt(sentAt + RESEND_SECONDS * 1000)
    } catch (cause) {
      setError({ field: 'email', message: cause instanceof Error ? cause.message : 'Die Anfrage ist fehlgeschlagen. Bitte versuche es erneut.' })
      // Zurück ins Feld, damit man die Adresse gleich korrigieren kann.
      inputRef.current?.focus()
    } finally {
      setPending(false)
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
      inputRef.current?.focus()
      return
    }
    void send(address)
  }

  if (sentTo) {
    return (
      <div className="w-full max-w-sm">
        <div className="text-center">
          <span className="glass-tile mx-auto flex size-12 items-center justify-center rounded-2xl">
            <MailCheck className="size-5 text-white" aria-hidden />
          </span>
          <h1 className="mt-6 font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.03em]">
            Prüfe dein Postfach
          </h1>
          <p className="mt-2.5 text-[15px] leading-6 text-pretty text-white/60">
            Wir haben einen Anmeldelink an{' '}
            <span className="font-medium break-all text-white">{sentTo}</span>{' '}
            geschickt. Öffne ihn in diesem Browser.
          </p>
        </div>

        {error ? <FieldError id="resend-error">{error.message}</FieldError> : null}

        <div className="mt-8 flex flex-col gap-2.5">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-xl text-[15px]"
            disabled={pending || secondsLeft > 0}
            onClick={() => void send(sentTo)}
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCw className="size-4" aria-hidden />}
            {secondsLeft > 0 ? `Erneut senden in ${secondsLeft} s` : 'Link erneut senden'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full rounded-xl text-[15px] text-white/70"
            onClick={() => {
              setSentTo(null)
              setError(null)
            }}
          >
            Andere E-Mail-Adresse verwenden
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
          : 'Melde dich mit deiner E-Mail-Adresse an. Wir schicken dir einen Anmeldelink – ein Passwort brauchst du nicht.'}
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-8">
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
          ref={inputRef}
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
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

        <Button
          type="submit"
          variant="prominent"
          className="mt-5 h-11 w-full rounded-xl text-[15px]"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? 'Wird gesendet …' : isSignup ? 'Kostenlos registrieren' : 'Anmeldelink senden'}
          {pending ? null : <ArrowRight className="size-4" aria-hidden />}
        </Button>
      </form>

      {isSignup ? (
        <p className="mt-6 text-center text-xs leading-5 text-pretty text-white/45">
          Wie wir mit deinen Daten umgehen, steht in der{' '}
          <Link href="/datenschutz" className="underline underline-offset-4 hover:text-white">
            Datenschutzerklärung
          </Link>
          .
        </p>
      ) : null}
    </div>
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

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-2 flex items-start gap-1.5 text-[13px] leading-5 text-destructive">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  )
}
