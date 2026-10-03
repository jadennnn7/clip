'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Intent = 'login' | 'signup'

export function AuthEmailForm({ intent }: { intent: Intent }) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          intent,
          ...(intent === 'signup' && fullName.trim()
            ? { fullName: fullName.trim() }
            : {}),
        }),
      })
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(data?.error ?? 'Die Anfrage ist fehlgeschlagen.')
      }
      setSent(true)
      toast.success('Magic Link gesendet', {
        description: 'Schau in dein Postfach und öffne den Link.',
      })
    } catch (cause) {
      toast.error(intent === 'signup' ? 'Registrierung fehlgeschlagen' : 'Anmeldung fehlgeschlagen', {
        description: cause instanceof Error ? cause.message : undefined,
      })
    } finally {
      setPending(false)
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-3 text-center">
        <p className="text-sm text-muted-foreground">
          Wir haben einen Link an <span className="font-medium text-foreground">{email}</span>{' '}
          geschickt. Der Link öffnet dein Dashboard.
        </p>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setSent(false)}
        >
          Andere E-Mail verwenden
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {intent === 'signup' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="fullName">Name</Label>
          <Input
            id="fullName"
            name="fullName"
            type="text"
            placeholder="Alex Beispiel"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={80}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-Mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="du@beispiel.de"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onInput={(event) => setEmail((event.target as HTMLInputElement).value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {intent === 'signup' ? 'Konto erstellen' : 'Magic Link senden'}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        {intent === 'signup' ? (
          <>
            Schon registriert?{' '}
            <Link href="/login" className="underline underline-offset-2">
              Anmelden
            </Link>
          </>
        ) : (
          <>
            Noch kein Konto?{' '}
            <Link href="/signup" className="underline underline-offset-2">
              Registrieren
            </Link>
          </>
        )}
      </p>
    </form>
  )
}
